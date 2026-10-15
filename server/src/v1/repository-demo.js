const { createHash } = require('node:crypto')
const { distance } = require('@turf/distance')
const { data, groupBy, heightBand, bufferAnalysis } = require('../spatial')
const { normalizePoi } = require('./categories')
const { buffer: turfBuffer } = require('@turf/buffer')

const boxOf = geometry => {
  const points = geometry.type === 'Point' ? [geometry.coordinates] : geometry.coordinates.flat(Infinity)
  if (geometry.type === 'Point') return [points[0][0], points[0][1], points[0][0], points[0][1]]
  const nums = points
  const xs = nums.filter((_, i) => i % 2 === 0)
  const ys = nums.filter((_, i) => i % 2 === 1)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

function inBox(feature, bbox) {
  if (!bbox) return true
  const [west, south, east, north] = boxOf(feature.geometry)
  return west <= bbox[2] && east >= bbox[0] && south <= bbox[3] && north >= bbox[1]
}

function page(items, options) {
  return { items: items.slice(options.offset, options.offset + options.limit), total: items.length, limit: options.limit, offset: options.offset }
}

function buildings(options) {
  return page(data.buildings.features
    .filter(f => inBox(f, options.bbox))
    .filter(f => !options.type || f.properties.type === options.type)
    .filter(f => options.minFloors === null || f.properties.floors >= options.minFloors)
    .map(f => f.properties), options)
}

function pois(options) {
  return page(data.pois.features
    .filter(f => inBox(f, options.bbox))
    .map(f => normalizePoi(f.properties))
    .filter(p => !options.category || p.category === options.category), options)
}

function features(name, options) {
  return page(data[name].features.filter(f => inBox(f, options.bbox)), options)
}

function stats(buildingItems) {
  const byType = {}
  for (const building of buildingItems) byType[building.type] = (byType[building.type] || 0) + 1
  return Object.entries(byType).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
}

function candidates(input, categories) {
  const origin = { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [input.lon, input.lat] } }
  return data.pois.features
    .filter(f => categories.includes(normalizePoi(f.properties).category))
    .map(f => ({ ...normalizePoi(f.properties), distanceMeters: distance(origin, f, { units: 'kilometers' }) * 1000 }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id))
}

function facilities(input) {
  const all = candidates(input, [input.category])
  const matched = input.mode === 'radius' ? all.filter(p => p.distanceMeters <= input.radiusMeters) : all.slice(0, input.limit)
  const results = matched.slice(0, input.limit)
  return { center: { lon: input.lon, lat: input.lat }, category: input.category, mode: input.mode,
    radiusMeters: input.radiusMeters, count: matched.length, results, truncated: matched.length > results.length,
    area: input.mode === 'radius' ? turfBuffer({ type: 'Point', coordinates: [input.lon, input.lat] }, input.radiusMeters, { units: 'meters' })?.geometry : null }
}

function emergency(input) {
  const buffer = bufferAnalysis(input.lon, input.lat, input.radiusMeters / 1000)
  const facilityCandidates = candidates(input, input.categories)
  const nearby = facilityCandidates.filter(f => f.distanceMeters <= input.radiusMeters)
  return {
    eventId: createHash('sha1').update(JSON.stringify(input)).digest('hex').slice(0, 12),
    center: { lon: input.lon, lat: input.lat },
    radiusMeters: input.radiusMeters,
    eventType: input.eventType,
    impactArea: buffer.circle,
    affectedTotal: buffer.count,
    affectedBuildings: buffer.buildings.slice(0, 500),
    facilitySummary: { categories: input.categories, inRadius: nearby.length,
      byCategory: input.categories.map(category => ({ category, inRadius: nearby.filter(p => p.category === category).length,
        available: facilityCandidates.filter(p => p.category === category).length })) },
    nearbyFacilities: nearby.slice(0, 50),
    nearestFacilities: input.categories.flatMap(category => facilityCandidates.filter(p => p.category === category).slice(0, 5)),
    statistics: { byType: stats(buffer.buildings) },
    truncated: buffer.buildings.length > 500 || nearby.length > 50,
  }
}

module.exports = {
  mode: 'demo',
  health: async () => true,
  buildings: async options => buildings(options),
  building: async id => data.buildings.features.find(f => f.properties.id === id)?.properties || null,
  pois: async options => pois(options),
  roads: async options => features('roads', options),
  water: async options => features('water', options),
  aggregate: async by => groupBy(data.buildings.features, p => by === 'type' ? p.type : heightBand(p.height)),
  buffer: async input => {
    const result = bufferAnalysis(input.lon, input.lat, input.radiusMeters / 1000)
    return { center: result.center, radiusMeters: input.radiusMeters, count: result.count,
      buildings: result.buildings.slice(0, 500), circle: result.circle,
      truncated: result.count > 500 }
  },
  nearest: async input => {
    const results = candidates(input, [input.facilityType]).slice(0, input.limit)
    return { count: results.length, results }
  },
  facilities: async input => facilities(input),
  emergency: async input => emergency(input),
}
