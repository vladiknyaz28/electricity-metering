import api from './client'
import type {
  CreateReadingPayload,
  MeterMinusovkaResult,
  MeterReading,
  ObjectMinusovkaResult,
  UpdateReadingPayload,
} from '../types/reading'

export async function getReadings(meterId: string): Promise<MeterReading[]> {
  const { data } = await api.get<MeterReading[]>('/readings', {
    params: { meterId },
  })
  return data
}

export async function createReading(
  payload: CreateReadingPayload,
): Promise<MeterReading> {
  const { data } = await api.post<MeterReading>('/readings', payload)
  return data
}

export async function updateReading(
  id: string,
  payload: UpdateReadingPayload,
): Promise<MeterReading> {
  const { data } = await api.patch<MeterReading>(`/readings/${id}`, payload)
  return data
}

export async function deleteReading(
  id: string,
  force = false,
): Promise<MeterReading> {
  const { data } = await api.delete<MeterReading>(`/readings/${id}`, {
    params: force ? { force: true } : undefined,
  })
  return data
}

export async function getMinusovka(
  objectId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ObjectMinusovkaResult> {
  const { data } = await api.get<ObjectMinusovkaResult>(
    `/objects/${objectId}/minusovka`,
    {
      params: { periodStart, periodEnd },
    },
  )
  return data
}

export async function getMeterMinusovka(
  meterId: string,
  periodStart: string,
  periodEnd: string,
): Promise<MeterMinusovkaResult> {
  const { data } = await api.get<MeterMinusovkaResult>(
    `/meters/${meterId}/minusovka`,
    {
      params: { periodStart, periodEnd },
    },
  )
  return data
}
