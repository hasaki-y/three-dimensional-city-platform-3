<template>
  <div class="app">
    <header class="topbar">
      <h1>三维城市空间分析平台 3.0</h1>
      <span class="subtitle">城市浏览 · 设施查询 · 应急分析</span>
      <button class="panel-toggle" @click="showResults = !showResults">{{ showResults ? '收起结果' : '查看结果' }}</button>
    </header>

    <div class="main">
      <aside class="panel left">
         <ControlPanel />
      </aside>


      <div class="scene-wrap">
        <CityScene />
        <BaseMapControl />
      </div>


      <aside v-show="showResults" class="panel right">
        <StatisticsPanel v-if="showResults && store.analysisMode === 'none'" />
        <QueryResultPanel />
        <EmergencyPanel />
        <ProfilePanel />
        <FeatureInfo />
      </aside>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useStore } from './store'
import BaseMapControl from './components/BaseMapControl.vue'
import QueryResultPanel from './components/QueryResultPanel.vue'
import StatisticsPanel from './components/StatisticsPanel.vue'
import ControlPanel from './components/ControlPanel.vue'
import CityScene from './components/CityScene.vue'
import FeatureInfo from './components/FeatureInfo.vue'
import EmergencyPanel from './components/EmergencyPanel.vue'
import ProfilePanel from './components/ProfilePanel.vue'
const store = useStore()
const showResults = ref(window.innerWidth >= 1000)
watch(() => [store.queryStatus, store.emergencyStatus, store.selected, store.selectedPoi], () => {
  if (store.queryStatus === 'completed' || store.queryStatus === 'error' || store.emergencyStatus === 'completed' || store.emergencyStatus === 'error' || store.selected || store.selectedPoi) showResults.value = true
})
</script>

<style>
/* 全局布局。原项目这里没有 <style>，.app/.main/.topbar/.panel/.scene-wrap
   这些类名全都没有任何样式规则 → 三栏布局完全不成立。 */
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  flex-shrink: 0;
  height: 62px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 0 20px;
  background: linear-gradient(90deg, #0b1a30, #0a1428);
  border-bottom: 1px solid #1e3a5f;
}
.topbar h1 {
  font-size: 18px;
  font-weight: 600;
  color: #e0e6ed;
  letter-spacing: 1px;
}
.subtitle { font-size: 12px; color: #7a8ba8; }

/* ⭐ min-height: 0 必须！flex 子项默认 min-height:auto，
   会让下面的 panel 撑破屏幕、overflow-y:auto 失效 */
.main {
  position: relative;
  flex: 1;
  display: flex;
  min-height: 0;
}

.panel {
  flex-shrink: 0;
  padding: 16px;
  background: rgba(10, 20, 40, 0.92);
  overflow-y: auto;
}
.panel.left  { width: clamp(220px, 20vw, 260px); border-right: 1px solid #1e3a5f; }
.panel.right { width: clamp(300px, 28vw, 380px); border-left: 1px solid #1e3a5f; }

/* ⭐ position: relative 必须！
   CityScene 的 .city-scene 和 ParticleLayer 的 .particle-layer 都是
   position:absolute; inset:0。父容器不是定位元素时，它们会相对
   “初始包含块”（≈整个视口）定位，直接盖住左右两个面板。 */
.scene-wrap {
  flex: 1;
  position: relative;
  min-width: 0;
  overflow: hidden;
}
.panel-toggle { margin-left: auto; align-self: center; border: 1px solid #395269; background: #21374b; color: #cbd9e6; padding: 6px 10px; border-radius: 5px; cursor: pointer; white-space: nowrap; }
@media (max-width: 1100px) {
  .panel.right { position: absolute; z-index: 3; right: 8px; top: 56px; bottom: 12px; width: min(280px, 42vw); border: 1px solid #395269; border-radius: 8px; }
  .subtitle { display: none; }
  .topbar { align-items: center; padding: 0 12px; }
  .topbar h1 { font-size: 15px; }
  .panel.left { width: 190px; padding: 12px; }
}
</style>
