export interface MeterObjectRef {
  id: string
  name: string
}

export interface MeterConsumerRef {
  id: string
  name: string
}

export interface MeterResourceTypeRef {
  id: string
  name: string
  unit: string
  isSystem: boolean
  status: string
}

export interface MeterParentRef {
  id: string
  name: string
  serialNumber: string
}

export interface Meter {
  id: string
  objectId: string
  consumerId: string | null
  parentMeterId: string | null
  parentMeter: MeterParentRef | null
  ownerType: string
  name: string
  serialNumber: string
  resourceTypeCode: string
  resourceTypeId: string | null
  resourceType: MeterResourceTypeRef | null
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
  _count: { readings: number; children: number }
  createdAt: string
  updatedAt: string
}

export interface CreateMeterPayload {
  objectId: string
  consumerId?: string | null
  parentMeterId?: string | null
  ownerType: string
  name: string
  serialNumber: string
  resourceTypeId: string
  meterCategoryCode: string
  tariffType: string
  accuracyClass: string
  status?: string
  verificationDueDate?: string | null
  isMain?: boolean
  installationLocation: string
  hasCurrentTransformer?: boolean
  primaryCurrent?: number | null
  secondaryCurrent?: number | null
}
