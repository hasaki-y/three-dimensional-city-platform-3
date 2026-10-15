<template>
  <div ref="containerRef" class="city-scene"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as Cesium from 'cesium'
import { SCENE_CONFIG } from '../config'
import { useStore } from '../store'
import type { Building, Poi, RoadFeature, WaterFeature, EmergencyResult, ProfilePoint } from '../types'
import { api } from '../api'
import { createCityViewer, disposeCityViewer } from '../composables/useCesiumViewer'
import { createSceneLayers } from '../composables/useLayerManager'
import { pickEntityId, pickGlobePoint } from '../composables/useFeaturePick'
import { equidistantProfileSamples } from '../composables/useDrawing'
import { createBaseMap } from '../composables/useBaseMap'
import { useMapStore } from '../stores/map'
import { categoryColor } from '../config/facilities'

const containerRef = ref<HTMLDivElement | null>(null)
const store = useStore()
const mapStore = useMapStore()
let baseMap: ReturnType<typeof createBaseMap> | null = null
let viewer: Cesium.Viewer | null = null
let layers: ReturnType<typeof createSceneLayers> | null = null
const buildingMap = new Map<string, Building>()
const poiMap = new Map<string, Poi>()
const resultPoiMap = new Map<string, Poi>()
let buildingController: AbortController | null = null
let layerController: AbortController | null = null
let analysisController: AbortController | null = null
let buildingRequestId = 0
let layerRequestId = 0
let analysisRequestId = 0
let moveTimer: ReturnType<typeof setTimeout> | null = null
let terrainReady = false
let samplingTerrainProvider: Cesium.TerrainProvider | null = null
let profileStart: Cesium.Cartographic | null = null
let boxStart: { lon: number; lat: number } | null = null

const cityBounds = { west: 120.008, south: 30.264, east: 120.052, north: 30.292 }

function is2D() { return viewer?.scene.mode === Cesium.SceneMode.SCENE2D }

function currentBbox(): string | undefined {
  if (!viewer) return undefined
  const rectangle = viewer.camera.computeViewRectangle(viewer.scene.globe.ellipsoid)
  if (!rectangle) return undefined
  const [west, south, east, north] = [rectangle.west, rectangle.south, rectangle.east, rectangle.north]
    .map(Cesium.Math.toDegrees)
  // This demo data is nowhere near the date line. A wrapped/global view asks the bounded API for all data.
  if (west >= east || south >= north) return undefined
  return [west, south, east, north].map(value => value.toFixed(6)).join(',')
}

function setCameraToCity() {
  if (!viewer || viewer.scene.mode === Cesium.SceneMode.MORPHING) return
  if (is2D()) {
    viewer.camera.setView({
      destination: Cesium.Rectangle.fromDegrees(cityBounds.west, cityBounds.south, cityBounds.east, cityBounds.north),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
    })
  } else {
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(SCENE_CONFIG.center.lon, SCENE_CONFIG.center.lat, SCENE_CONFIG.camera3DHeight),
      orientation: { heading: 0, pitch: Cesium.Math.toRadians(SCENE_CONFIG.camera3DPitch), roll: 0 },
    })
  }
}

function applyBuildingGraphics() {
  if (!layers) return
  const flat = is2D()
  for (const entity of layers.sources.buildings.entities.values) {
    if (entity.box) entity.box.show = new Cesium.ConstantProperty(!flat)
    if (entity.point) entity.point.show = new Cesium.ConstantProperty(flat)
  }
}

function onMorphComplete() {
  if (!viewer || viewer.isDestroyed()) return
  applyBuildingGraphics()
  // Camera.setView is ignored during MORPHING; place it only after this event.
  setCameraToCity()
  scheduleVisibleLoad()
}

function scheduleVisibleLoad() {
  layers?.updateClustering()
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = setTimeout(() => { void loadBuildings(); void loadOtherLayers() }, 250)
}

