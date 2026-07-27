import api from './client'
import type {
  CreateTariffPayload,
  NewTariffVersionPayload,
  TariffFamily,
  TariffHistory,
  TariffVersion,
} from '../types/tariff'

export async function getTariffFamilies(): Promise<TariffFamily[]> {
  const { data } = await api.get<TariffFamily[]>('/tariffs/families')
  return data
}

export async function getTariffHistory(
  familyId: string,
): Promise<TariffHistory> {
  const { data } = await api.get<TariffHistory>(`/tariffs/${familyId}/history`)
  return data
}

export async function createTariff(
  payload: CreateTariffPayload,
): Promise<TariffVersion> {
  const { data } = await api.post<TariffVersion>('/tariffs', payload)
  return data
}

export async function createTariffVersion(
  familyId: string,
  payload: NewTariffVersionPayload,
): Promise<TariffVersion> {
  const { data } = await api.post<TariffVersion>(
    `/tariffs/${familyId}/new-version`,
    payload,
  )
  return data
}

export async function deleteTariffFamily(
  familyId: string,
): Promise<{ familyId: string; message: string }> {
  const { data } = await api.delete<{ familyId: string; message: string }>(
    `/tariffs/families/${familyId}`,
  )
  return data
}

/** @deprecated use deleteTariffFamily */
export async function deactivateTariffFamily(
  familyId: string,
): Promise<{ familyId: string; message: string }> {
  return deleteTariffFamily(familyId)
}
