import api from './client'
import type {
  DashboardSummary,
  DashboardSummaryParams,
  TariffZoneBreakdownParams,
  TariffZoneBreakdownRow,
} from '../types/dashboard'

export async function getDashboardSummary(
  params: DashboardSummaryParams,
): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
    params,
  })
  return data
}

export async function getTariffZoneBreakdown(
  params: TariffZoneBreakdownParams,
): Promise<TariffZoneBreakdownRow[]> {
  const { data } = await api.get<TariffZoneBreakdownRow[]>(
    '/dashboard/tariff-zone-breakdown',
    { params },
  )
  return data
}
