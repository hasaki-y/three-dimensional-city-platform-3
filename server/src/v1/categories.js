// Canonical API categories; the original GeoJSON keeps its Chinese display labels.
const labels = {
  hospital: '医院', fire_station: '消防站', bank: '银行', school: '学校', mall: '商场', shelter: '避难设施',
  hotel: '酒店', bus_stop: '公交站', gas_station: '加油站', restaurant: '餐厅',
  subway_station: '地铁站', convenience_store: '便利店', parking: '停车场', pharmacy: '药店', other: '其他',
}
function categoryOf(value) {
  return Object.hasOwn(labels, value) ? value : Object.keys(labels).find(key => labels[key] === value) || 'other'
}
function normalizePoi(poi) { return { ...poi, category: categoryOf(poi.category || poi.type) } }
module.exports = { labels, categoryOf, normalizePoi }
