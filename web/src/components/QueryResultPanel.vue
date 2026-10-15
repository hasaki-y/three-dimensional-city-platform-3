<template>
  <section v-if="['facilities', 'range'].includes(store.analysisMode)" class="results">
    <h3>{{ store.analysisMode === 'facilities' ? '设施查询结果' : '范围内建筑' }}</h3>
    <p v-if="store.queryStatus === 'idle'">设置条件并点选位置，再点击“开始查询”。</p>
    <p v-if="store.queryStatus === 'submitting'">正在查询…</p>
    <p v-if="store.queryError" class="error">{{ store.queryError }}</p>
    <template v-if="store.facilityResult">
      <p>{{ categoryLabel(store.facilityResult.category) }} · {{ store.facilityResult.mode === 'nearest' ? '最近设施' : `${store.facilityResult.radiusMeters} 米范围内` }} · {{ store.facilityResult.count }} 个</p>
      <p v-if="!store.facilityResult.count">未找到符合条件的设施。当前模拟数据未收录消防站和避难设施。</p>
      <p v-if="store.facilityResult.truncated">显示距离最近的 100 个，计数为全部匹配结果。</p>
      <div class="list"><button v-for="poi in store.facilityResult.results" :key="poi.id" @click="store.selectPoi(poi)">{{ poi.name }} <span>{{ Math.round(poi.distanceMeters || 0) }} m</span></button></div>
    </template>
    <template v-if="store.bufferResult">
      <p>{{ store.bufferResult.radiusMeters }} 米内 {{ store.bufferResult.count }} 栋建筑（按中心点判断）</p>
      <p v-if="!store.bufferResult.count">该范围内没有建筑。</p>
      <p v-if="store.bufferResult.truncated">列表和高亮显示前 500 栋，计数为完整范围。</p>
      <div class="list"><button v-for="b in store.bufferResult.buildings" :key="b.id" @click="store.selectBuilding(b); store.focusBuildingId = b.id">{{ b.name }} <span>{{ b.type }}</span></button></div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { useStore } from '../store'
import { categoryLabel } from '../config/facilities'
const store = useStore()
</script>
<style scoped>
.results { border-top: 1px solid #304254; padding: 12px 0; font-size: 12px; color: #9eb4cb; }
h3 { font-size: 14px; color: #90b4cd; }
p { line-height: 1.6; }
.error { color: #ff9a8e; }
.list { max-height: 280px; overflow-y: auto; }
button { display: flex; justify-content: space-between; gap: 8px; width: 100%; background: #182b40; color: #d2e0ec; border: 0; padding: 8px; margin: 4px 0; text-align: left; cursor: pointer; }
span { color: #99bac9; white-space: nowrap; }
</style>
