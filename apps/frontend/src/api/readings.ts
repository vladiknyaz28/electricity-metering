import api from './client'
import type {
  CreateReadingPayload,
  MeterReading,
  MinusovkaResult,
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

export async function deleteReading(id: string): Promise<MeterReading> {
  const { data } = await api.delete<MeterReading>(`/readings/${id}`)
  return data
}

export async function getMinusovka(
  objectId: string,
  periodStart: string,
  periodEnd: string,
): Promise<MinusovkaResult> {
  const { data } = await api.get<MinusovkaResult>(
    `/objects/${objectId}/minusovka`,
    {
      params: { periodStart, periodEnd },
    },
  )
  return data
}
