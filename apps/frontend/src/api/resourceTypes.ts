import api from './client'
import type {
  CreateResourceTypePayload,
  ResourceType,
  UpdateResourceTypePayload,
} from '../types/resourceType'

export async function getResourceTypes(): Promise<ResourceType[]> {
  const { data } = await api.get<ResourceType[]>('/resource-types')
  return data
}

export async function createResourceType(
  payload: CreateResourceTypePayload,
): Promise<ResourceType> {
  const { data } = await api.post<ResourceType>('/resource-types', payload)
  return data
}

export async function updateResourceType(
  id: string,
  payload: UpdateResourceTypePayload,
): Promise<ResourceType> {
  const { data } = await api.patch<ResourceType>(`/resource-types/${id}`, payload)
  return data
}

export async function deleteResourceType(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/resource-types/${id}`,
  )
  return data
}
