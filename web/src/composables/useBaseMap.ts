import { Credit, ImageryLayer, UrlTemplateImageryProvider, type Viewer } from 'cesium'
import type { BaseMapType } from '../types/map'

const grayCredit = 'Sources: Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS User Community'
const sources = {
  dark: { url: import.meta.env.VITE_BASEMAP_DARK_URL || 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', credit: grayCredit, max: 16 },
  light: { url: import.meta.env.VITE_BASEMAP_LIGHT_URL || 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', credit: grayCredit, max: 16 },
  imagery: { url: import.meta.env.VITE_BASEMAP_IMAGERY_URL || 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community', max: 19 },
}

// Only the owned imagery layer changes; business data sources and camera stay intact.
export function createBaseMap(viewer: Viewer, onError: (message: string) => void) {
  let layer: ImageryLayer | null = null
  let removeError: (() => void) | undefined
  function switchBaseMap(type: BaseMapType) {
    const source = sources[type]
    const provider = new UrlTemplateImageryProvider({ url: source.url, maximumLevel: source.max,
      credit: new Credit(import.meta.env.VITE_BASEMAP_CREDIT || source.credit, true) })
    removeError?.()
    if (layer) viewer.imageryLayers.remove(layer, true)
    onError('')
    layer = viewer.imageryLayers.addImageryProvider(provider, 0)
    removeError = provider.errorEvent.addEventListener(() => onError('底图加载失败，请重试或切换底图。'))
    if (type === 'imagery') { layer.saturation = 0.55; layer.brightness = 0.7 }
  }
  return { switchBaseMap, dispose() {
    removeError?.()
    if (layer && !viewer.isDestroyed()) viewer.imageryLayers.remove(layer, true)
    layer = null
  } }
}
