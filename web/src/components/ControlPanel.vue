<template>
  <div class="control-panel">
    <p class="source">{{ store.sourceMode === 'demo' ? '教学模拟数据' : 'PostGIS 数据库模式' }} · 非应急决策依据</p>
    <p v-if="store.loadStatus === 'loading'" class="hint">正在加载视野内建筑…</p>
    <p v-if="store.loadStatus === 'ready'" class="hint">视野内 {{ store.loadedBuildings }} / {{ store.totalBuildings }} 栋建筑</p>
    <p v-if="store.loadError" class="error">{{ store.loadError }} <button @click="store.reloadToken++">重试</button></p>
    <h3>基础场景</h3>
    <div class="row"><button @click="store.viewMode = '3d'">三维</button><button @click="store.viewMode = '2d'">平面</button></div>
    <details>
      <summary>建筑查询</summary>
      <label>建筑类型<select v-model="store.filter.type"><option value="">全部</option><option v-for="t in types" :key="t">{{ t }}</option></select></label>
      <label>最低楼层<input v-model.number="store.filter.minFloors" type="number" min="0" max="300" placeholder="不限" /></label>
      <button @click="store.filter.type = ''; store.filter.minFloors = null">重置筛选</button>
    </details>
    <details>
      <summary>图层管理</summary>
      <label class="check"><input v-model="store.layers.buildings" type="checkbox" />建筑</label>
      <label class="check"><input v-model="store.layers.pois" type="checkbox" />全部设施（辅助数据）</label>
      <label class="check"><input v-model="store.layers.roads" type="checkbox" />模拟道路</label>
      <label class="check"><input v-model="store.layers.water" type="checkbox" />模拟水系</label>
      <p class="hint">查询期间仅显示相关设施；退出后恢复图层设置。</p>
    </details>
    <h3>空间查询</h3>
    <button class="task" :class="{ active: store.analysisMode === 'facilities' }" @click="activate('facilities')">附近设施查询</button>
    <button class="task" :class="{ active: store.analysisMode === 'range' }" @click="activate('range')">范围内建筑查询</button>
    <h3>专题分析</h3>
    <button class="task" :class="{ active: store.analysisMode === 'emergency' }" @click="activate('emergency')">应急事件分析</button>
    <button class="task" :disabled="store.terrainStatus !== 'ready'" @click="activate('profile')">地形剖面</button>
    <p v-if="store.terrainStatus !== 'ready'" class="hint">{{ store.terrainStatus === 'loading' ? '正在连接真实地形…' : '真实地形未就绪，剖面暂不可用' }}</p>

    <section v-if="store.analysisMode !== 'none'" class="form">
      <h3>{{ taskLabel }}</h3>
      <template v-if="store.analysisMode === 'facilities'">
        <label>设施类型<select v-model="store.facilityCategory"><option v-for="c in facilityCategories" :key="c.value" :value="c.value">{{ c.label }}</option></select></label>
        <label>查询方式<select v-model="store.facilityMode"><option value="nearest">最近 N 个</option><option value="radius">指定半径内</option></select></label>
        <label v-if="store.facilityMode === 'nearest'">数量（1–20）<input v-model.number="store.facilityLimit" type="number" min="1" max="20" /></label>
        <label v-else>半径（米，1–2000）<input v-model.number="store.facilityRadiusMeters" type="number" min="1" max="2000" /></label>
      </template>
      <template v-if="store.analysisMode === 'range'">
        <label>查询半径（米，1–2000）<input v-model.number="store.rangeRadiusMeters" type="number" min="1" max="2000" /></label>
      </template>
      <template v-if="store.analysisMode === 'emergency'">
        <label>事件类型<select v-model="store.emergencyEventType" @change="changeEvent"><option v-for="(value, key) in emergencyConfig" :key="key" :value="key">{{ value.label }}</option></select></label>
        <label>影响半径（米，1–2000）<input v-model.number="store.emergencyRadiusMeters" type="number" min="1" max="2000" /></label>
        <div class="row"><button v-for="r in [300, 500, 1000, 2000]" :key="r" @click="store.emergencyRadiusMeters = r">{{ r >= 1000 ? r / 1000 + 'km' : r + 'm' }}</button></div>
        <label>需要查询的设施</label>
        <label v-for="c in emergencyCategories" :key="c.value" class="check"><input v-model="store.emergencyCategories" type="checkbox" :value="c.value" />{{ c.label }}</label>
        <p class="hint">预设半径用于教学模拟。当前数据未收录消防站和避难设施。</p>
      </template>
      <template v-if="store.analysisMode !== 'profile'">
        <button class="task" @click="store.pickingAnalysisPoint = true">{{ store.pickingAnalysisPoint ? '请在地图上点选位置' : '地图点选位置' }}</button>
        <p v-if="store.analysisPoint" class="hint">位置：{{ store.analysisPoint.lon.toFixed(5) }}, {{ store.analysisPoint.lat.toFixed(5) }}</p>
        <p v-if="validation" class="hint">{{ validation }}</p>
        <button class="task primary" :disabled="!!validation || busy" @click="store.analysisSubmitToken++">{{ busy ? '查询中…' : store.analysisMode === 'emergency' ? '开始分析' : '开始查询' }}</button>
      </template>
      <p v-else class="hint">在地图上依次选择两个剖面端点。</p>
      <button class="task" @click="store.exitAnalysis()">退出并清除结果</button>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed } from 'vue'
