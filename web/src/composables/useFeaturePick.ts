import * as Cesium from 'cesium'

export function pickEntityId(scene: Cesium.Scene, position: Cesium.Cartesian2): string | null {
  const picked = scene.pick(position)
  return picked?.id instanceof Cesium.Entity ? picked.id.id : null
}

export function pickGlobePoint(viewer: Cesium.Viewer, position: Cesium.Cartesian2) {
  const cartesian = viewer.camera.pickEllipsoid(position, viewer.scene.globe.ellipsoid)
  if (!cartesian) return null
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian)
  return { lon: Cesium.Math.toDegrees(cartographic.longitude), lat: Cesium.Math.toDegrees(cartographic.latitude) }
}
