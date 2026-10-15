const { createHash } = require('node:crypto')
const { Pool } = require('pg')

const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL, max: 10 } : { max: 10 })

// Only these fixed SQL identifiers may enter query strings. User values always use $ parameters.
const resources = {
  buildings: { table: 'buildings', columns: 'id, name, type, district, floors, height, area, year, ST_X(geom) AS lon, ST_Y(geom) AS lat' },
  pois: { table: 'pois', columns: 'id, name, type, category, district, ST_X(geom) AS lon, ST_Y(geom) AS lat' },
  roads: { table: 'roads', columns: `json_build_object('type','Feature','geometry',ST_AsGeoJSON(geom)::json,'properties',json_build_object('id',id,'name',name,'type',type)) AS feature` },
  water: { table: 'water_areas', columns: `json_build_object('type','Feature','geometry',ST_AsGeoJSON(geom)::json,'properties',json_build_object('id',id,'name',name,'type',type)) AS feature` },
}

function filters(kind, options) {
  const terms = []
  const values = []
  if (options.bbox) {
    values.push(...options.bbox)
    const envelope = `ST_MakeEnvelope($${values.length - 3},$${values.length - 2},$${values.length - 1},$${values.length},4326)`
    // && is only the index prefilter: its outward-rounded boxes can admit points outside the exact bounds.
    terms.push(`geom && ${envelope} AND ST_Intersects(geom, ${envelope})`)
  }
  const category = kind === 'pois' ? options.category : options.type
  if (category && (kind === 'pois' || kind === 'buildings')) {
    values.push(category)
    terms.push(`${kind === 'pois' ? 'category' : 'type'} = $${values.length}`)
  }
  if (kind === 'buildings' && options.minFloors !== null) {
    values.push(options.minFloors)
    terms.push(`floors >= $${values.length}`)
  }
  return { where: terms.length ? `WHERE ${terms.join(' AND ')}` : '', values }
}

