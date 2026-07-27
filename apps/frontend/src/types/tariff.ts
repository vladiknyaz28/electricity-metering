export interface TariffZone {
  id?: string
  zoneCode: string
  rate: number
}

export interface TariffResourceTypeRef {
  id: string
  name: string
  unit: string
  isSystem: boolean
  status: string
}

export interface TariffVersion {
  id: string
  name: string
  familyId: string | null
  resourceTypeId: string
  resourceTypeCode: string
  resourceType?: TariffResourceTypeRef | null
  status: string
  validFrom: string
  validTo: string | null
  zones: TariffZone[]
  createdAt?: string
  updatedAt?: string
}

export interface TariffFamily {
  familyId: string
  name: string
  status: string
  resourceTypeId: string
  resourceType: TariffResourceTypeRef | null
  currentVersion: TariffVersion
}

export interface TariffHistory {
  familyId: string
  name: string
  versions: TariffVersion[]
}

export interface CreateTariffPayload {
  name: string
  resourceTypeId: string
  validFrom: string
  zones: Array<{ zoneCode: string; rate: number }>
}

export interface NewTariffVersionPayload {
  validFrom: string
  rateT1?: number
  rateT2?: number
  rateT3?: number
}
