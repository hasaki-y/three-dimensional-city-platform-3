import * as Cesium from 'cesium'
import type { useStore } from '../store'

export type LayerKey = 'buildings' | 'pois' | 'roads' | 'water'

export function createSceneLayers(viewer: Cesium.Viewer, store: ReturnType<typeof useStore>) {
  const sources = {
    buildings: new Cesium.CustomDataSource('buildings'),
    pois: new Cesium.CustomDataSource('pois'),
    roads: new Cesium.CustomDataSource('roads'),
    water: new Cesium.CustomDataSource('water'),
    poiResults: new Cesium.CustomDataSource('poiResults'),
  }
  for (const [key, source] of Object.entries(sources)) {
    viewer.dataSources.add(source)
    source.show = key === 'poiResults' || store.layers[key as LayerKey]
  }
  for (const source of [sources.pois, sources.poiResults]) {
    source.clustering.pixelRange = 28
    source.clustering.minimumClusterSize = 4
    source.clustering.clusterEvent.addEventListener((_entities, cluster) => {
      cluster.label.font = '11px sans-serif'
      cluster.label.fillColor = Cesium.Color.fromCssColorString('#b9cdd9')
      cluster.label.showBackground = true
      cluster.label.backgroundColor = Cesium.Color.fromCssColorString('#243849').withAlpha(0.9)
      cluster.label.backgroundPadding = new Cesium.Cartesian2(5, 3)
      cluster.point.show = false
      cluster.billboard.show = false
    })
  }
  return {
    sources,
    syncVisibility() {
      for (const [key, source] of Object.entries(sources)) {
        source.show = key === 'poiResults' || (store.layers[key as LayerKey] && (key !== 'pois' || store.analysisMode === 'none'))
      }
    },
    updateClustering() {
      const far = viewer.camera.positionCartographic.height > 1800
      for (const source of [sources.pois, sources.poiResults]) source.clustering.enabled = far && source.entities.values.length >= 30
    },
  }
}
