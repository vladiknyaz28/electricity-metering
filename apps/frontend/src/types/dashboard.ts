export interface DashboardKpi {
  objectsCount: number
  consumersCount: number
  metersCount: number
  totalConsumption: number
  totalAmount: number
}

export interface DashboardTrendPoint {
  period: string
  consumption: number
  amount: number
}

export interface DashboardByObject {
  objectName: string
  consumption: number
  amount: number
}

export interface DashboardByResource {
  resourceType: string
  consumption: number
}

export interface DashboardAnomaly {
  meterId: string
  meterName: string
  objectName: string
  period: string
  minusovka: number
  readingDate: string
}

export interface DashboardRecentReading {
  meterId: string
  meterName: string
  objectName: string
  date: string
  consumption: number | null
  createdAt: string
}

export interface DashboardSummary {
  kpi: DashboardKpi
  consumptionTrend: DashboardTrendPoint[]
  byObject: DashboardByObject[]
  byResourceType: DashboardByResource[]
  anomalies: DashboardAnomaly[]
  recentReadings: DashboardRecentReading[]
}

export interface DashboardSummaryParams {
  periodStart?: string
  periodEnd?: string
  objectId?: string
  resourceTypeId?: string
}
