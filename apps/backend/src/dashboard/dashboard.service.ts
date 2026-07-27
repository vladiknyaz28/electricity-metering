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

    const periodStats = await this.sumMetersForPeriod(
      aggMeters,
      periodStart,
      periodEnd,
    );

    const trendRange = this.resolveTrendMonths(periodStart, periodEnd);
    const consumptionTrend = await this.buildTrend(
      aggMeters,
      trendRange,
    );

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
    const recentReadings = await this.buildRecentReadings(
      currentUser,
      query.objectId,
      query.resourceTypeId,
    );

    return {
      kpi: {
        objectsCount,
        consumersCount,
        metersCount,
        totalConsumption: periodStats.consumption,
        totalAmount: periodStats.amount,
      },
      consumptionTrend,
      byObject,
      byResourceType,
      anomalies,
      recentReadings,
    };
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
   * Счётчики для агрегатов расхода/суммы без задвоения иерархии:
   * на объекте с главным — только isMain; иначе — корневые (parentMeterId null).
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
        resourceType: { select: { name: true } },
        resourceTypeCode: true,
      },
    });

    const byObject = new Map<string, typeof meters>();
    for (const meter of meters) {
      const list = byObject.get(meter.objectId) ?? [];
      list.push(meter);
      byObject.set(meter.objectId, list);
    }

    const result: AggMeter[] = [];
    for (const [, list] of byObject) {
      const mains = list.filter((m) => m.isMain);
      const picked = mains.length > 0
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
          consumerId: m.consumerId,
          tariffId: m.tariffId,
          isMain: m.isMain,
        });
      }
    }
    return result;
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
      consumption: number;
      amount: number;
    }> = [];

    for (const month of months) {
      const stats = await this.sumMetersForPeriod(
        meters,
        month.start,
        month.end,
      );
      result.push({
        period: month.key,
        consumption: stats.consumption,
        amount: stats.amount,
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
      { objectName: string; consumption: number; amount: number }
    >();

    for (const meter of meters) {
      const stats = await this.meterPeriodMoney(meter, periodStart, periodEnd);
      const prev = map.get(meter.objectId) ?? {
        objectName: meter.objectName,
        consumption: 0,
        amount: 0,
      };
      prev.consumption = this.round4(prev.consumption + stats.consumption);
      prev.amount = this.round2(prev.amount + stats.amount);
      map.set(meter.objectId, prev);
    }

    return [...map.values()]
      .filter((row) => row.consumption !== 0 || row.amount !== 0)
      .sort((a, b) => b.consumption - a.consumption);
  }

  private async buildByResourceType(
    meters: AggMeter[],
    periodStart: Date,
    periodEnd: Date,
  ) {
    const map = new Map<string, number>();

    for (const meter of meters) {
      const detailed =
        await this.metersService.calculateMeterConsumptionDetailed(
          meter.id,
          periodStart,
          periodEnd,
        );
      const prev = map.get(meter.resourceTypeName) ?? 0;
      map.set(
        meter.resourceTypeName,
        this.round4(prev + detailed.consumption),
      );
    }

    return [...map.entries()]
      .filter(([, consumption]) => consumption !== 0)
      .map(([resourceType, consumption]) => ({ resourceType, consumption }))
      .sort((a, b) => b.consumption - a.consumption);
  }

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

    const children = await this.metersService.findMinusovkaChildren({
      id: meter.id,
      objectId: meter.objectId,
      isMain: meter.isMain,
    });

    let zoneVolumes = { ...detailed.byZone };
    const isParent = children.length > 0;

    if (isParent) {
      let childrenSum = 0;
      for (const child of children) {
        const childResult =
          await this.metersService.calculateMeterConsumption(
            child.id,
            periodStart,
            periodEnd,
          );
        childrenSum = this.round4(childrenSum + childResult.consumption);
      }
      const residual = this.round4(detailed.consumption - childrenSum);

      const multi =
        Math.abs(detailed.byZone.T2) > 0 || Math.abs(detailed.byZone.T3) > 0;
      if (!multi) {
        zoneVolumes = { T1: residual, T2: 0, T3: 0 };
      } else {
        const denom = detailed.byZone.T2 + detailed.byZone.T3;
        const shareT2 = denom > 0 ? detailed.byZone.T2 / denom : 0.5;
        const shareT3 = denom > 0 ? detailed.byZone.T3 / denom : 0.5;
        zoneVolumes = {
          T1: 0,
          T2: this.round4(residual * shareT2),
          T3: this.round4(residual * shareT3),
        };
      }
    }

    const amount = await this.amountFromZones(
      meter,
      periodEnd,
      zoneVolumes,
      isParent,
    );

    return {
      // KPI/графики — физический расход; деньги родителя — по остатку
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

    const candidates = await this.prisma.meter.findMany({
      where: this.meterScopeWhere(currentUser, objectId),
      select: {
        id: true,
        name: true,
        serialNumber: true,
        objectId: true,
        isMain: true,
        object: { select: { name: true } },
      },
    });

    const anomalies: Array<{
      meterId: string;
      meterName: string;
      objectName: string;
      period: string;
      minusovka: number;
      readingDate: string;
    }> = [];

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
        });
      }
    }

    return anomalies
      .sort((a, b) => Math.abs(b.minusovka) - Math.abs(a.minusovka))
      .slice(0, 10);
  }

  private async buildRecentReadings(
    currentUser: CurrentUser,
    objectId?: string,
    resourceTypeId?: string,
  ) {
    const readings = await this.prisma.meterReading.findMany({
      where: {
        meter: this.meterScopeWhere(currentUser, objectId, resourceTypeId),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        meterId: true,
        readingDate: true,
        createdAt: true,
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

    const result: Array<{
      meterId: string;
      meterName: string;
      objectName: string;
      date: string;
      consumption: number | null;
      createdAt: string;
    }> = [];

    for (const reading of readings) {
      const previous = await this.prisma.meterReading.findFirst({
        where: {
          meterId: reading.meterId,
          readingDate: { lt: reading.readingDate },
        },
        orderBy: { readingDate: 'desc' },
        select: { readingDate: true },
      });

      let consumption: number | null = null;
      if (previous) {
        const calc = await this.metersService.calculateMeterConsumption(
          reading.meterId,
          previous.readingDate,
          reading.readingDate,
          { exclusiveStart: true },
        );
        consumption = calc.hasData ? calc.consumption : 0;
      }

      result.push({
        meterId: reading.meterId,
        meterName: reading.meter.serialNumber || reading.meter.name,
        objectName: reading.meter.object.name,
        date: reading.readingDate.toISOString().slice(0, 10),
        consumption,
        createdAt: reading.createdAt.toISOString(),
      });
    }

    return result;
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
