<template>
  <section v-if="store.analysisMode === 'emergency'" class="emergency-panel">
    <h3>应急分析结果</h3>
    <p v-if="store.emergencyStatus === 'drawing'" class="hint">设置参数、点选事故位置，再点击“开始分析”。</p>
    <p v-if="store.emergencyStatus === 'submitting'" class="hint">正在查询影响区、建筑和附近设施…</p>
    <p v-if="store.emergencyError" class="error">{{ store.emergencyError }}</p>
    <template v-if="result">
      <p class="summary">{{ emergencyConfig[result.eventType].label }}模拟 · {{ result.radiusMeters }}m<br />影响 {{ result.affectedTotal }} 栋建筑；范围内 {{ result.facilitySummary.inRadius }} 个相关设施</p>
      <p v-for="row in result.facilitySummary.byCategory" :key="row.category" class="hint">{{ categoryLabel(row.category) }}：{{ row.available === 0 ? '当前数据未收录' : `范围内 ${row.inRadius} 个` }}</p>
      <p v-if="result.truncated" class="hint">建筑高亮与框选基于最多 500 栋返回结果，附近设施最多 50 个；统计数为完整范围计数。</p>
      <p v-if="result.affectedTotal === 0" class="hint">该范围内没有建筑。</p>
      <button class="clear" @click="store.emergencyBoxSelect = !store.emergencyBoxSelect">
        {{ store.emergencyBoxSelect ? '取消框选' : '框选已返回建筑' }}
      </button>
      <button v-if="store.emergencySelectedIds !== null" class="clear" @click="store.emergencySelectedIds = null">清除框选</button>
      <p v-if="store.emergencyBoxSelect" class="hint">在地图上依次点击矩形的两个对角。</p>
      <p v-if="store.emergencySelectedIds !== null" class="hint">框中 {{ store.emergencySelectedIds.length }} 栋已返回建筑。</p>
      <div ref="chartRef" class="chart"></div>
      <button v-if="store.emergencyTypeFilter" class="clear" @click="store.emergencyTypeFilter = ''">清除图表筛选</button>
      <h4>受影响建筑（列表显示筛选后的前 80 栋，点击定位）</h4>
      <div class="list">
        <button v-for="building in visibleBuildings" :key="building.id" class="item" @click="store.focusBuildingId = building.id">
          <span>{{ building.name }}</span><small>{{ building.type }} · {{ building.id }}</small>
        </button>
      </div>
      <h4>最近资源（每类最多 5 个，可在范围外）</h4>
      <p v-for="poi in result.nearestFacilities" :key="poi.id" class="facility" @click="store.selectPoi(poi)">{{ categoryLabel(poi.category) }} · {{ poi.name }} · {{ Math.round(poi.distanceMeters || 0) }} m</p>
      <p v-if="!result.nearestFacilities.length" class="hint">没有该类别设施。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useStore } from '../store'
import { categoryLabel } from '../config/facilities'
import { emergencyConfig } from '../config/emergency'

const store = useStore()
const result = computed(() => store.emergencyResult)
const selectedBuildings = computed(() => {
  const selected = store.emergencySelectedIds ? new Set(store.emergencySelectedIds) : null
  return (result.value?.affectedBuildings || []).filter(item => !selected || selected.has(item.id))
})
const chartItems = computed(() => {
  if (store.emergencySelectedIds === null) return result.value?.statistics.byType || []
  const counts = new Map<string, number>()
  for (const item of selectedBuildings.value) counts.set(item.type, (counts.get(item.type) || 0) + 1)
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
})
const visibleBuildings = computed(() => (result.value?.affectedBuildings || [])
  .filter(item => store.emergencySelectedIds === null || store.emergencySelectedIds.includes(item.id))
  .filter(item => !store.emergencyTypeFilter || item.type === store.emergencyTypeFilter)
  .slice(0, 80))
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null

watch([result, chartItems], async ([current, items]) => {
  chart?.dispose()
  chart = null
  if (!current) return
  await nextTick()
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 34, right: 8, top: 10, bottom: 52 },
    xAxis: { type: 'category', data: items.map(item => item.name),
      axisLabel: { color: '#c6d3e4', rotate: 35 } },
    yAxis: { type: 'value', axisLabel: { color: '#c6d3e4' } },
    series: [{ type: 'bar', data: items.map(item => item.count), itemStyle: { color: '#f6bd16' } }],
  })
  chart.on('click', event => {
    if (typeof event.name === 'string') store.emergencyTypeFilter = event.name
  })
})

onUnmounted(() => { chart?.dispose() })
</script>

<style scoped>
.emergency-panel { margin: 16px 0; border-top: 1px solid #1e3a5f; padding-top: 14px; }
h3 { color: #5b8ff9; font-size: 14px; margin-bottom: 10px; }
h4 { color: #9db7d7; font-size: 12px; margin: 10px 0 6px; }
.summary { color: #f6bd16; font-size: 13px; line-height: 1.5; }
.hint { color: #7a8ba8; font-size: 12px; line-height: 1.5; }
.error { color: #ff7979; font-size: 12px; }
.chart { height: 190px; width: 100%; }
.list { max-height: 210px; overflow: auto; }
.item { display: flex; flex-direction: column; width: 100%; padding: 6px; margin-bottom: 4px;
  background: #132744; border: 0; color: #e0e6ed; text-align: left; cursor: pointer; }
.item:hover { background: #25476f; }
.item small, .facility { color: #9db7d7; font-size: 11px; }
.facility { padding: 3px 0; }
.clear { padding: 4px 8px; border: 0; border-radius: 4px; color: white; background: #3a587c; cursor: pointer; }
</style>
