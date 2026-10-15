const fs = require('node:fs')
const path = require('node:path')
const { spawn, spawnSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const envFile = path.join(root, '.env.postgis.local')
if (!process.argv.includes('--demo') && fs.existsSync(envFile)) {
  // Explicitly prefer the project configuration over stale variables in a shell.
  Object.assign(process.env, require('node:util').parseEnv(fs.readFileSync(envFile, 'utf8')))
  delete process.env.DATABASE_URL
  const result = spawnSync(process.execPath, [path.join(__dirname, 'postgis-local.cjs'), 'start'], { stdio: 'inherit', windowsHide: true })
  if (result.status !== 0) process.exit(result.status || 1)
  console.log('Starting with the local PostGIS database.')
} else {
  process.env.DATA_MODE = 'demo'
  console.log('Starting with GeoJSON demo data.')
}
const child = spawn(process.execPath, [path.join(root, 'node_modules/concurrently/dist/bin/concurrently.js'),
  '-k', '-n', 'server,web', '-c', 'blue,green', 'npm run dev --prefix server', 'npm run dev --prefix web'],
{ cwd: root, env: process.env, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code || 0 })
