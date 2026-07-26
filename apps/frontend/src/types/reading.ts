export interface MeterReading {
  id: string
  meterId: string
  valueT1: number
  valueT2: number | null
  valueT3: number | null
  readingDate: string
  source: string
  comment: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateReadingPayload {
  meterId: string
  readingDate: string
  valueT1: number
  valueT2?: number | null
  valueT3?: number | null
  comment?: string | null
}

export type UpdateReadingPayload = Partial<
  Omit<CreateReadingPayload, 'meterId'>
>

export interface MinusovkaBreakdownItem {
  meterId: string
  meterName: string
  consumerName: string | null
  consumption: number
}

export type MinusovkaResult =
  | { hasMainMeter: false }
  | {
      hasMainMeter: true
      mainMeterId: string
      mainConsumption: number
      subConsumersConsumption: number
      minusovka: number
      isAnomaly: boolean
      breakdown: MinusovkaBreakdownItem[]
    }
