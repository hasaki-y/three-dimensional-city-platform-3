// Read-only API/database checks, plus ANALYZE to collect statistics on the teaching tables.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
if (process.env.DATA_MODE !== 'postgis') throw new Error('Verification requires DATA_MODE=postgis')
const app = require('../src/index')
const repository = require('../src/v1/repository-postgis')
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {})
const root = path.resolve(__dirname, '../..')

async function main() {
  const server = app.listen(0, '127.0.0.1')
  const checks = []
  try {
    await new Promise(resolve => server.once('listening', resolve))
    const origin = `http://127.0.0.1:${server.address().port}/api/v1`
    async function api(route, body, expectedStatus = 200) {
      const response = await fetch(origin + route, body ? {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      } : undefined)
      assert.equal(response.status, expectedStatus, route)
      return (await response.json()).data
    }
    const health = await api('/health')
    assert.equal(health.mode, 'postgis')
    checks.push('健康检查：mode=postgis，使用真实数据库仓库')
    const system = (await pool.query(`SELECT version() AS postgres, postgis_full_version() AS postgis,
      current_database() AS database, current_user AS app_user,
      (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AS superuser,
      inet_server_addr()::text AS host, inet_server_port() AS port`)).rows[0]
    assert.equal(system.superuser, false)
    const counts = {}
    for (const [table, filename] of [['buildings', 'buildings'], ['pois', 'pois'], ['roads', 'roads'], ['water_areas', 'water']]) {
      const row = (await pool.query(`SELECT count(*)::int AS count,
        count(*) FILTER (WHERE ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom))::int AS invalid FROM ${table}`)).rows[0]
      const expected = JSON.parse(fs.readFileSync(path.join(root, 'server/data', filename + '.geojson'), 'utf8')).features.length
      assert.equal(row.count, expected, table)
      assert.equal(row.invalid, 0, table)
      counts[table] = row.count
      await pool.query(`ANALYZE ${table}`)
    }
    checks.push('四表数量与源 GeoJSON 一致；全部几何有效且 SRID=4326；应用账户不是超级用户')
    const bbox = await api('/buildings?bbox=120.025,30.275,120.035,30.285&limit=5000')
    assert.ok(bbox.total > 0 && bbox.total < counts.buildings)
    assert.equal(bbox.items.length, bbox.total)
    assert.ok(bbox.items.every(b => b.lon >= 120.025 && b.lon <= 120.035 && b.lat >= 30.275 && b.lat <= 30.285))
    const filtered = await api('/buildings?type=' + encodeURIComponent('住宅') + '&minFloors=10&limit=20')
    assert.ok(filtered.items.length > 0 && filtered.items.every(b => b.type === '住宅' && b.floors >= 10))
    assert.equal((await api('/buildings/' + bbox.items[0].id)).id, bbox.items[0].id)
    assert.equal((await api('/roads')).total, counts.roads)
    assert.equal((await api('/water-areas')).total, counts.water_areas)
    assert.equal((await api('/aggregate?by=type')).reduce((sum, x) => sum + x.count, 0), counts.buildings)
    checks.push(`BBOX 返回 ${bbox.total} 栋；建筑筛选、详情、道路、水系、完整类型统计通过`)
    const center = { lon: 120.028, lat: 30.277 }
    const buffer = await api('/analysis/buffer', { ...center, radiusMeters: 300 })
    const exactCount = (await pool.query(`SELECT count(*)::int AS count FROM buildings WHERE
      ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) <= 300`, [center.lon, center.lat])).rows[0].count
    assert.equal(buffer.count, exactCount)
    assert.equal(buffer.circle.type, 'Polygon')
    const nearest = await api('/analysis/nearest?lon=120.028&lat=30.277&category=hospital&limit=5')
    assert.equal(nearest.results.length, 5)
    assert.ok(nearest.results.every(p => p.category === 'hospital' && p.distanceMeters >= 0))
    const expectedNearest = (await pool.query(`SELECT id FROM pois WHERE category='hospital'
      ORDER BY ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, false) LIMIT 5`, [center.lon, center.lat])).rows
    assert.deepEqual(nearest.results.map(x => x.id), expectedNearest.map(x => x.id))
    const facilities = await api('/analysis/facilities', { ...center, category: 'bank', mode: 'radius', radiusMeters: 1000 })
    assert.ok(facilities.count > 0)
    assert.ok(facilities.results.every(p => p.category === 'bank' && p.distanceMeters <= 1000))
    assert.equal(facilities.count, (await pool.query(`SELECT count(*)::int AS count FROM pois WHERE category='bank' AND
      ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) <= 1000`, [center.lon, center.lat])).rows[0].count)
    const facilitiesNearest = await api('/analysis/facilities', { ...center, category: 'hospital', mode: 'nearest', limit: 5 })
    assert.deepEqual(facilitiesNearest.results.map(p => p.id), nearest.results.map(p => p.id))
    const empty = await api('/analysis/facilities', { ...center, category: 'fire_station', mode: 'nearest', limit: 5 })
    assert.equal(empty.count, 0)
    checks.push(`真实空间查询：300m 范围 ${buffer.count} 栋；最近医院 5 个；1km 范围银行 ${facilities.count} 个；缺失类别返回空结果`)
    const emergency = await api('/analysis/emergency', { ...center, eventType: 'explosion', radiusMeters: 800,
      categories: ['hospital', 'school', 'fire_station'] })
    assert.ok(emergency.affectedTotal > 0)
    assert.equal(emergency.statistics.byType.reduce((sum, x) => sum + x.count, 0), emergency.affectedTotal)
    assert.equal(emergency.facilitySummary.byCategory.reduce((sum, x) => sum + x.inRadius, 0), emergency.facilitySummary.inRadius)
    assert.equal(emergency.facilitySummary.byCategory.find(c => c.category === 'fire_station').available, 0)
    for (const category of ['hospital', 'school']) assert.equal(emergency.nearestFacilities.filter(p => p.category === category).length, 5)
    await api('/analysis/emergency', { ...center, eventType: 'fire', radiusMeters: 500, categories: [] }, 400)
    await api('/buildings?bbox=120,31,119,30', undefined, 400)
    checks.push(`多类应急：800m 影响 ${emergency.affectedTotal} 栋、范围设施 ${emergency.facilitySummary.inRadius} 个；分类计数一致；非法请求返回 400`)

    const planSql = fs.readFileSync(path.join(root, 'server/sql/explain.sql'), 'utf8')
    const plans = await pool.query(planSql)
    const planText = (Array.isArray(plans) ? plans : [plans]).map((p, i) => `Query ${i + 1}\n` + p.rows.map(r => r['QUERY PLAN']).join('\n')).join('\n\n')
    const indexes = (await pool.query("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename IN ('buildings','pois','roads','water_areas') ORDER BY indexname")).rows
    const report = ['# PostGIS 本机验收记录', '', `验收时间：${new Date().toISOString()}`, '',
      `- 连接：${system.host}:${system.port} / ${system.database}`, `- 应用账户：${system.app_user}（非超级用户）`,
      `- ${system.postgres}`, `- ${system.postgis}`, '', '## 数据与接口', '',
      ...Object.entries(counts).map(([k, v]) => `- ${k}: ${v}`), ...checks.map(x => `- 通过：${x}`), '',
      '## 索引', '', '```text', ...indexes.map(x => x.indexdef), '```', '',
      '## EXPLAIN ANALYZE', '', '对教学小数据执行 ANALYZE 后，保持优化器默认设置。以下为单次本机观测，不能推断大规模性能或固定加速比例。', '',
      '```text', planText, '```', '',
      '本次验证原生 PostgreSQL 实例；没有验证 Docker Compose。真实地形、真实城市数据和十万级渲染均不在本记录范围。', ''].join('\n')
    fs.writeFileSync(path.join(root, 'docs/PostGIS本机验收.md'), report)
    console.log(checks.join('\n'))
    console.log('Saved docs/PostGIS本机验收.md (no passwords).')
  } finally {
    await new Promise(resolve => server.close(resolve))
    await repository.close()
    await pool.end()
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
