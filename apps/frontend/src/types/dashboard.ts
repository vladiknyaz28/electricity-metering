export interface DashboardKpi {
  objectsCount: number
  consumersCount: number
  metersCount: number
  totalConsumption: number
  totalAmount: number
}

export interface DashboardResourceSlice {
  resourceTypeId: string | null
  resourceName: string
  consumption: number
  amount: number
}

export interface DashboardTrendPoint {
  period: string
  byResource: DashboardResourceSlice[]
}

export interface DashboardByObject {
  objectId: string
  objectName: string
  byResource: DashboardResourceSlice[]
}

export interface DashboardAnomaly {
  meterId: string
  meterName: string
  objectName: string
  period: string
  minusovka: number
  readingDate: string
}

export interface DashboardSummary {
  kpi: DashboardKpi
  consumptionTrend: DashboardTrendPoint[]
  byObject: DashboardByObject[]
  anomalies: DashboardAnomaly[]
}

export interface DashboardSummaryParams {
  periodStart?: string
  periodEnd?: string
  objectId?: string
  resourceTypeId?: string
}

export interface TariffZoneSlice {
  zone: 'T1' | 'T2' | 'T3'
  consumption: number
  amount: number
}

export interface TariffZoneBreakdownRow {
  resourceTypeId: string
  resourceName: string
  zones: TariffZoneSlice[]
}

export type TariffZoneBreakdownParams = DashboardSummaryParams
