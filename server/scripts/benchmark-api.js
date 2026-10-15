// Repeatable local API/network-size observation for the fixed synthetic data.
const { performance } = require('node:perf_hooks')
const app = require('../src/index')

async function measure(base, path) {
  const durations = []
  let bytes = 0
  let total = 0
  for (let i = 0; i < 11; i++) {
    const start = performance.now()
    const response = await fetch(`${base}${path}`)
    const body = await response.text()
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    if (i === 0) continue // warm-up
    durations.push(performance.now() - start)
    bytes = Buffer.byteLength(body)
    total = JSON.parse(body).data.total
  }
  durations.sort((a, b) => a - b)
  return { path, rows: total, responseBytes: bytes,
    medianMs: Math.round((durations[4] + durations[5]) / 2 * 10) / 10,
    minMs: Math.round(durations[0] * 10) / 10,
    maxMs: Math.round(durations[9] * 10) / 10 }
}

async function main() {
  const server = app.listen(0)
  await new Promise(resolve => server.once('listening', resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    console.log({ mode: process.env.DATA_MODE || 'demo', node: process.version, platform: process.platform, arch: process.arch })
    console.log(await measure(base, '/api/v1/buildings?limit=5000'))
    console.log(await measure(base, '/api/v1/buildings?bbox=120.025,30.275,120.035,30.285&limit=5000'))
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
