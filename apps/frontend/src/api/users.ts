import api from './client'
import type { AuthUser, UserRole } from '../types/auth'

export interface CreateUserPayload {
  fullName: string
  email: string
  password: string
  role: UserRole | string
  consumerId?: string | null
  status?: string
}

export interface UpdateUserPayload {
  fullName?: string
  email?: string
  password?: string
  role?: UserRole | string
  consumerId?: string | null
  status?: string
}

export async function getUsers(params?: {
  role?: string
  consumerId?: string
}): Promise<AuthUser[]> {
  const { data } = await api.get<AuthUser[]>('/users', {
    params: {
      role: params?.role,
      consumerId: params?.consumerId,
    },
  })
  return data
}

export async function createUser(payload: CreateUserPayload): Promise<AuthUser> {
  const { data } = await api.post<AuthUser>('/users', payload)
  return data
}

export async function updateUser(
  id: string,
  payload: UpdateUserPayload,
): Promise<AuthUser> {
  const { data } = await api.patch<AuthUser>(`/users/${id}`, payload)
  return data
}

export async function deleteUser(id: string): Promise<AuthUser> {
  const { data } = await api.delete<AuthUser>(`/users/${id}`)
  return data
}

export async function hardDeleteUser(
  id: string,
): Promise<{ message: string }> {
  const { data } = await api.delete<{ message: string }>(
    `/users/${id}/permanent`,
  )
  return data
}