import { useStore, type AnalysisMode } from '../store'
import { facilityCategories } from '../config/facilities'
import { emergencyConfig } from '../config/emergency'
const store = useStore()
const types = ['住宅', '商业', '写字楼', '学校', '医院', '政府', '酒店', '文化']
const emergencyCategories = facilityCategories.filter(c => ['hospital', 'fire_station', 'shelter'].includes(c.value))
const taskLabel = computed(() => ({ none: '', facilities: '附近设施', range: '范围内建筑', emergency: '应急事件', profile: '高程剖面' })[store.analysisMode])
const busy = computed(() => store.queryStatus === 'submitting' || store.emergencyStatus === 'submitting')
const validNumber = (value: number, max: number) => Number.isFinite(value) && value >= 1 && value <= max
const validation = computed(() => {
  if (!store.analysisPoint) return '先在地图上选择位置'
  if (store.analysisMode === 'facilities') {
    if (store.facilityMode === 'nearest' && (!validNumber(store.facilityLimit, 20) || !Number.isInteger(store.facilityLimit))) return '数量须为 1–20 的整数'
    if (store.facilityMode === 'radius' && !validNumber(store.facilityRadiusMeters, 2000)) return '半径须在 1–2000 米之间'
  }
  if (store.analysisMode === 'range' && !validNumber(store.rangeRadiusMeters, 2000)) return '半径须在 1–2000 米之间'
  if (store.analysisMode === 'emergency') {
    if (!validNumber(store.emergencyRadiusMeters, 2000)) return '半径须在 1–2000 米之间'
    if (!store.emergencyCategories.length) return '至少选择一类应急设施'
  }
  return ''
})
function activate(mode: AnalysisMode) {
  if (store.analysisMode === mode) return
  store.analysisMode = mode
}
function changeEvent() {
  const config = emergencyConfig[store.emergencyEventType]
  store.emergencyRadiusMeters = config.defaultRadius
  store.emergencyCategories = [...config.facilities]
}
</script>
<style scoped>
.control-panel { font-size: 12px; color: #c5d5e5; }
h3 { margin: 18px 0 9px; font-size: 13px; color: #8caed0; }
.source { color: #b5c8d5; line-height: 1.5; }
.hint { color: #91a5bc; line-height: 1.6; margin: 7px 0; font-size: 11px; }
.error { color: #ff9a8e; }
label { display: block; margin: 10px 0 5px; }
select, input[type=number] { width: 100%; box-sizing: border-box; padding: 7px; margin-top: 5px; background: #101f32; color: #dce7f0; border: 1px solid #30465e; border-radius: 5px; }
button { background: #1b3048; border: 1px solid #31485f; color: #d5e2ed; padding: 7px; border-radius: 5px; cursor: pointer; }
button:hover { background: #294561; }
button:disabled { opacity: .45; cursor: not-allowed; }
.task { width: 100%; margin: 4px 0; text-align: left; padding: 9px; }
.task.active, .primary { background: #215457; border-color: #548d90; }
.row { display: flex; gap: 5px; margin-top: 7px; }
.row button { flex: 1; font-size: 11px; }
details { margin: 13px 0; }
summary { cursor: pointer; color: #b8ccdf; }
.check { display: flex; align-items: center; gap: 7px; }
.form { border-top: 1px solid #304254; margin-top: 15px; padding-bottom: 12px; }
</style>