async function loadBuildings() {
  if (!viewer || !layers) return
  buildingController?.abort()
  const controller = new AbortController()
  buildingController = controller
  const requestId = ++buildingRequestId
  store.loadStatus = 'loading'
  store.loadError = ''
  const query = {
    bbox: currentBbox(), limit: 5000,
    type: store.filter.type || undefined,
    minFloors: store.filter.minFloors ?? undefined,
  }
  try {
    const start = performance.now()
    const page = await api.buildings(query, controller.signal)
    if (controller.signal.aborted || requestId !== buildingRequestId || !layers) return
    const source = layers.sources.buildings
    source.entities.removeAll()
    buildingMap.clear()
    for (const building of page.items) {
      buildingMap.set(building.id, building)
      const color = Cesium.Color.fromCssColorString(SCENE_CONFIG.BUILDING_COLORS[building.type] || '#888888')
      source.entities.add({
        id: building.id,
        position: Cesium.Cartesian3.fromDegrees(building.lon, building.lat, building.height / 2),
        box: { dimensions: new Cesium.Cartesian3(30, 30, building.height), material: color,
          outline: true, outlineColor: Cesium.Color.WHITE.withAlpha(0.3), show: !is2D() },
        point: { pixelSize: 7, color, outlineColor: Cesium.Color.WHITE, outlineWidth: 1, show: is2D() },
      })
    }
    store.loadedBuildings = page.items.length
    store.totalBuildings = page.total
    store.loadStatus = 'ready'
    if (store.selected && !buildingMap.has(store.selected.id)) store.selectBuilding(null)
    applyEmergencyHighlights()
    console.info(`[CityScene] 建筑 BBOX 请求+解析+建实体 ${Math.round(performance.now() - start)}ms; ${page.items.length}/${page.total}`)
  } catch (error) {
    if (controller.signal.aborted) return
    store.loadStatus = 'error'
    store.loadError = error instanceof Error ? error.message : '建筑加载失败'
  }
}

function drawPois(items: Poi[]) {
  if (!layers) return
  const source = layers.sources.pois
  source.entities.removeAll()
  poiMap.clear()
  for (const poi of items) {
    poiMap.set(poi.id, poi)
    source.entities.add({
      id: poi.id,
      position: Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat),
      point: { pixelSize: 7,
        color: Cesium.Color.fromCssColorString(categoryColor(poi.category)),
        outlineColor: Cesium.Color.BLACK, outlineWidth: 1 },
    })
  }
  layers.updateClustering()
}

function drawResultPois(items: Poi[]) {
  if (!layers) return
  layers.sources.poiResults.entities.removeAll()
  resultPoiMap.clear()
  for (const poi of items) {
    const id = `result:${poi.id}`
    if (resultPoiMap.has(id)) continue
    resultPoiMap.set(id, poi)
    layers.sources.poiResults.entities.add({ id, name: poi.name,
      position: Cesium.Cartesian3.fromDegrees(poi.lon, poi.lat),
      point: { pixelSize: 9, color: Cesium.Color.fromCssColorString(categoryColor(poi.category)),
        outlineColor: Cesium.Color.WHITE, outlineWidth: 1, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      label: { text: poi.name, show: items.length <= 10, font: '11px sans-serif',
        pixelOffset: new Cesium.Cartesian2(10, -12), fillColor: Cesium.Color.WHITE,
        showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#102339').withAlpha(0.85),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000) },
    })
  }
  layers.updateClustering()
}

function drawRoads(items: RoadFeature[]) {
  if (!layers) return
  const source = layers.sources.roads
  source.entities.removeAll()
  for (const feature of items) {
    source.entities.add({
      id: feature.properties.id,
      polyline: { positions: Cesium.Cartesian3.fromDegreesArray(feature.geometry.coordinates.flat()),
        width: 2, material: Cesium.Color.fromCssColorString('#e7b84d') },
    })
  }
}

function drawWater(items: WaterFeature[]) {
  if (!layers) return
  const source = layers.sources.water
  source.entities.removeAll()
  for (const feature of items) {
    source.entities.add({
      id: feature.properties.id,
      polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(feature.geometry.coordinates[0].flat()),
        height: 0,
        material: Cesium.Color.fromCssColorString('#2586bc').withAlpha(0.58),
        outline: true, outlineColor: Cesium.Color.fromCssColorString('#6fcafa') },
    })
  }
}

async function loadOtherLayers() {
  if (!viewer || !layers) return
  layerController?.abort()
  const controller = new AbortController()
  layerController = controller
  const requestId = ++layerRequestId
  const query = { bbox: currentBbox(), limit: 5000 }
  const results = await Promise.allSettled([
    store.layers.pois && store.analysisMode === 'none' ? api.pois(query, controller.signal) : Promise.resolve(null),
    store.layers.roads ? api.roads(query, controller.signal) : Promise.resolve(null),
    store.layers.water ? api.water(query, controller.signal) : Promise.resolve(null),
  ])
  if (controller.signal.aborted || requestId !== layerRequestId) return
  if (results[0].status === 'fulfilled' && results[0].value) drawPois(results[0].value.items)
  if (results[1].status === 'fulfilled' && results[1].value) drawRoads(results[1].value.items)
  if (results[2].status === 'fulfilled' && results[2].value) drawWater(results[2].value.items)
  const failed = results.find(item => item.status === 'rejected')
  if (failed?.status === 'rejected') store.loadError = failed.reason instanceof Error ? failed.reason.message : '图层加载失败'
}

function clearAnalysis() {
  layers?.sources.poiResults.entities.removeAll()
  resultPoiMap.clear()
  store.selectedPoi = null
  if (!viewer) return
  const ids = viewer.entities.values.filter(entity => entity.id.startsWith('analysis-')).map(entity => entity.id)
  for (const id of ids) viewer.entities.removeById(id)
  profileStart = null
  boxStart = null
  applyEmergencyHighlights()
}

function cancelAnalysis() {
  analysisRequestId++
  analysisController?.abort()
  analysisController = null
  clearAnalysis()
}

function drawImpactArea(geometry: EmergencyResult['impactArea'] | NonNullable<typeof store.bufferResult>['circle']) {
  if (!viewer || !geometry || geometry.type !== 'Polygon') return
  viewer.entities.add({
    id: 'analysis-area',
    polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(geometry.coordinates[0].flat()),
      height: 0,
      material: Cesium.Color.RED.withAlpha(0.24), outline: true, outlineColor: Cesium.Color.RED },
  })
}

