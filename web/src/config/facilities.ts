export const facilityCategories = [
  { value: 'hospital', label: '医院', color: '#de8686' },
  { value: 'fire_station', label: '消防站', color: '#e7a774' },
  { value: 'bank', label: '银行', color: '#d2bc81' },
  { value: 'school', label: '学校', color: '#b29ccd' },
  { value: 'mall', label: '商场', color: '#85a7cc' },
  { value: 'shelter', label: '避难设施', color: '#8ab99c' },
]
export const categoryLabel = (value: string) => facilityCategories.find(item => item.value === value)?.label || value
export const categoryColor = (value: string) => facilityCategories.find(item => item.value === value)?.color || '#91afba'
