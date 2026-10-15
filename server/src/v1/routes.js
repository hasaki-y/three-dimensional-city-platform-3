const express = require('express')
const { randomUUID } = require('node:crypto')
const { HttpError, location, finite, listOptions, integer, analysisInput, category, facilityInput } = require('./validation')

function createV1Router(repository) {
  const router = express.Router()
  const route = handler => (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next)

  router.get('/health', route(async (_req, res) => {
    await repository.health()
    res.json({ data: { ok: true, mode: repository.mode, source: repository.mode === 'demo' ? 'synthetic-geojson' : 'postgis' } })
  }))
  router.get('/buildings', route(async (req, res) => {
    res.json({ data: await repository.buildings(listOptions(req.query)) })
  }))
  router.get('/buildings/:id', route(async (req, res) => {
    const item = await repository.building(req.params.id)
    if (!item) throw new HttpError(404, 'NOT_FOUND', '建筑不存在')
    res.json({ data: item })
  }))
  router.get('/pois', route(async (req, res) => {
    res.json({ data: await repository.pois(listOptions(req.query)) })
  }))
  router.get('/roads', route(async (req, res) => {
    res.json({ data: await repository.roads(listOptions(req.query)) })
  }))
  router.get('/water-areas', route(async (req, res) => {
    res.json({ data: await repository.water(listOptions(req.query)) })
  }))
  router.get('/aggregate', route(async (req, res) => {
    const by = req.query.by
    if (by !== 'type' && by !== 'heightBand') throw new HttpError(400, 'INVALID_PARAMETER', 'by 仅支持 type 或 heightBand')
    res.json({ data: await repository.aggregate(by) })
  }))
  router.post('/analysis/buffer', route(async (req, res) => {
    const point = location(req.body || {})
    const radiusMeters = finite(req.body?.radiusMeters, 'radiusMeters', 1, 2000)
    res.json({ data: await repository.buffer({ ...point, radiusMeters }) })
  }))
  router.get('/analysis/nearest', route(async (req, res) => {
    const point = location(req.query)
    const facilityType = category(req.query.category)
    const limit = integer(req.query.limit, 'limit', 5, 20, 1)
    res.json({ data: await repository.nearest({ ...point, facilityType, limit }) })
  }))
  router.post('/analysis/facilities', route(async (req, res) => {
    res.json({ data: await repository.facilities(facilityInput(req.body || {})) })
  }))
  router.post('/analysis/emergency', route(async (req, res) => {
    res.json({ data: await repository.emergency(analysisInput(req.body)) })
  }))

  router.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', '接口不存在')))
  router.use((error, _req, res, _next) => {
    const requestId = randomUUID()
    if (!(error instanceof HttpError)) console.error(`[api/v1 ${requestId}]`, error)
    const databaseUnavailable = repository.mode === 'postgis' &&
      ['ECONNREFUSED', '3D000', '42P01', '42703', '28P01'].includes(error.code)
    const status = error instanceof HttpError ? error.status : databaseUnavailable ? 503 : 500
    res.status(status).json({
      error: { code: error instanceof HttpError ? error.code : databaseUnavailable ? 'DATA_SOURCE_UNAVAILABLE' : 'INTERNAL_ERROR',
        message: error instanceof HttpError ? error.message : databaseUnavailable ? '数据库未就绪，请检查连接与数据导入' : '服务器内部错误', requestId },
    })
  })
  return router
}

module.exports = { createV1Router }
