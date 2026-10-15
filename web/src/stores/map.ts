import { defineStore } from 'pinia'
import type { BaseMapType } from '../types/map'

export const useMapStore = defineStore('map', {
  state: () => ({ baseMap: 'dark' as BaseMapType, baseMapError: '', baseMapRetry: 0 }),
})
