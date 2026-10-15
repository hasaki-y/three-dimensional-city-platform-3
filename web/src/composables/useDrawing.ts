import * as Cesium from 'cesium'

export function equidistantProfileSamples(start: Cesium.Cartographic, end: Cesium.Cartographic) {
  const geodesic = new Cesium.EllipsoidGeodesic(start, end)
  const totalDistanceMeters = geodesic.surfaceDistance
  if (totalDistanceMeters < 10 || totalDistanceMeters > 10000) {
    throw new Error('剖面线长度应为 10 米到 10 公里，请重新绘制')
  }
  const count = Math.min(200, Math.max(2, Math.ceil(totalDistanceMeters / 50) + 1))
  const positions: Cesium.Cartographic[] = []
  for (let i = 0; i < count; i++) {
    positions.push(geodesic.interpolateUsingSurfaceDistance(totalDistanceMeters * i / (count - 1)))
  }
  return { positions, totalDistanceMeters, sampleSpacingMeters: totalDistanceMeters / (count - 1) }
}
