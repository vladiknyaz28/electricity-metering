export interface MeterReading {
  id: string
  meterId: string
  valueT1: number
  valueT2: number | null
  valueT3: number | null
  valueT1Display?: number | null
  valueT2Display?: number | null
  valueT3Display?: number | null
  readingDate: string
  source: string
  comment: string | null
  createdAt: string
  updatedAt: string
  transformerRatio: number
  previousValueT1: number | null
  previousValueT2: number | null
  previousValueT3: number | null
  diffT1: number | null
  diffT2: number | null
  diffT3: number | null
  consumptionT1: number | null
  consumptionT2: number | null
  consumptionT3: number | null
  totalConsumption?: number | null
  /** Остаток (минусовка) для родительского счётчика; null если нет детей / нет предыдущего */
  residualMinusovka?: number | null
  residualT1?: number | null
  residualT2?: number | null
  residualT3?: number | null
  residualIncomplete?: boolean
  hasChildren?: boolean
  childrenBreakdown?: ReadingChildBreakdown[] | null
  tariffRateT1: number | null
  tariffRateT2: number | null
  tariffRateT3: number | null
  amountT1: number | null
  amountT2: number | null
  amountT3: number | null
  totalAmount: number | null
}

export interface ReadingChildBreakdown {
  meterId: string
  label: string
  consumption: number
  hasData: boolean
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

export type ObjectMinusovkaResult =
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

export type MeterMinusovkaResult = {
  parentMeterId: string
  parentMeterName: string
  parentConsumption: number
  childrenConsumption: number
  minusovka: number
  isAnomaly: boolean
  breakdown: MinusovkaBreakdownItem[]
}

/** @deprecated use ObjectMinusovkaResult */
export type MinusovkaResult = ObjectMinusovkaResult