function drawOrigin(lon: number, lat: number) {
  viewer?.entities.add({ id: 'analysis-origin', position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 12, color: Cesium.Color.YELLOW, outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY } })
}

function applyEmergencyHighlights() {
  if (!layers) return
  const result = store.emergencyResult
  const selected = store.emergencySelectedIds ? new Set(store.emergencySelectedIds) : null
  const affected = new Set((result?.affectedBuildings || store.bufferResult?.buildings || []).filter(item => !selected || selected.has(item.id)).map(item => item.id))
  for (const entity of layers.sources.buildings.entities.values) {
    const building = buildingMap.get(entity.id)
    if (!building || !entity.box || !entity.point) continue
    const active = affected.has(building.id) && (!store.emergencyTypeFilter || building.type === store.emergencyTypeFilter)
    const color = active ? Cesium.Color.YELLOW : Cesium.Color.fromCssColorString(SCENE_CONFIG.BUILDING_COLORS[building.type] || '#888888')
    entity.box.material = new Cesium.ColorMaterialProperty(color)
    entity.point.color = new Cesium.ConstantProperty(color)
  }
}

async function runBuffer(lon: number, lat: number) {
  if (!viewer) return
  resetTaskResults()
  store.queryStatus = 'submitting'
  store.queryError = ''
  const id = ++analysisRequestId
  const controller = new AbortController()
  analysisController = controller
  drawOrigin(lon, lat)
  try {
    const result = await api.buffer(lon, lat, store.rangeRadiusMeters, controller.signal)
    if (controller.signal.aborted || id !== analysisRequestId || store.analysisMode !== 'range') return
    store.bufferResult = result
    store.queryStatus = 'completed'
    drawImpactArea(result.circle)
    applyEmergencyHighlights()
  } catch (error) {
    if (!controller.signal.aborted) { store.queryStatus = 'error'; store.queryError = error instanceof Error ? error.message : '范围查询失败' }
  }
}

