export interface DashboardKpiResource {
  resourceTypeId: string | null
  resourceName: string
  unit: string
  consumption: number
}

export interface DashboardKpi {
  objectsCount: number
  consumersCount: number
  metersCount: number
  totalConsumptionByResource: DashboardKpiResource[]
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

export interface DashboardByResource {
  resourceTypeId?: string | null
  resourceType: string
  unit?: string
  consumption: number
  amount: number
}

export interface DashboardByConsumer {
  consumerId: string
  consumerName: string
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
  byResourceType: DashboardByResource[]
  anomalies: DashboardAnomaly[]
}

export interface DashboardSummaryParams {
  periodStart?: string
  periodEnd?: string
  objectId?: string
  resourceTypeId?: string
}

export interface DashboardByConsumerParams extends DashboardSummaryParams {
  consumerIds?: string[]
}
