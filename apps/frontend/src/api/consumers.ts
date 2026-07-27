import api from './client'
import type { Consumer, CreateConsumerPayload } from '../types/consumer'
import type { TariffFamily } from '../types/tariff'
import { getTariffFamilies } from './tariffs'

export async function getConsumers(): Promise<Consumer[]> {
  const { data } = await api.get<Consumer[]>('/consumers')
  return data
}

/** @deprecated используйте getTariffFamilies */
export async function getTariffs(): Promise<TariffFamily[]> {
  return getTariffFamilies()
}

export async function createConsumer(
  payload: CreateConsumerPayload,
): Promise<Consumer> {
  const { data } = await api.post<Consumer>('/consumers', payload)
  return data
}

export async function updateConsumer(
  id: string,
  payload: Partial<CreateConsumerPayload>,
): Promise<Consumer> {
  const { data } = await api.patch<Consumer>(`/consumers/${id}`, payload)
  return data
}

export async function deleteConsumer(id: string): Promise<Consumer> {
  const { data } = await api.delete<Consumer>(`/consumers/${id}`)
  return data
}

export async function hardDeleteConsumer(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/consumers/${id}/permanent`,
  )
  return data
}
