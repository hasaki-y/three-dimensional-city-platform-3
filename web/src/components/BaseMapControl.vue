<template>
  <div class="base-map-control" aria-label="底图选择">
    <span>底图</span>
    <button v-for="item in options" :key="item.value" :class="{ active: map.baseMap === item.value }"
      :aria-pressed="map.baseMap === item.value" @click="map.baseMap = item.value">{{ item.label }}</button>
    <p v-if="map.baseMapError">{{ map.baseMapError }} <button @click="map.baseMapRetry++">重试</button></p>
  </div>
</template>
<script setup lang="ts">
import { useMapStore } from '../stores/map'
import type { BaseMapType } from '../types/map'
const map = useMapStore()
const options: { value: BaseMapType; label: string }[] = [
  { value: 'dark', label: '深色' }, { value: 'light', label: '浅色' }, { value: 'imagery', label: '影像' },
]
</script>
<style scoped>
.base-map-control { position: absolute; top: 12px; right: 12px; z-index: 2; padding: 8px; border-radius: 8px; background: #102139eb; color: #cfdbeb; font-size: 12px; max-width: 280px; }
button { margin-left: 6px; padding: 5px 8px; background: #24374d; color: #d5e2ef; border: 1px solid transparent; border-radius: 4px; cursor: pointer; }
button.active { border-color: #7ac8ce; color: #8fe1dc; }
p { color: #ffbda0; line-height: 1.5; margin: 8px 0 0; }
</style>