async function runFacilities(lon: number, lat: number) {
  if (!viewer) return
  resetTaskResults()
  store.queryStatus = 'submitting'
  store.queryError = ''
  const id = ++analysisRequestId
  const controller = new AbortController()
  analysisController = controller
  drawOrigin(lon, lat)
  try {
    const result = await api.facilities({ lon, lat, category: store.facilityCategory, mode: store.facilityMode,
      limit: store.facilityLimit, radiusMeters: store.facilityRadiusMeters }, controller.signal)
    if (controller.signal.aborted || id !== analysisRequestId || store.analysisMode !== 'facilities' || !viewer) return
    store.facilityResult = result
    store.queryStatus = 'completed'
    drawResultPois(result.results)
    if (result.area) drawImpactArea(result.area)
  } catch (error) {
    if (!controller.signal.aborted) { store.queryStatus = 'error'; store.queryError = error instanceof Error ? error.message : '设施查询失败' }
  }
}

async function runEmergency(lon: number, lat: number) {
  if (!viewer) return
  resetTaskResults()
  store.emergencyBoxSelect = false
  store.emergencySelectedIds = null
  store.emergencyResult = null
  store.emergencyStatus = 'submitting'
  store.emergencyError = ''
  const id = ++analysisRequestId
  const controller = new AbortController()
  analysisController = controller
  drawOrigin(lon, lat)
  try {
    const result = await api.emergency({ lon, lat, radiusMeters: store.emergencyRadiusMeters,
      categories: [...store.emergencyCategories], eventType: store.emergencyEventType }, controller.signal)
    if (controller.signal.aborted || id !== analysisRequestId || store.analysisMode !== 'emergency' || !viewer) return
    store.emergencyResult = result
    store.emergencyStatus = 'completed'
    drawImpactArea(result.impactArea)
    drawResultPois([...result.nearbyFacilities, ...result.nearestFacilities])
    applyEmergencyHighlights()
  } catch (error) {
    if (controller.signal.aborted) return
    store.emergencyStatus = 'error'
    store.emergencyError = error instanceof Error ? error.message : '应急分析失败'
  }
}

function selectEmergencyBox(lon: number, lat: number) {
  if (!viewer || !store.emergencyResult) return
  if (!boxStart) {
    boxStart = { lon, lat }
    viewer.entities.removeById('analysis-box-start')
    viewer.entities.add({ id: 'analysis-box-start', position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: { pixelSize: 10, color: Cesium.Color.LIME } })
    return
  }
  const west = Math.min(boxStart.lon, lon)
  const east = Math.max(boxStart.lon, lon)
  const south = Math.min(boxStart.lat, lat)
  const north = Math.max(boxStart.lat, lat)
  viewer.entities.removeById('analysis-box-start')
  viewer.entities.removeById('analysis-box')
  boxStart = null
  if (west === east || south === north) {
    store.emergencyError = '框选范围太小，请选择两个不同位置'
    return
  }
  viewer.entities.add({ id: 'analysis-box', rectangle: {
    coordinates: Cesium.Rectangle.fromDegrees(west, south, east, north), height: 0,
    material: Cesium.Color.LIME.withAlpha(0.18), outline: true, outlineColor: Cesium.Color.LIME } })
  store.emergencySelectedIds = store.emergencyResult.affectedBuildings
    .filter(item => item.lon >= west && item.lon <= east && item.lat >= south && item.lat <= north)
    .map(item => item.id)
  store.emergencyBoxSelect = false
}

