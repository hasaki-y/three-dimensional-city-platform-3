import { defineStore } from 'pinia'
import type { Building, Poi, BufferResult, EmergencyResult, ProfileResult, FacilityResult } from './types'
import type { EmergencyType } from './config/emergency'

export type { Building as BuildingProps } from './types'
export type AnalysisMode = 'none' | 'range' | 'facilities' | 'emergency' | 'profile'

export const useStore = defineStore('main', {
  state: () => ({
    viewMode: '3d' as '3d' | '2d',
    selected: null as Building | null,
    selectedPoi: null as Poi | null,
    filter: { type: '', minFloors: null as number | null },
    layers: { buildings: true, pois: false, roads: false, water: false },
    analysisMode: 'none' as AnalysisMode,
    bufferResult: null as BufferResult | null,
    facilityCategory: 'hospital',
    facilityMode: 'nearest' as 'nearest' | 'radius',
    facilityLimit: 5,
    facilityRadiusMeters: 500,
    facilityResult: null as FacilityResult | null,
    queryStatus: 'idle' as 'idle' | 'submitting' | 'completed' | 'error',
    queryError: '',
    rangeRadiusMeters: 500,
    analysisPoint: null as { lon: number; lat: number } | null,
    pickingAnalysisPoint: false,
    analysisSubmitToken: 0,
    emergencyResult: null as EmergencyResult | null,
    emergencyStatus: 'idle' as 'idle' | 'drawing' | 'submitting' | 'completed' | 'error',
    emergencyError: '',
    emergencyRadiusMeters: 500,
    emergencyEventType: 'fire' as EmergencyType,
    emergencyCategories: ['hospital', 'fire_station'],
    emergencyTypeFilter: '',
    emergencyBoxSelect: false,
    emergencySelectedIds: null as string[] | null,
    focusBuildingId: '',
    profileResult: null as ProfileResult | null,
    profileStatus: 'idle' as 'idle' | 'drawing' | 'sampling' | 'completed' | 'error',
    profileError: '',
    profileFocusIndex: -1,
    terrainStatus: 'unavailable' as 'unavailable' | 'loading' | 'ready' | 'error',
    sourceMode: 'demo' as 'demo' | 'postgis',
    loadStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
    loadError: '',
    loadedBuildings: 0,
    totalBuildings: 0,
    reloadToken: 0,
  }),
  actions: {
    selectBuilding(building: Building | null) {
      this.selected = building
      this.selectedPoi = null
    },
    selectPoi(poi: Poi | null) {
      this.selectedPoi = poi
      this.selected = null
    },
    exitAnalysis() {
      this.selected = null
      this.selectedPoi = null
      this.analysisMode = 'none'
      this.bufferResult = null
      this.facilityResult = null
      this.queryStatus = 'idle'
      this.queryError = ''
      this.analysisPoint = null
      this.pickingAnalysisPoint = false
      this.emergencyResult = null
      this.emergencyStatus = 'idle'
      this.emergencyError = ''
      this.emergencyTypeFilter = ''
      this.emergencyBoxSelect = false
      this.emergencySelectedIds = null
      this.focusBuildingId = ''
      this.profileResult = null
      this.profileStatus = 'idle'
      this.profileError = ''
      this.profileFocusIndex = -1
    },
  },
})
