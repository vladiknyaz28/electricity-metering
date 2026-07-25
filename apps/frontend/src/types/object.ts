export interface ObjectManager {
  id: string
  fullName: string
  email: string
}

export interface EnergyObject {
  id: string
  name: string
  address: string
  typeCode: string
  categoryCode: string
  status: string
  managerId: string | null
  manager: ObjectManager | null
  _count: { meters: number; consumers: number }
  createdAt: string
  updatedAt: string
}

export interface CreateObjectPayload {
  name: string
  address: string
  typeCode: string
  categoryCode: string
  status?: string
  managerId?: string | null
}
