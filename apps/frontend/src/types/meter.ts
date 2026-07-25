export interface MeterObjectRef {
  id: string
  name: string
}

export interface MeterConsumerRef {
  id: string
  name: string
}

export interface Meter {
  id: string
  objectId: string
  consumerId: string | null
  name: string
  serialNumber: string
  resourceTypeCode: string
  status: string
  object: MeterObjectRef
  consumer: MeterConsumerRef | null
  _count: { readings: number }
  createdAt: string
  updatedAt: string
}
