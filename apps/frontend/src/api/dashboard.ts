import api from './client'
import type {
  DashboardByConsumer,
  DashboardByConsumerParams,
  DashboardSummary,
  DashboardSummaryParams,
} from '../types/dashboard'

export async function getDashboardSummary(
  params: DashboardSummaryParams,
): Promise<DashboardSummary> {
  const { data } = await api.get<DashboardSummary>('/dashboard/summary', {
    params,
  })
  return data
}

export async function getDashboardByConsumer(
  params: DashboardByConsumerParams,
): Promise<DashboardByConsumer[]> {
  const { data } = await api.get<DashboardByConsumer[]>(
    '/dashboard/by-consumer',
    {
      params: {
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        objectId: params.objectId,
        resourceTypeId: params.resourceTypeId,
        consumerIds: params.consumerIds?.length
          ? params.consumerIds.join(',')
          : undefined,
      },
    },
  )
  return data
}
