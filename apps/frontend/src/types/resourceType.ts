export interface ResourceType {
  id: string
  name: string
  unit: string
  isSystem: boolean
  status: string
  _count?: { meters: number }
  createdAt?: string
  updatedAt?: string
}

export interface CreateResourceTypePayload {
  name: string
  unit: string
}

export type UpdateResourceTypePayload = Partial<{
  name: string
  unit: string
  status: string
}>
