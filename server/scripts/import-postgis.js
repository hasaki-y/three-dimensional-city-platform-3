// Re-runnable import of the checked-in teaching data. Requires an existing PostGIS database.
const fs = require('node:fs')
const path = require('node:path')
const { Pool } = require('pg')
const { normalizePoi } = require('../src/v1/categories')

if (!process.env.DATABASE_URL && !process.env.PGHOST) {
  console.error('请先设置 DATABASE_URL 或 PGHOST/PGUSER/PGPASSWORD/PGDATABASE，再执行导入')
  process.exit(1)
}

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {})
const root = path.join(__dirname, '..')

function features(name) {
  const items = JSON.parse(fs.readFileSync(path.join(root, 'data', `${name}.geojson`), 'utf8')).features
  return name === 'pois' ? items.map(f => ({ ...f, properties: normalizePoi(f.properties) })) : items
}

async function importTable(client, table, name, columns, expressions) {
  const value = JSON.stringify(features(name))
  const sql = `INSERT INTO ${table} (${columns.join(', ')}, geom)
    SELECT ${expressions.join(', ')}, ST_SetSRID(ST_GeomFromGeoJSON(f->'geometry'), 4326)
    FROM jsonb_array_elements($1::jsonb) AS f`
  await client.query(sql, [value])
}

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(fs.readFileSync(path.join(root, 'sql', 'schema.sql'), 'utf8'))
    await client.query('TRUNCATE buildings, pois, roads, water_areas')
    await importTable(client, 'buildings', 'buildings',
      ['id', 'name', 'type', 'district', 'floors', 'height', 'area', 'year'],
      ["f->'properties'->>'id'", "f->'properties'->>'name'", "f->'properties'->>'type'", "f->'properties'->>'district'", "(f->'properties'->>'floors')::integer", "(f->'properties'->>'height')::double precision", "(f->'properties'->>'area')::double precision", "(f->'properties'->>'year')::integer"])
    await importTable(client, 'pois', 'pois', ['id', 'name', 'type', 'district', 'category'],
      ["f->'properties'->>'id'", "f->'properties'->>'name'", "f->'properties'->>'type'", "f->'properties'->>'district'", "f->'properties'->>'category'"])
    await importTable(client, 'roads', 'roads', ['id', 'name', 'type'],
      ["f->'properties'->>'id'", "f->'properties'->>'name'", "f->'properties'->>'type'"])
    await importTable(client, 'water_areas', 'water', ['id', 'name', 'type'],
      ["f->'properties'->>'id'", "f->'properties'->>'name'", "f->'properties'->>'type'"])
    const counts = await client.query(`SELECT
      (SELECT count(*) FROM buildings) AS buildings,
      (SELECT count(*) FROM pois) AS pois,
      (SELECT count(*) FROM roads) AS roads,
      (SELECT count(*) FROM water_areas) AS water`)
    const geometryCheck = await client.query(`SELECT
      (SELECT count(*) FROM buildings WHERE ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom)) +
      (SELECT count(*) FROM pois WHERE ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom)) +
      (SELECT count(*) FROM roads WHERE ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom)) +
      (SELECT count(*) FROM water_areas WHERE ST_SRID(geom) <> 4326 OR NOT ST_IsValid(geom)) AS invalid`)
    if (Number(geometryCheck.rows[0].invalid) !== 0) throw new Error('导入后发现无效几何或 SRID 错误')
    await client.query('COMMIT')
    console.log('导入成功（教学模拟数据）：', counts.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(error => { console.error('导入失败：', error); process.exitCode = 1 })
