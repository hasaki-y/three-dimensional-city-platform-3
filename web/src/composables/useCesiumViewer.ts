import * as Cesium from 'cesium'

export function createCityViewer(container: HTMLElement) {
  const viewer = new Cesium.Viewer(container, {
    baseLayer: false,
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  })
  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1428')
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 60
  return viewer
}

// The viewer is intentionally kept outside Pinia's reactive state.
export function disposeCityViewer(viewer: Cesium.Viewer) {
  if (!viewer.isDestroyed()) viewer.destroy()
}
