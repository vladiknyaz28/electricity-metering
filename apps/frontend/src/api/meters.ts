import api from './client'
import type { CreateMeterPayload, Meter } from '../types/meter'

export async function getMeters(): Promise<Meter[]> {
  const { data } = await api.get<Meter[]>('/meters')
  return data
}

export async function getMeter(id: string): Promise<Meter> {
  const { data } = await api.get<Meter>(`/meters/${id}`)
  return data
}

export async function createMeter(payload: CreateMeterPayload): Promise<Meter> {
  const { data } = await api.post<Meter>('/meters', payload)
  return data
}

export async function updateMeter(
  id: string,
  payload: Partial<CreateMeterPayload>,
): Promise<Meter> {
  const { data } = await api.patch<Meter>(`/meters/${id}`, payload)
  return data
}

export async function deleteMeter(id: string): Promise<Meter> {
  const { data } = await api.delete<Meter>(`/meters/${id}`)
  return data
}

export async function hardDeleteMeter(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/meters/${id}/permanent`,
  )
  return data
}