async function finishProfile(end: Cesium.Cartographic) {
  if (!viewer || !profileStart || !samplingTerrainProvider || !terrainReady) return
  const start = profileStart
  let sampling: ReturnType<typeof equidistantProfileSamples>
  try {
    sampling = equidistantProfileSamples(start, end)
  } catch (error) {
    store.profileStatus = 'error'
    store.profileError = error instanceof Error ? error.message : '剖面线无效'
    profileStart = null
    return
  }
  const id = ++analysisRequestId
  store.profileStatus = 'sampling'
  store.profileError = ''
  const cartographics = sampling.positions
  const count = cartographics.length
  try {
    const samples = await Cesium.sampleTerrainMostDetailed(samplingTerrainProvider, cartographics)
    if (id !== analysisRequestId || store.analysisMode !== 'profile' || !viewer) return
    const points: ProfilePoint[] = samples.map((position, index) => {
      const lon = Cesium.Math.toDegrees(position.longitude)
      const lat = Cesium.Math.toDegrees(position.latitude)
      return { lon, lat, distanceMeters: sampling.totalDistanceMeters * index / (count - 1),
        elevationMeters: Number.isFinite(position.height) ? position.height : null }
    })
    const heights = points.map(point => point.elevationMeters).filter((height): height is number => height !== null)
    store.profileResult = { source: 'terrain',
      sampleSpacingMeters: sampling.sampleSpacingMeters, totalDistanceMeters: sampling.totalDistanceMeters, points,
      minElevationMeters: heights.length ? Math.min(...heights) : null,
      maxElevationMeters: heights.length ? Math.max(...heights) : null }
    store.profileStatus = 'completed'
    viewer.entities.add({ id: 'analysis-profile-line',
      polyline: { positions: Cesium.Cartesian3.fromDegreesArray([
        Cesium.Math.toDegrees(start.longitude), Cesium.Math.toDegrees(start.latitude),
        Cesium.Math.toDegrees(end.longitude), Cesium.Math.toDegrees(end.latitude)]),
        width: 3, material: Cesium.Color.YELLOW } })
  } catch (error) {
    if (id !== analysisRequestId) return
    store.profileStatus = 'error'
    store.profileError = error instanceof Error ? error.message : '地形采样失败'
  } finally {
    profileStart = null
  }
}

function onProfileClick(lon: number, lat: number) {
  if (!viewer || !terrainReady || store.profileStatus === 'sampling') return
  const cartographic = Cesium.Cartographic.fromDegrees(lon, lat)
  if (!profileStart) {
    cancelAnalysis()
    store.profileResult = null
    store.profileStatus = 'drawing'
    profileStart = cartographic
    drawOrigin(lon, lat)
  } else {
    void finishProfile(cartographic)
  }
}

function onLeftClick(movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
  if (!viewer) return
  if (store.analysisMode !== 'none') {
    const point = pickGlobePoint(viewer, movement.position)
    if (!point) return
    const { lon, lat } = point
    if (store.analysisMode === 'emergency' && store.emergencyBoxSelect && store.emergencyResult) {
      selectEmergencyBox(lon, lat)
      return
    }
    if (store.analysisMode === 'profile') { onProfileClick(lon, lat); return }
    if (store.pickingAnalysisPoint) {
      resetTaskResults()
      store.analysisPoint = { lon, lat }
      store.pickingAnalysisPoint = false
      drawOrigin(lon, lat)
      return
    }
  }
  const id = pickEntityId(viewer.scene, movement.position) || ''
  if (buildingMap.has(id)) store.selectBuilding(buildingMap.get(id)!)
  else if (poiMap.has(id)) store.selectPoi(poiMap.get(id)!)
  else if (resultPoiMap.has(id)) store.selectPoi(resultPoiMap.get(id)!)
  else { store.selectBuilding(null); store.selectedPoi = null }
}

