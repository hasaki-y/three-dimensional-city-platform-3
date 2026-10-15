const test = require('node:test')
const assert = require('node:assert/strict')
process.env.DATA_MODE = 'demo'
const app = require('../src/index')

async function withServer(run) {
  const server = app.listen(0)
  try {
    await new Promise(resolve => server.once('listening', resolve))
    await run(`http://127.0.0.1:${server.address().port}`)
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

test('BBOX limits the actual data returned and invalid bounds return 400', async () => {
  await withServer(async base => {
    const valid = await fetch(`${base}/api/v1/buildings?bbox=120.025,30.275,120.03,30.28&limit=20`)
    assert.equal(valid.status, 200)
    const { data } = await valid.json()
    assert.ok(data.total > 0)
    assert.ok(data.items.length <= 20)
    for (const building of data.items) {
      assert.ok(building.lon >= 120.025 && building.lon <= 120.03)
      assert.ok(building.lat >= 30.275 && building.lat <= 30.28)
    }
    const invalid = await fetch(`${base}/api/v1/buildings?bbox=120.03,30.28,120.025,30.275`)
    assert.equal(invalid.status, 400)
    assert.equal((await invalid.json()).error.code, 'INVALID_BBOX')
  })
})

test('emergency analysis returns a bounded, internally consistent result', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/v1/analysis/emergency`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lon: 120.028, lat: 30.277, radiusMeters: 300, facilityType: '医院', eventType: '事故' }),
    })
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.equal(data.impactArea.type, 'Polygon')
    assert.ok(data.affectedTotal > 0)
    assert.ok(data.affectedBuildings.length <= 500)
    assert.equal(data.statistics.byType.reduce((sum, item) => sum + item.count, 0), data.affectedTotal)
    assert.ok(data.nearbyFacilities.length <= 50)
    assert.ok(data.nearestFacilities.length <= 5)
    const bad = await fetch(`${base}/api/v1/analysis/emergency`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lon: 120.028, lat: 30.277, radiusMeters: 500000, eventType: '事故' }),
    })
    assert.equal(bad.status, 400)
    assert.equal((await bad.json()).error.code, 'OUT_OF_RANGE')
    const missing = await fetch(`${base}/api/v1/analysis/emergency`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    })
    assert.equal(missing.status, 400)
    assert.equal((await missing.json()).error.code, 'INVALID_PARAMETER')
  })
})

test('facility queries filter canonical categories, sort distances and apply the radius', async () => {
  await withServer(async base => {
    const post = body => fetch(`${base}/api/v1/analysis/facilities`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    })
    const origin = { lon: 120.028, lat: 30.277 }
    const nearest = await post({ ...origin, category: 'hospital', mode: 'nearest', limit: 5 })
    assert.equal(nearest.status, 200)
    const n = (await nearest.json()).data
    assert.equal(n.results.length, 5)
    assert.ok(n.results.every(p => p.category === 'hospital'))
    assert.ok(n.results.every((p, i, a) => i === 0 || p.distanceMeters >= a[i - 1].distanceMeters))
    const radius = await post({ ...origin, category: 'bank', mode: 'radius', radiusMeters: 1000 })
    assert.equal(radius.status, 200)
    const r = (await radius.json()).data
    assert.equal(r.area.type, 'Polygon')
    assert.ok(r.count > 0)
    assert.ok(r.results.every(p => p.category === 'bank' && p.distanceMeters <= 1000))
    const poiPage = (await (await fetch(`${base}/api/v1/pois?category=bank`)).json()).data
    const { distance } = require('@turf/distance')
    const expected = poiPage.items.filter(p => distance([origin.lon, origin.lat], [p.lon, p.lat], { units: 'meters' }) <= 1000)
    assert.deepEqual(new Set(r.results.map(p => p.id)), new Set(expected.map(p => p.id)))
    const empty = await post({ ...origin, category: 'fire_station', mode: 'nearest', limit: 5 })
    assert.equal((await empty.json()).data.count, 0)
    for (const body of [
      { ...origin, category: 'invalid', mode: 'nearest' },
      { ...origin, category: 'bank', mode: 'other' },
      { ...origin, category: 'bank', mode: 'nearest', limit: 2.5 },
      { ...origin, category: 'bank', mode: 'radius', radiusMeters: false },
      { ...origin, category: 'bank', mode: 'radius', radiusMeters: 2001 },
    ]) assert.equal((await post(body)).status, 400)
  })
})

test('multi-category emergency keeps complete counts and nearest resources for each category', async () => {
  await withServer(async base => {
    const response = await fetch(`${base}/api/v1/analysis/emergency`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lon: 120.028, lat: 30.277, radiusMeters: 1000,
        categories: ['hospital', 'school', 'fire_station'], eventType: 'explosion' }),
    })
    assert.equal(response.status, 200)
    const { data } = await response.json()
    assert.equal(data.eventType, 'explosion')
    assert.equal(data.facilitySummary.byCategory.find(c => c.category === 'fire_station').available, 0)
    assert.equal(data.facilitySummary.inRadius, data.facilitySummary.byCategory.reduce((sum, c) => sum + c.inRadius, 0))
    assert.ok(data.nearbyFacilities.every(p => p.distanceMeters <= 1000 && ['hospital', 'school'].includes(p.category)))
    for (const category of ['hospital', 'school']) assert.equal(data.nearestFacilities.filter(p => p.category === category).length, 5)
    assert.equal(data.statistics.byType.reduce((sum, s) => sum + s.count, 0), data.affectedTotal)
    const bad = await fetch(`${base}/api/v1/analysis/emergency`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lon: 120.028, lat: 30.277, radiusMeters: 500, categories: [], eventType: 'fire' }) })
    assert.equal(bad.status, 400)
  })
})
