// Teaching scenarios only; these radii are not emergency response standards.
export const emergencyConfig = {
  fire: { label: '火灾', defaultRadius: 500, facilities: ['hospital', 'fire_station'] },
  explosion: { label: '爆炸', defaultRadius: 800, facilities: ['hospital', 'fire_station', 'shelter'] },
  chemical: { label: '化学泄漏', defaultRadius: 1200, facilities: ['hospital', 'shelter'] },
}
export type EmergencyType = keyof typeof emergencyConfig
