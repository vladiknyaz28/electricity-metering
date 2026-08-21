import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
import { TariffsService } from '../tariffs/tariffs.service';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

type SummaryQuery = {
  periodStart?: string;
  periodEnd?: string;
  objectId?: string;
  resourceTypeId?: string;
};

type AggMeter = {
  id: string;
  name: string;
  serialNumber: string;
  objectId: string;
  objectName: string;
  resourceTypeId: string | null;
  resourceTypeName: string;
  resourceTypeUnit: string;
  consumerId: string | null;
  tariffId: string | null;
  isMain: boolean;
};

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
    private readonly tariffsService: TariffsService,
  ) {}

  async getSummary(query: SummaryQuery, currentUser: CurrentUser) {
    const { periodStart, periodEnd } = this.resolvePeriod(
      query.periodStart,
      query.periodEnd,
    );

    const objectScope = this.objectScopeWhere(currentUser, query.objectId);
    const meterScope = this.meterScopeWhere(
      currentUser,
      query.objectId,
      query.resourceTypeId,
    );
    const consumerScope = this.consumerScopeWhere(
      currentUser,
      query.objectId,
    );

    const [objectsCount, consumersCount, metersCount] = await Promise.all([
      this.prisma.object.count({ where: objectScope }),
      this.prisma.consumer.count({ where: consumerScope }),
      this.prisma.meter.count({ where: meterScope }),
    ]);

    const aggMeters = await this.resolveAggregationMeters(
      currentUser,
      query.objectId,
      query.resourceTypeId,
    );

    const totalConsumptionByResource = await this.buildTotalByResource(
      aggMeters,
      periodStart,
      periodEnd,
    );

    const trendRange = this.resolveTrendMonths(periodStart, periodEnd);
    const consumptionTrend = await this.buildTrend(aggMeters, trendRange);

    const byObject = await this.buildByObject(
      aggMeters,
      periodStart,
      periodEnd,
    );

    const byResourceType = await this.buildByResourceType(
      aggMeters,
      periodStart,
      periodEnd,
    );

    const anomalies = await this.buildAnomalies(currentUser, query.objectId);

    return {
      kpi: {
        objectsCount,
        consumersCount,
        metersCount,
        totalConsumptionByResource,
      },
      consumptionTrend,
      byObject,
      byResourceType,
      anomalies,
    };
  }

  async getByConsumer(query: SummaryQuery & { consumerIds?: string | string[] }, currentUser: CurrentUser) {
    const { periodStart, periodEnd } = this.resolvePeriod(
      query.periodStart,
      query.periodEnd,
    );

    const consumerIdFilter = this.parseIdList(query.consumerIds);

    const meters = await this.prisma.meter.findMany({
      where: {
        ...this.meterScopeWhere(
          currentUser,
          query.objectId,
          query.resourceTypeId,
        ),
        consumerId: consumerIdFilter
          ? { in: consumerIdFilter }
          : { not: null },
      },
      select: {
        id: true,
        name: true,
        serialNumber: true,
        objectId: true,
        consumerId: true,
        tariffId: true,
        isMain: true,
        object: { select: { name: true } },
        consumer: { select: { id: true, name: true } },
        resourceTypeId: true,
        resourceTypeCode: true,
        resourceType: { select: { name: true, unit: true } },
      },
    });

    const map = new Map<
      string,
      {
        consumerId: string;
        consumerName: string;
        objectName: string;
        byResource: Map<
          string,
          {
            resourceTypeId: string | null;
            resourceName: string;
            consumption: number;
            amount: number;
          }
        >;
        totalConsumption: number;
      }
    >();

    for (const meter of meters) {
      if (!meter.consumerId || !meter.consumer) continue;

      const agg: AggMeter = {
        id: meter.id,
        name: meter.name,
        serialNumber: meter.serialNumber,
        objectId: meter.objectId,
        objectName: meter.object.name,
        resourceTypeId: meter.resourceTypeId,
        resourceTypeName:
          meter.resourceType?.name || meter.resourceTypeCode || 'Ресурс',
        resourceTypeUnit: meter.resourceType?.unit || '',
        consumerId: meter.consumerId,
        tariffId: meter.tariffId,
        isMain: meter.isMain,
      };

      const stats = await this.meterPeriodMoney(agg, periodStart, periodEnd);
      if (stats.consumption === 0 && stats.amount === 0) continue;

      const row = map.get(meter.consumerId) ?? {
        consumerId: meter.consumerId,
        consumerName: meter.consumer.name,
        objectName: meter.object.name,
        byResource: new Map(),
        totalConsumption: 0,
      };

      const rKey = meter.resourceTypeId ?? agg.resourceTypeName;
      const prev = row.byResource.get(rKey) ?? {
        resourceTypeId: meter.resourceTypeId,
        resourceName: agg.resourceTypeName,
        consumption: 0,
        amount: 0,
      };
      prev.consumption = this.round4(prev.consumption + stats.consumption);
      prev.amount = this.round2(prev.amount + stats.amount);
      row.byResource.set(rKey, prev);
      row.totalConsumption = this.round4(
        row.totalConsumption + stats.consumption,
      );
      map.set(meter.consumerId, row);
    }

    let rows = [...map.values()]
      .map((row) => ({
        consumerId: row.consumerId,
        consumerName: row.consumerName,
        objectName: row.objectName,
        byResource: [...row.byResource.values()].sort((a, b) =>
          a.resourceName.localeCompare(b.resourceName, 'ru'),
        ),
        totalConsumption: row.totalConsumption,
      }))
      .sort((a, b) => b.totalConsumption - a.totalConsumption);

    if (!consumerIdFilter) {
      rows = rows.slice(0, 30);
    }

    return rows.map(({ totalConsumption: _t, ...rest }) => rest);
  }

  private parseIdList(value?: string | string[]): string[] | undefined {
    if (value == null) return undefined;
    const raw = Array.isArray(value) ? value : value.split(',');
    const ids = raw.map((item) => item.trim()).filter(Boolean);
    return ids.length ? [...new Set(ids)] : undefined;
  }

  private resolvePeriod(startRaw?: string, endRaw?: string) {
    const end = endRaw
      ? this.startOfUtcDay(new Date(endRaw))
      : this.startOfUtcDay(new Date());
    const start = startRaw
      ? this.startOfUtcDay(new Date(startRaw))
      : new Date(
          Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 11, 1),
        );

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Некорректный период');
    }
    if (start > end) {
      throw new BadRequestException(
        'periodStart не может быть позже periodEnd',
      );
    }
    return { periodStart: start, periodEnd: end };
  }

  private resolveTrendMonths(periodStart: Date, periodEnd: Date) {
    const months: Array<{ key: string; start: Date; end: Date }> = [];
    let cursor = new Date(
      Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), 1),
    );
    const last = new Date(
      Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth(), 1),
    );

    while (cursor <= last && months.length < 12) {
      const start = new Date(cursor);
      const end = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0),
      );
      const key = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`;
      months.push({
        key,
        start: start < periodStart ? periodStart : start,
        end: end > periodEnd ? periodEnd : end,
      });
      cursor = new Date(
        Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1),
      );
    }

    // Если диапазон шире 12 месяцев — берём последние 12
    if (months.length > 12) {
      return months.slice(-12);
    }
    return months;
  }

  /**
   * Счётчики для агрегатов расхода/суммы без задвоения иерархии.
   * По каждому (объект × тип ресурса):
   * — если есть isMain этого типа — только он;
   * — иначе все корневые (parentMeterId IS NULL) этого типа.
   * Так газовый корневой счётчик без потребителя не выпадает,
   * а на МКД электро не суммируется main+промежуточные.
   */
  private async resolveAggregationMeters(
    currentUser: CurrentUser,
    objectId?: string,
    resourceTypeId?: string,
  ): Promise<AggMeter[]> {
    const meters = await this.prisma.meter.findMany({
      where: this.meterScopeWhere(currentUser, objectId, resourceTypeId),
      select: {
        id: true,
        name: true,
        serialNumber: true,
        objectId: true,
        consumerId: true,
        tariffId: true,
        isMain: true,
        parentMeterId: true,
        object: { select: { name: true } },
        resourceTypeId: true,
        resourceType: { select: { name: true, unit: true } },
        resourceTypeCode: true,
      },
    });

    const byObjectAndResource = new Map<string, typeof meters>();
    for (const meter of meters) {
      const key = `${meter.objectId}::${meter.resourceTypeId ?? 'none'}`;
      const list = byObjectAndResource.get(key) ?? [];
      list.push(meter);
      byObjectAndResource.set(key, list);
    }

    const result: AggMeter[] = [];
    for (const [, list] of byObjectAndResource) {
      const mains = list.filter((m) => m.isMain);
      const picked =
        mains.length > 0
          ? mains
          : list.filter((m) => m.parentMeterId == null);

      for (const m of picked) {
        result.push({
          id: m.id,
          name: m.name,
          serialNumber: m.serialNumber,
          objectId: m.objectId,
          objectName: m.object.name,
          resourceTypeId: m.resourceTypeId,
          resourceTypeName:
            m.resourceType?.name || m.resourceTypeCode || 'Ресурс',
          resourceTypeUnit: m.resourceType?.unit || '',
          consumerId: m.consumerId,
          tariffId: m.tariffId,
          isMain: m.isMain,
        });
      }
    }
    return result;
  }

  private async buildTotalByResource(
    meters: AggMeter[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const map = new Map<
      string,
      {
        resourceTypeId: string | null;
        resourceName: string;
        unit: string;
        consumption: number;
      }
    >();

    for (const meter of meters) {
      const stats = await this.meterPeriodMoney(meter, periodStart, periodEnd);
      if (stats.consumption === 0) continue;
      const key = meter.resourceTypeId ?? meter.resourceTypeName;
      const prev = map.get(key) ?? {
        resourceTypeId: meter.resourceTypeId,
        resourceName: meter.resourceTypeName,
        unit: meter.resourceTypeUnit,
        consumption: 0,
      };
      prev.consumption = this.round4(prev.consumption + stats.consumption);
      if (!prev.unit && meter.resourceTypeUnit) {
        prev.unit = meter.resourceTypeUnit;
      }
      map.set(key, prev);
    }

    return [...map.values()].sort((a, b) =>
      a.resourceName.localeCompare(b.resourceName, 'ru'),
    );
  }

  private async buildByResourceType(
    meters: AggMeter[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const map = new Map<
      string,
      {
        resourceTypeId: string | null;
        resourceType: string;
        unit: string;
        consumption: number;
        amount: number;
      }
    >();

    for (const meter of meters) {
      const stats = await this.meterPeriodMoney(meter, periodStart, periodEnd);
      if (stats.consumption === 0 && stats.amount === 0) continue;
      const key = meter.resourceTypeId ?? meter.resourceTypeName;
      const prev = map.get(key) ?? {
        resourceTypeId: meter.resourceTypeId,
        resourceType: meter.resourceTypeName,
        unit: meter.resourceTypeUnit,
        consumption: 0,
        amount: 0,
      };
      prev.consumption = this.round4(prev.consumption + stats.consumption);
      prev.amount = this.round2(prev.amount + stats.amount);
      if (!prev.unit && meter.resourceTypeUnit) {
        prev.unit = meter.resourceTypeUnit;
      }
      map.set(key, prev);
    }

    return [...map.values()]
      .sort((a, b) => b.consumption - a.consumption);
  }

  private async sumMetersForPeriod(
    meters: AggMeter[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    let consumption = 0;
    let amount = 0;
    for (const meter of meters) {
      const stats = await this.meterPeriodMoney(meter, periodStart, periodEnd);
      consumption = this.round4(consumption + stats.consumption);
      amount = this.round2(amount + stats.amount);
    }
    return { consumption, amount };
  }

  private async buildTrend(
    meters: AggMeter[],
    months: Array<{ key: string; start: Date; end: Date }>,
  ) {
    const result: Array<{
      period: string;
      byResource: Array<{
        resourceTypeId: string | null;
        resourceName: string;
        consumption: number;
        amount: number;
      }>;
    }> = [];

    for (const month of months) {
      const map = new Map<
        string,
        {
          resourceTypeId: string | null;
          resourceName: string;
          consumption: number;
          amount: number;
        }
      >();

      for (const meter of meters) {
        const stats = await this.meterPeriodMoney(
          meter,
          month.start,
          month.end,
        );
        if (stats.consumption === 0 && stats.amount === 0) continue;

        const key = meter.resourceTypeId ?? meter.resourceTypeName;
        const prev = map.get(key) ?? {
          resourceTypeId: meter.resourceTypeId,
          resourceName: meter.resourceTypeName,
          consumption: 0,
          amount: 0,
        };
        prev.consumption = this.round4(prev.consumption + stats.consumption);
        prev.amount = this.round2(prev.amount + stats.amount);
        map.set(key, prev);
      }

      result.push({
        period: month.key,
        byResource: [...map.values()].sort((a, b) =>
          a.resourceName.localeCompare(b.resourceName, 'ru'),
        ),
      });
    }
    return result;
  }

  private async buildByObject(
    meters: AggMeter[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const map = new Map<
      string,
      {
        objectId: string;
        objectName: string;
        byResource: Map<
          string,
          {
            resourceTypeId: string | null;
            resourceName: string;
            consumption: number;
            amount: number;
          }
        >;
      }
    >();

    for (const meter of meters) {
      const stats = await this.meterPeriodMoney(meter, periodStart, periodEnd);
      if (stats.consumption === 0 && stats.amount === 0) continue;

      const obj = map.get(meter.objectId) ?? {
        objectId: meter.objectId,
        objectName: meter.objectName,
        byResource: new Map(),
      };
      const rKey = meter.resourceTypeId ?? meter.resourceTypeName;
      const prev = obj.byResource.get(rKey) ?? {
        resourceTypeId: meter.resourceTypeId,
        resourceName: meter.resourceTypeName,
        consumption: 0,
        amount: 0,
      };
      prev.consumption = this.round4(prev.consumption + stats.consumption);
      prev.amount = this.round2(prev.amount + stats.amount);
      obj.byResource.set(rKey, prev);
      map.set(meter.objectId, obj);
    }

    return [...map.values()]
      .map((row) => {
        const byResource = [...row.byResource.values()].sort((a, b) =>
          a.resourceName.localeCompare(b.resourceName, 'ru'),
        );
        const totalConsumption = byResource.reduce(
          (s, r) => this.round4(s + r.consumption),
          0,
        );
        return {
          objectId: row.objectId,
          objectName: row.objectName,
          byResource,
          totalConsumption,
        };
      })
      .sort((a, b) => b.totalConsumption - a.totalConsumption)
      .map(({ totalConsumption: _t, ...rest }) => rest);
  }

  /**
   * Gross consumption + amount for a dashboard aggregation meter.
   * Children are NOT subtracted here: resolveAggregationMeters already picks
   * isMain (or roots) to avoid hierarchy double-counting. Subtracting children
   * again turned object totals into минусовка/ОДН residual (can be negative),
   * which emptied pie charts (ECharts ignores negative pie values).
   */
  private async meterPeriodMoney(
    meter: AggMeter,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ consumption: number; amount: number }> {
    const detailed =
      await this.metersService.calculateMeterConsumptionDetailed(
        meter.id,
        periodStart,
        periodEnd,
      );

    if (!detailed.hasData) {
      return { consumption: 0, amount: 0 };
    }

    const amount = await this.amountFromZones(
      meter,
      periodEnd,
      detailed.byZone,
      false,
    );

    return {
      consumption: detailed.consumption,
      amount,
    };
  }

  private async amountFromZones(
    meter: AggMeter,
    onDate: Date,
    volumes: { T1: number; T2: number; T3: number },
    parentMode: boolean,
  ): Promise<number> {
    const familyId = await this.metersService.resolveMeterTariffFamilyId({
      consumerId: meter.consumerId,
      tariffId: meter.tariffId,
    });
    if (!familyId) return 0;

    const tariff = await this.tariffsService.resolveActiveTariffVersion(
      familyId,
      onDate,
    );
    if (!tariff) return 0;

    const rate = (code: string): number | null => {
      const zone = tariff.zones.find((z) => z.zoneCode === code);
      if (!zone) return null;
      const n = Number(zone.rate);
      return Number.isFinite(n) ? n : null;
    };

    const r1 = rate('T1');
    const r2 = rate('T2');
    const r3 = rate('T3');

    let sum = 0;
    if (parentMode) {
      // T1 только в однотарифном режиме (T2=T3=0 уже в volumes)
      if (volumes.T1 !== 0 && r1 != null) sum += volumes.T1 * r1;
      if (r2 != null) sum += volumes.T2 * r2;
      if (r3 != null) sum += volumes.T3 * r3;
    } else {
      if (r1 != null) sum += volumes.T1 * r1;
      if (r2 != null) sum += volumes.T2 * r2;
      if (r3 != null) sum += volumes.T3 * r3;
    }
    return this.round2(sum);
  }

  private async buildAnomalies(currentUser: CurrentUser, objectId?: string) {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 90);
    const sinceDay = this.startOfUtcDay(since);

    type DashboardAnomalyEvent = {
      meterId: string;
      meterName: string;
      objectName: string;
      period: string;
      minusovka: number;
      readingDate: string;
      anomalyType?: string;
      anomalyNote?: string | null;
    };

    const candidates = await this.prisma.meter.findMany({
      where: this.meterScopeWhere(currentUser, objectId),
      select: {
        id: true,
        name: true,
        serialNumber: true,
        objectId: true,
        isMain: true,
        resourceTypeId: true,
        object: { select: { name: true } },
      },
    });

    const anomalies: DashboardAnomalyEvent[] = [];

    // 1) Иерархическая минусовка (прежний алгоритм, последние 90 дней)
    for (const meter of candidates) {
      const children = await this.metersService.findMinusovkaChildren(meter);
      if (children.length === 0) continue;

      const allReadings = await this.prisma.meterReading.findMany({
        where: { meterId: meter.id },
        orderBy: { readingDate: 'asc' },
        select: { id: true, readingDate: true },
      });

      for (let i = 1; i < allReadings.length; i++) {
        const prev = allReadings[i - 1];
        const cur = allReadings[i];
        if (cur.readingDate < sinceDay) continue;

        const parentResult =
          await this.metersService.calculateMeterConsumption(
            meter.id,
            prev.readingDate,
            cur.readingDate,
            { exclusiveStart: true },
          );
        if (!parentResult.hasData) continue;

        let childrenSum = 0;
        for (const child of children) {
          const childResult =
            await this.metersService.calculateMeterConsumption(
              child.id,
              prev.readingDate,
              cur.readingDate,
              { exclusiveStart: true },
            );
          childrenSum = this.round4(childrenSum + childResult.consumption);
        }

        const minusovka = this.round4(
          parentResult.consumption - childrenSum,
        );
        if (minusovka >= 0) continue;

        const dateIso = cur.readingDate.toISOString().slice(0, 10);
        anomalies.push({
          meterId: meter.id,
          meterName: meter.serialNumber || meter.name,
          objectName: meter.object.name,
          period: dateIso.slice(0, 7),
          minusovka,
          readingDate: dateIso,
          anomalyType: 'minusovka',
          anomalyNote:
            'Суммарный расход дочерних счётчиков превышает расход родительского прибора.',
        });
      }
    }

    // 2) Аномалии показаний (MeterReading.anomalyType ≠ none)
    const flaggedReadings = await this.prisma.meterReading.findMany({
      where: {
        readingDate: { gte: sinceDay },
        AND: [
          { anomalyType: { not: 'none' } },
          { anomalyType: { not: '' } },
        ],
        meter: this.meterScopeWhere(currentUser, objectId),
      },
      select: {
        periodCode: true,
        readingDate: true,
        anomalyType: true,
        anomalyNote: true,
        meter: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            object: { select: { name: true } },
          },
        },
      },
    });

    for (const reading of flaggedReadings) {
      const dateIso = reading.readingDate.toISOString().slice(0, 10);
      anomalies.push({
        meterId: reading.meter.id,
        meterName: reading.meter.serialNumber || reading.meter.name,
        objectName: reading.meter.object.name,
        period: reading.periodCode,
        minusovka: 0,
        readingDate: dateIso,
        anomalyType: reading.anomalyType,
        anomalyNote: reading.anomalyNote,
      });
    }

    const rank = (type?: string) => {
      if (type === 'high_consumption') return 0;
      if (type === 'negative_consumption') return 1;
      if (type === 'minusovka') return 2;
      return 3;
    };

    const deduped: DashboardAnomalyEvent[] = [];
    const seen = new Set<string>();
    for (const item of anomalies) {
      const key = `${item.meterId}|${item.readingDate}|${item.anomalyType ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(item);
    }

    return deduped
      .sort((a, b) => {
        const byType = rank(a.anomalyType) - rank(b.anomalyType);
        if (byType !== 0) return byType;
        const byDate = b.readingDate.localeCompare(a.readingDate);
        if (byDate !== 0) return byDate;
        return Math.abs(b.minusovka) - Math.abs(a.minusovka);
      })
      .slice(0, 10);
  }

  private objectScopeWhere(
    currentUser: CurrentUser,
    objectId?: string,
  ): Prisma.ObjectWhereInput {
    const base: Prisma.ObjectWhereInput = {};
    if (currentUser.role === 'admin' || currentUser.role === 'auditor') {
      // all
    } else if (currentUser.role === 'object_manager') {
      base.managerId = currentUser.id;
    } else if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      base.consumers = { some: { id: currentUser.consumerId } };
    } else {
      return { id: '__none__' };
    }

    if (objectId) {
      base.id = objectId;
    }
    return base;
  }

  private consumerScopeWhere(
    currentUser: CurrentUser,
    objectId?: string,
  ): Prisma.ConsumerWhereInput {
    const base: Prisma.ConsumerWhereInput = {};
    if (currentUser.role === 'admin' || currentUser.role === 'auditor') {
      // all
    } else if (currentUser.role === 'object_manager') {
      base.object = { managerId: currentUser.id };
    } else if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      base.id = currentUser.consumerId;
    } else {
      return { id: '__none__' };
    }

    if (objectId) {
      base.objectId = objectId;
    }
    return base;
  }

  private meterScopeWhere(
    currentUser: CurrentUser,
    objectId?: string,
    resourceTypeId?: string,
  ): Prisma.MeterWhereInput {
    const base: Prisma.MeterWhereInput = {};
    if (currentUser.role === 'admin' || currentUser.role === 'auditor') {
      // all
    } else if (currentUser.role === 'object_manager') {
      base.object = { managerId: currentUser.id };
    } else if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      base.consumerId = currentUser.consumerId;
    } else {
      return { id: '__none__' };
    }

    if (objectId) {
      base.objectId = objectId;
    }
    if (resourceTypeId) {
      base.resourceTypeId = resourceTypeId;
    }
    return base;
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }
}
