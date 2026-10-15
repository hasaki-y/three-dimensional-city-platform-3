import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import type { FacilityInput, FacilityResult } from './types'
import type { Building, Poi, RoadFeature, WaterFeature, Page, BuildingQuery, PoiQuery, BboxQuery, BufferResult, EmergencyInput, EmergencyResult } from './types'

const client = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api/v1', timeout: 15000 })

client.interceptors.response.use(undefined, error => {
  if (axios.isCancel(error)) return Promise.reject(error)
  const message = error.response?.data?.error?.message || (error.code === 'ECONNABORTED' ? '请求超时，请重试' : '网络或服务异常，请检查后端')
  return Promise.reject(new Error(message))
})

async function get<T>(path: string, params?: object, signal?: AbortSignal): Promise<T> {
  const options: AxiosRequestConfig = { params, signal }
  const response = await client.get<{ data: T }>(path, options)
  return response.data.data
}

async function post<T>(path: string, body: object, signal?: AbortSignal): Promise<T> {
  const response = await client.post<{ data: T }>(path, body, { signal })
  return response.data.data
}

export const api = {
  health: () => get<{ ok: boolean; mode: 'demo' | 'postgis'; source: string }>('/health'),
  aggregate: (by: 'type' | 'heightBand') => get<Array<{ name: string; count: number }>>('/aggregate', { by }),
  buildings: (query: BuildingQuery = {}, signal?: AbortSignal) => get<Page<Building>>('/buildings', query, signal),
  building: (id: string, signal?: AbortSignal) => get<Building>(`/buildings/${encodeURIComponent(id)}`, undefined, signal),
  pois: (query: PoiQuery = {}, signal?: AbortSignal) => get<Page<Poi>>('/pois', query, signal),
  roads: (query: BboxQuery = {}, signal?: AbortSignal) => get<Page<RoadFeature>>('/roads', query, signal),
  water: (query: BboxQuery = {}, signal?: AbortSignal) => get<Page<WaterFeature>>('/water-areas', query, signal),
  buffer: (lon: number, lat: number, radiusMeters: number, signal?: AbortSignal) =>
    post<BufferResult>('/analysis/buffer', { lon, lat, radiusMeters }, signal),
  nearest: (lon: number, lat: number, category: string, limit = 5, signal?: AbortSignal) =>
    get<{ count: number; results: Poi[] }>('/analysis/nearest', { lon, lat, category, limit }, signal),
  emergency: (input: EmergencyInput, signal?: AbortSignal) => post<EmergencyResult>('/analysis/emergency', input, signal),
  facilities: (input: FacilityInput, signal?: AbortSignal) => post<FacilityResult>('/analysis/facilities', input, signal),
}
