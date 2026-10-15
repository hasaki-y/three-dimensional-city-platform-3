<template>
  <section v-if="store.analysisMode === 'profile'" class="profile-panel">
    <h3>沿线高程剖面</h3>
    <p v-if="store.profileStatus === 'drawing'" class="hint">依次点击起点和终点；再点击可重新绘制。</p>
    <p v-if="store.profileStatus === 'sampling'" class="hint">正在采样高程…</p>
    <p v-if="store.profileStatus === 'error'" class="error">{{ store.profileError }}</p>
    <template v-if="result">
      <p class="source">Cesium 地形服务采样</p>
      <p class="hint">长度 {{ Math.round(result.totalDistanceMeters) }} m · 间距 {{ Math.round(result.sampleSpacingMeters) }} m · {{ result.points.length }} 个点</p>
      <p class="hint">最低 {{ format(result.minElevationMeters) }} m · 最高 {{ format(result.maxElevationMeters) }} m</p>
      <div ref="chartRef" class="chart"></div>
      <p class="hint">移动鼠标到曲线上可在地图定位采样点。</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { useStore } from '../store'

const store = useStore()
const result = computed(() => store.profileResult)
const chartRef = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | null = null
function format(value: number | null) { return value === null ? '无数据' : value.toFixed(1) }

watch(result, async current => {
  chart?.dispose()
  chart = null
  if (!current) return
  await nextTick()
  if (!chartRef.value) return
  chart = echarts.init(chartRef.value)
  chart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 44, right: 12, top: 14, bottom: 28 },
    xAxis: { type: 'category', data: current.points.map(point => (point.distanceMeters / 1000).toFixed(2)),
      axisLabel: { color: '#c6d3e4', interval: Math.max(0, Math.floor(current.points.length / 5)) }, name: 'km' },
    yAxis: { type: 'value', axisLabel: { color: '#c6d3e4' }, name: 'm' },
    series: [{ type: 'line', showSymbol: false, data: current.points.map(point => point.elevationMeters),
      lineStyle: { color: '#45d6c4' }, areaStyle: { color: 'rgba(69,214,196,.2)' } }],
  })
  chart.on('mouseover', event => {
    if (typeof event.dataIndex === 'number') store.profileFocusIndex = event.dataIndex
  })
  chart.on('click', event => {
    if (typeof event.dataIndex === 'number') store.profileFocusIndex = event.dataIndex
  })
  // The line uses hidden symbols; map any position inside the chart grid to the nearest sample.
  const activeChart = chart
  activeChart.getZr().on('mousemove', event => {
    const values = activeChart.convertFromPixel({ seriesIndex: 0 }, [event.offsetX, event.offsetY])
    if (!Array.isArray(values)) return
    const index = Math.round(Number(values[0]))
    if (index >= 0 && index < current.points.length) store.profileFocusIndex = index
  })
})

onUnmounted(() => { chart?.dispose() })
</script>

<style scoped>
.profile-panel { margin: 16px 0; border-top: 1px solid #1e3a5f; padding-top: 14px; }
h3 { color: #5b8ff9; font-size: 14px; margin-bottom: 10px; }
.hint { color: #9db7d7; font-size: 12px; margin: 5px 0; line-height: 1.5; }
.error { color: #ff7979; font-size: 12px; }
.source { color: #f6bd16; font-size: 12px; }
.chart { height: 190px; width: 100%; }
</style>
