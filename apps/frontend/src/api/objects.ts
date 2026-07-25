import api from './client'
import type { AuthUser } from '../types/auth'
import type { CreateObjectPayload, EnergyObject } from '../types/object'

export async function getObjects(): Promise<EnergyObject[]> {
  const { data } = await api.get<EnergyObject[]>('/objects')
  return data
}

export async function getManagers(): Promise<AuthUser[]> {
  const { data } = await api.get<AuthUser[]>('/users')
  return data.filter((user) => user.role === 'object_manager')
}

export async function createObject(
  payload: CreateObjectPayload,
): Promise<EnergyObject> {
  const { data } = await api.post<EnergyObject>('/objects', payload)
  return data
}

export async function updateObject(
  id: string,
  payload: Partial<CreateObjectPayload>,
): Promise<EnergyObject> {
  const { data } = await api.patch<EnergyObject>(`/objects/${id}`, payload)
  return data
}

export async function deleteObject(id: string): Promise<EnergyObject> {
  const { data } = await api.delete<EnergyObject>(`/objects/${id}`)
  return data
}

export async function hardDeleteObject(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/objects/${id}/permanent`,
  )
  return data
}
