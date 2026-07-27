/** Фиксированная палитра типов ресурса — единая для дашборда и списков. */
export const RESOURCE_TYPE_COLORS = {
  electricity: '#f5a623',
  gas: '#e5533c',
  coldWater: '#4a9fd8',
  hotWater: '#d8546e',
  heating: '#8b5cf6',
  default: '#6b7a99',
} as const

const SOFT_BG: Record<keyof typeof RESOURCE_TYPE_COLORS, string> = {
  electricity: 'rgba(245, 166, 35, 0.14)',
  gas: 'rgba(229, 83, 60, 0.14)',
  coldWater: 'rgba(74, 159, 216, 0.14)',
  hotWater: 'rgba(216, 84, 110, 0.14)',
  heating: 'rgba(139, 92, 246, 0.14)',
  default: 'rgba(107, 122, 153, 0.14)',
}

function matchKey(
  nameOrCode?: string | null,
): keyof typeof RESOURCE_TYPE_COLORS {
  const key = (nameOrCode ?? '').trim().toLowerCase()
  if (!key) return 'default'
  if (
    key.includes('электро') ||
    key === 'electricity' ||
    key === 'electric' ||
    key === 'elec'
  ) {
    return 'electricity'
  }
  if (key.includes('газ') || key === 'gas') return 'gas'
  if (
    key.includes('хвс') ||
    key.includes('холодн') ||
    key.includes('cold') ||
    key === 'cold_water'
  ) {
    return 'coldWater'
  }
  if (
    key.includes('гвс') ||
    key.includes('горяч') ||
    key.includes('hot') ||
    key === 'hot_water'
  ) {
    return 'hotWater'
  }
  if (key.includes('отопл') || key === 'heating' || key === 'heat') {
    return 'heating'
  }
  return 'default'
}

export function resourceTypeColor(nameOrCode?: string | null): string {
  return RESOURCE_TYPE_COLORS[matchKey(nameOrCode)]
}

export function resourceTypeSoftBg(nameOrCode?: string | null): string {
  return SOFT_BG[matchKey(nameOrCode)]
}

export const resourceTypeIcons: Record<string, string> = {
  Электроэнергия: '⚡',
  Газ: '🔥',
  'Холодная вода': '💧',
  'Горячая вода': '♨️',
  ХВС: '💧',
  ГВС: '♨️',
  Отопление: '🌡',
}

export function resourceTypeTitle(name: string): string {
  const icon = resourceTypeIcons[name] ?? '📦'
  return `${icon} ${name}`
}

export function defaultUnitForResource(nameOrCode?: string | null): string {
  const key = matchKey(nameOrCode)
  if (key === 'electricity') return 'кВт·ч'
  if (key === 'gas') return 'м³'
  if (key === 'coldWater' || key === 'hotWater') return 'м³'
  if (key === 'heating') return 'Гкал'
  return ''
}
