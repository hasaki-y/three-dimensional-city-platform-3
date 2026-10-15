const { labels, categoryOf } = require('./categories')
class HttpError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function finite(value, label, min, max) {
  if (!['number', 'string'].includes(typeof value) || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) {
    throw new HttpError(400, 'INVALID_PARAMETER', `${label} 必须是数字`)
  }
  const number = Number(value)
  if (number < min || number > max) throw new HttpError(400, 'OUT_OF_RANGE', `${label} 必须在 ${min} 到 ${max} 之间`)
  return number
}

function location(source) {
  return {
    lon: finite(source.lon, 'lon', -180, 180),
    lat: finite(source.lat, 'lat', -90, 90),
  }
}

function bbox(raw) {
  if (raw === undefined || raw === '') return null
  const parts = String(raw).split(',')
  if (parts.length !== 4) throw new HttpError(400, 'INVALID_BBOX', 'bbox 格式应为 west,south,east,north')
  const [west, south, east, north] = [
    finite(parts[0], 'west', -180, 180), finite(parts[1], 'south', -90, 90),
    finite(parts[2], 'east', -180, 180), finite(parts[3], 'north', -90, 90),
  ]
  if (west >= east || south >= north) throw new HttpError(400, 'INVALID_BBOX', 'bbox 的西界必须小于东界，南界必须小于北界')
  return [west, south, east, north]
}

function integer(raw, name, fallback, max, min = 0) {
  if (raw === undefined || raw === '') return fallback
  const value = finite(raw, name, min, max)
  if (!Number.isInteger(value)) throw new HttpError(400, 'INVALID_PARAMETER', `${name} 必须是整数`)
  return value
}

function listOptions(query) {
  const minFloors = query.minFloors === undefined || query.minFloors === '' ? null : integer(query.minFloors, 'minFloors', 0, 300)
  return {
    bbox: bbox(query.bbox),
    limit: integer(query.limit, 'limit', 5000, 5000, 1),
    offset: integer(query.offset, 'offset', 0, 100000),
    type: typeof query.type === 'string' ? query.type.slice(0, 40) : '',
    category: query.category ? category(query.category) : '',
    minFloors,
  }
}

function category(value = 'hospital') {
  if (typeof value !== 'string' || (!Object.hasOwn(labels, value) && !Object.values(labels).includes(value))) {
    throw new HttpError(400, 'INVALID_CATEGORY', '设施类别无效')
  }
  return categoryOf(value)
}

function facilityInput(body = {}) {
  if (!['nearest', 'radius'].includes(body.mode)) throw new HttpError(400, 'INVALID_MODE', '请选择最近数量或指定半径')
  return { ...location(body), category: category(body.category), mode: body.mode,
    limit: body.mode === 'nearest' ? integer(body.limit, 'limit', 5, 20, 1) : 100,
    radiusMeters: body.mode === 'radius' ? finite(body.radiusMeters, 'radiusMeters', 1, 2000) : null }
}

function analysisInput(body) {
  body = body || {}
  const point = location(body)
  const eventType = body.eventType === '事故' || body.eventType === undefined ? 'fire' : body.eventType
  if (!['fire', 'explosion', 'chemical'].includes(eventType)) {
    throw new HttpError(400, 'INVALID_EVENT_TYPE', '事件类型无效')
  }
  const raw = body.categories ?? [body.facilityType || 'hospital']
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) throw new HttpError(400, 'INVALID_CATEGORY', '请选择 1 到 6 类设施')
  return {
    ...point,
    radiusMeters: finite(body.radiusMeters, 'radiusMeters', 1, 2000),
    categories: [...new Set(raw.map(category))],
    eventType,
  }
}

module.exports = { HttpError, finite, location, bbox, integer, listOptions, analysisInput, category, facilityInput }
