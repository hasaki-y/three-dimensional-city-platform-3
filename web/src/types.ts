import type { Feature, LineString, Polygon } from 'geojson'
import type { EmergencyType } from './config/emergency'

export interface Building {
  id: string
  name: string
  type: string
  district: string
  floors: number
  height: number
  area: number
  year: number
  lon: number
  lat: number
}

export interface Poi {
  id: string
  name: string
  type: string
  category: string
  district: string
  lon: number
  lat: number
  distanceMeters?: number
}

export interface Page<T> { items: T[]; total: number; limit: number; offset: number }
export interface LayerFeatureProperties { id: string; name: string; type: string }
export type RoadFeature = Feature<LineString, LayerFeatureProperties>
export type WaterFeature = Feature<Polygon, LayerFeatureProperties>
export interface BboxQuery { bbox?: string; limit?: number; offset?: number }
export interface BuildingQuery extends BboxQuery { type?: string; minFloors?: number }
export interface PoiQuery extends BboxQuery { category?: string }

export interface BufferResult {
  center: { lon: number; lat: number }
  radiusMeters?: number
  radiusKm?: number
  count: number
  buildings: Building[]
  circle: Polygon | null
  truncated?: boolean
}

export interface EmergencyInput {
  lon: number
  lat: number
  radiusMeters: number
  categories: string[]
  eventType: EmergencyType
}

export interface EmergencyResult {
  eventId: string
  center: { lon: number; lat: number }
  radiusMeters: number
  eventType: EmergencyType
  impactArea: Polygon
  affectedTotal: number
  affectedBuildings: Building[]
  facilitySummary: { categories: string[]; inRadius: number; byCategory: { category: string; inRadius: number; available: number }[] }
  nearbyFacilities: Poi[]
  nearestFacilities: Poi[]
  statistics: { byType: Array<{ name: string; count: number }> }
  truncated: boolean
}

export interface ProfilePoint { lon: number; lat: number; distanceMeters: number; elevationMeters: number | null }
export interface FacilityInput {
  lon: number; lat: number; category: string; mode: 'nearest' | 'radius'; limit: number; radiusMeters: number
}
export interface FacilityResult {
  center: { lon: number; lat: number }; category: string; mode: 'nearest' | 'radius'; radiusMeters: number | null
  count: number; results: Poi[]; truncated: boolean; area: Polygon | null
}
export interface ProfileResult {
  source: 'terrain'
  sampleSpacingMeters: number
  totalDistanceMeters: number
  points: ProfilePoint[]
  minElevationMeters: number | null
  maxElevationMeters: number | null
}
