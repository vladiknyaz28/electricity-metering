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
  ownerType: string
  name: string
  serialNumber: string
  resourceTypeCode: string
  meterCategoryCode: string
  tariffType: string
  unit: string
  accuracyClass: string
  status: string
  verificationDueDate: string | null
  isMain: boolean
  installationLocation: string
  hasCurrentTransformer: boolean
  primaryCurrent: number | null
  secondaryCurrent: number | null
  transformerRatio: number | string | null
  object: MeterObjectRef
  consumer: MeterConsumerRef | null
  _count: { readings: number }
  createdAt: string
  updatedAt: string
}

export interface CreateMeterPayload {
  objectId: string
  consumerId?: string | null
  ownerType: string
  name: string
  serialNumber: string
  resourceTypeCode: string
  meterCategoryCode: string
  tariffType: string
  unit: string
  accuracyClass: string
  status?: string
  verificationDueDate?: string | null
  isMain?: boolean
  installationLocation: string
  hasCurrentTransformer?: boolean
  primaryCurrent?: number | null
  secondaryCurrent?: number | null
}