watch(() => [store.filter.type, store.filter.minFloors], () => { void loadBuildings() })
watch(() => store.reloadToken, () => { void loadBuildings(); void loadOtherLayers() })
watch(() => ({ ...store.layers }), () => { layers?.syncVisibility(); void loadOtherLayers() })
watch(() => [mapStore.baseMap, mapStore.baseMapRetry], () => baseMap?.switchBaseMap(mapStore.baseMap))
watch(() => store.viewMode, mode => {
  if (!viewer) return
  if (mode === '2d') viewer.scene.morphTo2D(0.5)
  else viewer.scene.morphTo3D(0.5)
  if (viewer.scene.mode !== Cesium.SceneMode.MORPHING) onMorphComplete()
})
function resetTaskResults() {
  store.bufferResult = null
  store.facilityResult = null
  store.queryStatus = 'idle'
  store.queryError = ''
  store.emergencyResult = null
  store.emergencyTypeFilter = ''
  store.emergencySelectedIds = null
  store.emergencyBoxSelect = false
  store.emergencyStatus = store.analysisMode === 'emergency' ? 'drawing' : 'idle'
  store.emergencyError = ''
  store.profileResult = null
  store.profileStatus = store.analysisMode === 'profile' ? 'drawing' : 'idle'
  cancelAnalysis()
}
watch(() => store.analysisMode, mode => {
  resetTaskResults()
  store.analysisPoint = null
  store.pickingAnalysisPoint = mode !== 'none' && mode !== 'profile'
  layers?.syncVisibility()
  void loadOtherLayers()
})
// Changing parameters invalidates results and pending work before another submit.
watch(() => [store.facilityCategory, store.facilityMode, store.facilityLimit, store.facilityRadiusMeters,
  store.rangeRadiusMeters, store.emergencyEventType, store.emergencyRadiusMeters, ...store.emergencyCategories], () => {
  resetTaskResults()
  if (store.analysisPoint) drawOrigin(store.analysisPoint.lon, store.analysisPoint.lat)
}, { flush: 'sync' })
watch(() => store.analysisSubmitToken, () => {
  const point = store.analysisPoint
  if (!point) return
  if (store.analysisMode === 'facilities') void runFacilities(point.lon, point.lat)
  if (store.analysisMode === 'range') void runBuffer(point.lon, point.lat)
  if (store.analysisMode === 'emergency') void runEmergency(point.lon, point.lat)
})
watch(() => store.emergencyTypeFilter, applyEmergencyHighlights)
watch(() => store.emergencySelectedIds, ids => {
  if (ids === null) viewer?.entities.removeById('analysis-box')
  applyEmergencyHighlights()
})
watch(() => store.emergencyBoxSelect, enabled => {
  if (!enabled && boxStart) {
    boxStart = null
    viewer?.entities.removeById('analysis-box-start')
  }
})
watch(() => store.focusBuildingId, id => {
  const building = buildingMap.get(id) || store.emergencyResult?.affectedBuildings.find(item => item.id === id)
  if (building && viewer) viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(building.lon, building.lat, 600) })
})
watch(() => store.profileFocusIndex, index => {
  if (!viewer || index < 0) return
  const point = store.profileResult?.points[index]
  if (!point) return
  viewer.entities.removeById('analysis-profile-focus')
  viewer.entities.add({ id: 'analysis-profile-focus', position: Cesium.Cartesian3.fromDegrees(point.lon, point.lat),
    point: { pixelSize: 13, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 } })
})

onMounted(async () => {
  viewer = createCityViewer(containerRef.value!)
  baseMap = createBaseMap(viewer, message => { mapStore.baseMapError = message })
  baseMap.switchBaseMap(mapStore.baseMap)
  layers = createSceneLayers(viewer, store)
  viewer.screenSpaceEventHandler.setInputAction(onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)
  viewer.scene.morphComplete.addEventListener(onMorphComplete)
  setCameraToCity()
  viewer.camera.moveEnd.addEventListener(scheduleVisibleLoad)
  void api.health().then(health => { store.sourceMode = health.mode }).catch(() => {})
  await Promise.all([loadBuildings(), loadOtherLayers()])
  const token = import.meta.env.VITE_CESIUM_ION_TOKEN
  if (token && viewer && !viewer.isDestroyed()) {
    store.terrainStatus = 'loading'
    Cesium.Ion.defaultAccessToken = token
    try {
      const provider = await Cesium.createWorldTerrainAsync()
      if (!viewer || viewer.isDestroyed()) return
      // Keep the demo globe at ellipsoid height so its synthetic building boxes remain visible.
      // This provider is used only to sample the profile line.
      samplingTerrainProvider = provider
      terrainReady = true
      store.terrainStatus = 'ready'
    } catch (error) {
      store.terrainStatus = 'error'
      console.warn('[CityScene] 地形服务不可用，剖面已禁用', error)
    }
  }
})

onUnmounted(() => {
  buildingController?.abort()
  layerController?.abort()
  analysisController?.abort()
  if (moveTimer) clearTimeout(moveTimer)
  if (viewer && !viewer.isDestroyed()) {
    baseMap?.dispose()
    viewer.scene.morphComplete.removeEventListener(onMorphComplete)
    viewer.camera.moveEnd.removeEventListener(scheduleVisibleLoad)
    disposeCityViewer(viewer)
  }
  viewer = null
  layers = null
  samplingTerrainProvider = null
  terrainReady = false
})
</script>

<style scoped>
.city-scene { position: absolute; inset: 0; }
</style>
