export interface ConsumerObjectRef {
  id: string
  name: string
}

export interface ConsumerTariffRef {
  id: string
  name: string
}

export interface Consumer {
  id: string
  objectId: string
  object: ConsumerObjectRef
  name: string
  type: string
  taxId: string | null
  contactPerson: string | null
  phone: string | null
  email: string | null
  area: number | null
  sharePercent: number | null
  status: string
  tariffId: string | null
  tariff: ConsumerTariffRef | null
  _count: { meters: number; users: number }
  createdAt: string
  updatedAt: string
}

export interface CreateConsumerPayload {
  objectId: string
  name: string
  type: string
  taxId?: string
  contactPerson?: string
  phone?: string
  email?: string
  area?: number
  sharePercent?: number
  tariffId?: string | null
  status?: string
}

export interface TariffOption {
  id: string
  name: string
  status: string
}
