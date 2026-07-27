export type MeterZone = 'T1' | 'T2' | 'T3';

/** Зоны, которые обычно показывают в таблице по типу счётчика. */
export function activeMeterZones(tariffType: string): MeterZone[] {
  if (tariffType === 'triple') {
    return ['T1', 'T2', 'T3'];
  }
  if (tariffType === 'double' || tariffType === 'two_zone') {
    // Полный учёт / двухтарифный: все три регистра могут быть заполнены
    return ['T1', 'T2', 'T3'];
  }
  return ['T1'];
}

/**
 * Итоговый физический расход без задвоения:
 * - если T1 > 0 — T1 это контрольный суммарный регистр (или единственный),
 *   T2/T3 — только разбивка;
 * - если T1 = 0 — итог = T2 + T3.
 */
export function totalConsumptionFromZones(
  consumptionT1: number | null | undefined,
  consumptionT2: number | null | undefined,
  consumptionT3: number | null | undefined,
): number {
  const t1 = Number(consumptionT1 ?? 0);
  if (t1 > 0) {
    return t1;
  }
  return Number(consumptionT2 ?? 0) + Number(consumptionT3 ?? 0);
}

/**
 * Физические показания по зонам (как введено).
 * Для legacy double (день/ночь в T1/T2, без T3) — маппинг в T2/T3,
 * чтобы правило «T1>0 → брать T1» не отрезало ночной регистр.
 */
export function resolvePhysicalValues(
  tariffType: string,
  reading: {
    valueT1: number;
    valueT2?: number | null;
    valueT3?: number | null;
  },
): { T1: number; T2: number; T3: number } {
  if (tariffType === 'double' || tariffType === 'two_zone') {
    const hasT3 = reading.valueT3 != null;
    const legacyDayNight =
      !hasT3 &&
      Number(reading.valueT1) > 0 &&
      reading.valueT2 != null;

    if (legacyDayNight) {
      return {
        T1: 0,
        T2: Number(reading.valueT1),
        T3: Number(reading.valueT2 ?? 0),
      };
    }
  }

  return {
    T1: Number(reading.valueT1 ?? 0),
    T2: Number(reading.valueT2 ?? 0),
    T3: Number(reading.valueT3 ?? 0),
  };
}
