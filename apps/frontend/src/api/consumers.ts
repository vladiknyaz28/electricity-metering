import api from './client'
import type {
  Consumer,
  CreateConsumerPayload,
  TariffOption,
} from '../types/consumer'

export async function getConsumers(): Promise<Consumer[]> {
  const { data } = await api.get<Consumer[]>('/consumers')
  return data
}

export async function getTariffs(): Promise<TariffOption[]> {
  const { data } = await api.get<TariffOption[]>('/tariffs')
  return data
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
