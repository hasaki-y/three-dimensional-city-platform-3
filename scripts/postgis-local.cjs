// Project-owned PostgreSQL instance: never changes the existing Windows database service.
const fs = require('node:fs')
const path = require('node:path')
const { randomBytes } = require('node:crypto')
const { spawnSync } = require('node:child_process')
const { Client } = require('../server/node_modules/pg')

const root = path.resolve(__dirname, '..')
const local = path.join(root, '.local')
const stateFile = path.join(local, 'postgis-instance.json')
const envFile = path.join(root, '.env.postgis.local')
const command = process.argv[2] || 'status'
if (!['init', 'start', 'stop', 'status'].includes(command)) throw new Error('Use init/start/stop/status')

function run(exe, args, acceptFailure = false) {
  // A detached Windows postmaster must not inherit captured console pipes.
  // Its logs go to the -l file; other short-lived commands can print normally.
  const result = spawnSync(exe, args, { cwd: root, windowsHide: true,
    stdio: args.includes('start') ? 'ignore' : 'inherit', timeout: 120000 })
  if (!acceptFailure && (result.error || result.status !== 0)) throw new Error(`${path.basename(exe)} failed (${result.status ?? result.error?.code})`)
  return result.status
}

async function main() {
  fs.mkdirSync(local, { recursive: true })
  let config
  if (fs.existsSync(stateFile)) config = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  else {
    if (command !== 'init') throw new Error('Run npm run db:init first')
    if (fs.existsSync(path.join(local, 'postgres'))) throw new Error('Existing database directory found without project configuration; refusing to overwrite')
    config = { bin: process.env.PG_BIN || 'C:/Program Files/PostgreSQL/16/bin',
      data: path.join(local, 'postgres'), host: '127.0.0.1', port: 55432,
      admin: 'city_admin', adminPassword: randomBytes(24).toString('hex'),
      user: 'city_app', password: randomBytes(24).toString('hex'), database: 'city_demo' }
    fs.writeFileSync(stateFile, JSON.stringify(config, null, 2), { mode: 0o600 })
  }
  // Only manage the exact project-local cluster, even if the saved file was edited.
  if (path.resolve(config.data) !== path.join(local, 'postgres') || config.host !== '127.0.0.1' || config.port !== 55432) {
    throw new Error('Unexpected database location or endpoint; refusing to manage another instance')
  }
  const executable = name => path.join(config.bin, `${name}.exe`)
  if (!fs.existsSync(executable('pg_ctl'))) throw new Error('PostgreSQL binaries missing; set PG_BIN before db:init')
  const versionFile = path.join(config.data, 'PG_VERSION')
  if (command === 'init' && !fs.existsSync(versionFile)) {
    const pwfile = path.join(local, 'initdb-password.tmp')
    fs.writeFileSync(pwfile, config.adminPassword + '\n', { mode: 0o600 })
    try {
      run(executable('initdb'), ['-D', config.data, '-U', config.admin, '--encoding=UTF8', '--no-locale',
        '--auth=scram-sha-256', `--pwfile=${pwfile}`])
    } finally { if (fs.existsSync(pwfile)) fs.unlinkSync(pwfile) }
    fs.appendFileSync(path.join(config.data, 'postgresql.conf'),
      "\n# Project-local city database\nlisten_addresses = '127.0.0.1'\nport = 55432\nmax_connections = 40\nshared_buffers = '128MB'\ntimezone = 'Asia/Shanghai'\n")
  }
  if (!fs.existsSync(versionFile)) throw new Error('Cluster has not been initialized')
  const ctl = args => run(executable('pg_ctl'), ['-D', config.data, ...args])
  const running = run(executable('pg_ctl'), ['-D', config.data, 'status'], true) === 0
  if (command === 'status') { console.log(`Project database: ${running ? 'running' : 'stopped'} at ${config.host}:${config.port}`); return }
  if (command === 'stop') { if (running) ctl(['stop', '-m', 'fast', '-w', '-t', '30']); return }
  if (!running) ctl(['start', '-l', path.join(local, 'postgres.log'), '-w', '-t', '30'])
  if (command === 'start') return

  const options = { host: config.host, port: config.port, user: config.admin, password: config.adminPassword, connectionTimeoutMillis: 5000 }
  const client = new Client({ ...options, database: 'postgres' })
  await client.connect()
  try {
    // Windows PG can expose ANSI Chinese paths through SHOW as invalid UTF-8.
    // Match the cluster's unique identifier to the control file in our exact local directory instead.
    const control = spawnSync(executable('pg_controldata'), ['-D', config.data], { windowsHide: true, encoding: 'utf8' })
    const expectedId = control.stdout?.match(/Database system identifier:\s+(\d+)/)?.[1]
    const actualId = (await client.query('SELECT system_identifier::text AS id FROM pg_control_system()')).rows[0].id
    if (control.status !== 0 || !expectedId || actualId !== expectedId) throw new Error('Connected to an unexpected database instance')
    if (!/^[a-f0-9]{48}$/.test(config.password)) throw new Error('Unexpected generated password format')
    if (!(await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [config.user])).rowCount) {
      await client.query(`CREATE ROLE city_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${config.password}'`)
    }
    if (!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1', [config.database])).rowCount) {
      await client.query('CREATE DATABASE city_demo OWNER city_app ENCODING \'UTF8\'')
    }
  } finally { await client.end() }
  const db = new Client({ ...options, database: config.database })
  await db.connect()
  try {
    await db.query('CREATE EXTENSION IF NOT EXISTS postgis')
    console.log('PostGIS enabled:', (await db.query('SELECT postgis_version() AS version')).rows[0].version)
  } finally { await db.end() }
  if (!fs.existsSync(envFile)) {
    fs.writeFileSync(envFile, ['# Local credentials: excluded from Git', 'DATA_MODE=postgis',
      `PGHOST=${config.host}`, `PGPORT=${config.port}`, `PGUSER=${config.user}`, `PGPASSWORD=${config.password}`,
      `PGDATABASE=${config.database}`, 'PORT=3103', 'WEB_PORT=5176', 'API_PROXY_TARGET=http://127.0.0.1:3103', ''].join('\n'), { mode: 0o600 })
  }
  console.log('Project database ready. Credentials saved locally (not printed).')
  console.log('Next: npm run db:import:local (resets only the four teaching tables).')
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
