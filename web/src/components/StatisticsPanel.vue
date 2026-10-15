<template>
  <div class="statistics-panel">
    <h3>城市统计</h3>
    <p v-if="error" class="error">{{ error }} <button @click="loadStats">重试</button></p>
    <div ref="pieRef" class="chart"></div>
    <div ref="barRef" class="chart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { api } from '../api'

const pieRef = ref<HTMLDivElement | null>(null)
const barRef = ref<HTMLDivElement | null>(null)
const error = ref('')
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null

async function loadStats() {
  error.value = ''
  try {
    const [byType, byHeight] = await Promise.all([api.aggregate('type'), api.aggregate('heightBand')])
    if (!pieChart || !barChart) return
    pieChart.setOption({
      tooltip: { trigger: 'item' },
      legend: { bottom: 0, textStyle: { color: '#e0e6ed', fontSize: 10 } },
      series: [{ type: 'pie', radius: ['30%', '60%'],
        data: byType.map(item => ({ name: item.name, value: item.count })),
        label: { color: '#e0e6ed', fontSize: 10 } }],
    })
    barChart.setOption({
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 10, top: 20, bottom: 24 },
      xAxis: { type: 'category', data: byHeight.map(item => item.name),
        axisLabel: { color: '#e0e6ed', fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { color: '#e0e6ed', fontSize: 10 } },
      series: [{ type: 'bar', data: byHeight.map(item => item.count), itemStyle: { color: '#5b8ff9' } }],
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '统计加载失败'
  }
}

function onResize() { pieChart?.resize(); barChart?.resize() }

onMounted(() => {
  pieChart = echarts.init(pieRef.value!)
  barChart = echarts.init(barRef.value!)
  window.addEventListener('resize', onResize)
  void loadStats()
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  pieChart?.dispose()
  barChart?.dispose()
  pieChart = null
  barChart = null
})
</script>

<style scoped>
.statistics-panel { margin-bottom: 16px; }
h3 { margin: 0 0 10px; font-size: 14px; color: #5b8ff9; }
.chart { width: 100%; height: 160px; margin-bottom: 12px; }
.error { color: #ff7979; font-size: 12px; margin-bottom: 8px; }
.error button { color: #fff; background: #904545; border: 0; cursor: pointer; }
</style>