async function list(kind, options) {
  const resource = resources[kind]
  const { where, values } = filters(kind, options)
  const count = await pool.query(`SELECT count(*)::integer AS total FROM ${resource.table} ${where}`, values)
  const items = await pool.query(
    `SELECT ${resource.columns} FROM ${resource.table} ${where} ORDER BY id LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, options.limit, options.offset]
  )
  return { items: kind === 'roads' || kind === 'water' ? items.rows.map(row => row.feature) : items.rows,
    total: count.rows[0].total, limit: options.limit, offset: options.offset }
}

async function nearest(input) {
  const result = await pool.query(`SELECT id, name, type, category, district, ST_X(geom) AS lon, ST_Y(geom) AS lat,
      ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1,$2),4326)::geography) AS "distanceMeters"
    FROM pois WHERE category = $3
    ORDER BY geom::geography <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
    LIMIT $4`, [input.lon, input.lat, input.facilityType, input.limit])
  return { count: result.rows.length, results: result.rows }
}

async function facilities(input) {
  if (input.mode === 'nearest') {
    const result = await nearest({ ...input, facilityType: input.category })
    return { ...result, center: { lon: input.lon, lat: input.lat }, category: input.category,
      mode: input.mode, radiusMeters: null, area: null, truncated: false }
  }
  const origin = 'ST_SetSRID(ST_MakePoint($1,$2),4326)::geography'
  // One statement gives the count, limited results and geometry from the same snapshot.
  const result = await pool.query(`WITH matched AS (
    SELECT ${resources.pois.columns}, ST_Distance(geom::geography, ${origin}) AS "distanceMeters"
    FROM pois WHERE category = $4 AND ST_DWithin(geom::geography, ${origin}, $3)
  ) SELECT (SELECT count(*)::integer FROM matched) AS count,
    COALESCE((SELECT json_agg(p) FROM (SELECT * FROM matched ORDER BY "distanceMeters", id LIMIT $5) p), '[]'::json) AS results,
    ST_AsGeoJSON(ST_Buffer(${origin}, $3)::geometry)::json AS area`,
  [input.lon, input.lat, input.radiusMeters, input.category, input.limit])
  const row = result.rows[0]
  return { ...row, center: { lon: input.lon, lat: input.lat }, category: input.category,
    mode: input.mode, radiusMeters: input.radiusMeters, truncated: row.count > row.results.length }
}

async function emergency(input) {
  const client = await pool.connect()
  const base = [input.lon, input.lat, input.radiusMeters]
  const origin = 'ST_SetSRID(ST_MakePoint($1,$2),4326)::geography'
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const area = await client.query(`SELECT ST_AsGeoJSON(ST_Buffer(${origin}, $3)::geometry)::json AS geometry`, base)
    const affectedCount = await client.query(`SELECT count(*)::integer AS total FROM buildings
      WHERE ST_DWithin(geom::geography, ${origin}, $3)`, base)
    const affected = await client.query(`SELECT id, name, type, district, floors, height, area, year,
        ST_X(geom) AS lon, ST_Y(geom) AS lat
      FROM buildings WHERE ST_DWithin(geom::geography, ${origin}, $3)
      ORDER BY id LIMIT 500`, base)
    const byType = await client.query(`SELECT type AS name, count(*)::integer AS count FROM buildings
      WHERE ST_DWithin(geom::geography, ${origin}, $3) GROUP BY type ORDER BY count DESC`, base)
    const facilityCount = await client.query(`SELECT category, count(*)::integer AS available,
      count(*) FILTER (WHERE ST_DWithin(geom::geography, ${origin}, $3))::integer AS "inRadius"
      FROM pois WHERE category = ANY($4::text[]) GROUP BY category`, [...base, input.categories])
    const facilityColumns = `id, name, type, category, district, ST_X(geom) AS lon, ST_Y(geom) AS lat,
      ST_Distance(geom::geography, ${origin}) AS "distanceMeters"`
    const nearby = await client.query(`SELECT ${facilityColumns} FROM pois
      WHERE category = ANY($4::text[]) AND ST_DWithin(geom::geography, ${origin}, $3)
      ORDER BY geom::geography <-> ${origin} LIMIT 50`, [...base, input.categories])
    const closest = []
    for (const category of input.categories) {
      const result = await client.query(`SELECT ${facilityColumns} FROM pois WHERE category = $4
        AND $3::double precision > 0 ORDER BY geom::geography <-> ${origin} LIMIT 5`, [...base, category])
      closest.push(...result.rows)
    }
    const byCategory = input.categories.map(category => facilityCount.rows.find(row => row.category === category) || { category, available: 0, inRadius: 0 })
    const inRadius = byCategory.reduce((sum, row) => sum + row.inRadius, 0)
    await client.query('COMMIT')
    return {
      eventId: createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 12),
      center: { lon: input.lon, lat: input.lat }, radiusMeters: input.radiusMeters,
      eventType: input.eventType, impactArea: area.rows[0].geometry,
      affectedTotal: affectedCount.rows[0].total,
      affectedBuildings: affected.rows,
      facilitySummary: { categories: input.categories, inRadius, byCategory },
      nearbyFacilities: nearby.rows,
      nearestFacilities: closest,
      statistics: { byType: byType.rows },
      truncated: affectedCount.rows[0].total > 500 || inRadius > 50,
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

module.exports = {
  mode: 'postgis',
  health: async () => {
    await pool.query('SELECT (SELECT count(*) FROM buildings), (SELECT count(category) FROM pois)')
    return true
  },
  buildings: options => list('buildings', options),
  building: async id => {
    const result = await pool.query(`SELECT id, name, type, district, floors, height, area, year,
      ST_X(geom) AS lon, ST_Y(geom) AS lat FROM buildings WHERE id = $1`, [id])
    return result.rows[0] || null
  },
  pois: options => list('pois', options),
  roads: options => list('roads', options),
  water: options => list('water', options),
  aggregate: async by => {
    const expression = by === 'type' ? 'type' : `CASE WHEN height < 15 THEN '低层 (<15m)'
      WHEN height < 30 THEN '多层 (15-30m)' WHEN height < 60 THEN '高层 (30-60m)'
      ELSE '超高层 (>60m)' END`
    const result = await pool.query(`SELECT ${expression} AS name, count(*)::integer AS count
      FROM buildings GROUP BY ${expression} ORDER BY count DESC`)
    return result.rows
  },
  buffer: async input => {
    const result = await emergency({ ...input, categories: [], eventType: 'fire' })
    return { center: result.center, radiusMeters: result.radiusMeters,
      count: result.affectedTotal, buildings: result.affectedBuildings,
      circle: result.impactArea, truncated: result.truncated }
  },
  nearest,
  facilities,
  emergency,
  close: () => pool.end(),
}
