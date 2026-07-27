import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
import { TariffsService } from '../tariffs/tariffs.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { UpdateReadingDto } from './dto/update-reading.dto';
import {
  resolvePhysicalValues,
  totalConsumptionFromZones,
} from '../common/meter-zones';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

type ZoneValues = {
  valueT1?: number | null;
  valueT2?: number | null;
  valueT3?: number | null;
};

@Injectable()
export class ReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
    private readonly tariffsService: TariffsService,
  ) {}

  async create(dto: CreateReadingDto, currentUser: CurrentUser) {
    this.assertCanMutate(currentUser);

    const meter = await this.metersService.findOneScoped(
      dto.meterId,
      currentUser,
    );
    this.assertRequiredZones(meter.tariffType, dto);

    const readingDate = new Date(dto.readingDate);
    const stored = this.normalizeStoredValues(meter.tariffType, dto);
    await this.assertMonotonic(dto.meterId, readingDate, stored, meter.tariffType);

    const previous = await this.findNeighbor(
      dto.meterId,
      readingDate,
      'previous',
    );
    const periodCode = readingDate.toISOString();

    return this.prisma.meterReading.create({
      data: {
        meterId: dto.meterId,
        periodCode,
        periodStartDate: readingDate,
        periodEndDate: readingDate,
        valueT1: stored.valueT1,
        valueT2: stored.valueT2,
        valueT3: stored.valueT3,
        readingDate,
        currentValue: stored.valueT1,
        previousValue: previous?.valueT1 ?? null,
        transformationCoefficient: 1,
        source: 'manual',
        status: 'submitted',
        anomalyType: 'none',
        isClosedPeriod: false,
        comment: dto.comment,
        submittedById: currentUser.id,
      },
    });
  }

  async findAllByMeter(meterId: string, currentUser: CurrentUser) {
    if (!meterId) {
      throw new BadRequestException('Параметр meterId обязателен');
    }

    const meter = await this.metersService.findOneScoped(meterId, currentUser);
    const ratio = this.resolveTransformerRatio(meter.transformerRatio);

    const children = await this.metersService.findMinusovkaChildren(meter);
    const parentMeter = children.length > 0;

    const childLabel = (child: (typeof children)[number]) => {
      const parts = [child.serialNumber];
      if (child.consumer?.name) {
        parts.push(child.consumer.name);
      } else if (child.name) {
        parts.push(child.name);
      }
      return parts.filter(Boolean).join(' · ');
    };

    const readings = await this.prisma.meterReading.findMany({
      where: { meterId },
      orderBy: { readingDate: 'asc' },
    });

    const tariffFamilyId =
      await this.metersService.resolveMeterTariffFamilyId(meter);

    const enriched: Array<Record<string, unknown>> = [];

    for (let index = 0; index < readings.length; index++) {
      const reading = readings[index];
      const previous = index > 0 ? readings[index - 1] : null;
      const hasPrevious = previous != null;

      const currentPhys = resolvePhysicalValues(meter.tariffType, reading);
      const previousPhys = previous
        ? resolvePhysicalValues(meter.tariffType, previous)
        : { T1: 0, T2: 0, T3: 0 };

      const zoneDiff = (zone: 'T1' | 'T2' | 'T3'): number => {
        if (!hasPrevious) return 0;
        return (currentPhys[zone] ?? 0) - (previousPhys[zone] ?? 0);
      };

      const diffT1 = zoneDiff('T1');
      const diffT2 = zoneDiff('T2');
      const diffT3 = zoneDiff('T3');

      const consumptionT1 = this.round4(diffT1 * ratio);
      const consumptionT2 = this.round4(diffT2 * ratio);
      const consumptionT3 = this.round4(diffT3 * ratio);

      const totalConsumption = this.round4(
        totalConsumptionFromZones(
          consumptionT1,
          consumptionT2,
          consumptionT3,
        ),
      );

      let residualMinusovka: number | null = null;
      let residualIncomplete = false;
      let childrenBreakdown: Array<{
        meterId: string;
        label: string;
        consumption: number;
        hasData: boolean;
      }> | null = null;

      if (parentMeter) {
        childrenBreakdown = [];
        let childrenConsumption = 0;

        for (const child of children) {
          const label = childLabel(child);

          if (!hasPrevious) {
            childrenBreakdown.push({
              meterId: child.id,
              label,
              consumption: 0,
              hasData: false,
            });
            continue;
          }

          const childResult =
            await this.metersService.calculateMeterConsumption(
              child.id,
              previous.readingDate,
              reading.readingDate,
              { exclusiveStart: true },
            );

          childrenBreakdown.push({
            meterId: child.id,
            label,
            consumption: childResult.consumption,
            hasData: childResult.hasData,
          });

          childrenConsumption += childResult.consumption;
          if (!childResult.hasData) {
            residualIncomplete = true;
          }
        }

        if (hasPrevious) {
          residualMinusovka = this.round4(
            totalConsumption - childrenConsumption,
          );
        }
      }

      const tariff = tariffFamilyId
        ? await this.tariffsService.resolveActiveTariffVersion(
            tariffFamilyId,
            reading.readingDate,
          )
        : null;

      const tariffRateT1 = tariff
        ? this.findZoneRate(tariff.zones, 'T1')
        : null;
      const tariffRateT2 = tariff
        ? this.findZoneRate(tariff.zones, 'T2')
        : null;
      const tariffRateT3 = tariff
        ? this.findZoneRate(tariff.zones, 'T3')
        : null;

      // Режим учёта по физике строки: многотарифный, если есть расход T2 или T3
      const multiTariffPhysical =
        Math.abs(diffT2) > 0 || Math.abs(diffT3) > 0;

      let residualT1: number | null = null;
      let residualT2: number | null = null;
      let residualT3: number | null = null;
      let amountT1: number | null = null;
      let amountT2: number | null = null;
      let amountT3: number | null = null;

      if (parentMeter && residualMinusovka != null && hasPrevious) {
        if (!multiTariffPhysical) {
          // Чистый однотарифный: весь остаток → T1
          residualT1 = residualMinusovka;
          residualT2 = null;
          residualT3 = null;
          amountT1 =
            tariffRateT1 == null
              ? null
              : this.round2(residualMinusovka * tariffRateT1);
          amountT2 = null;
          amountT3 = null;
        } else {
          // Многотарифный/полный учёт: T1 исключён; доля по физике T2/T3
          residualT1 = null;
          const denom = consumptionT2 + consumptionT3;
          const shareT2 = denom > 0 ? consumptionT2 / denom : 0.5;
          const shareT3 = denom > 0 ? consumptionT3 / denom : 0.5;
          residualT2 = this.round4(residualMinusovka * shareT2);
          residualT3 = this.round4(residualMinusovka * shareT3);
          amountT1 = null;
          amountT2 =
            tariffRateT2 == null
              ? null
              : this.round2(residualT2 * tariffRateT2);
          amountT3 =
            tariffRateT3 == null
              ? null
              : this.round2(residualT3 * tariffRateT3);
        }
      } else if (hasPrevious) {
        // Обычный счётчик: деньги = расход_зоны × ставка (независимо)
        amountT1 =
          tariffRateT1 == null
            ? null
            : this.round2(consumptionT1 * tariffRateT1);
        amountT2 =
          tariffRateT2 == null
            ? null
            : this.round2(consumptionT2 * tariffRateT2);
        amountT3 =
          tariffRateT3 == null
            ? null
            : this.round2(consumptionT3 * tariffRateT3);
      }

      const moneyParts = [amountT1, amountT2, amountT3].filter(
        (value): value is number => value != null,
      );
      const totalAmount =
        hasPrevious && moneyParts.length > 0
          ? this.round2(moneyParts.reduce((sum, value) => sum + value, 0))
          : null;

      enriched.push({
        ...reading,
        transformerRatio: ratio,
        previousValueT1: hasPrevious ? previousPhys.T1 : 0,
        previousValueT2: hasPrevious ? previousPhys.T2 : 0,
        previousValueT3: hasPrevious ? previousPhys.T3 : 0,
        valueT1Display: currentPhys.T1,
        valueT2Display: currentPhys.T2,
        valueT3Display: currentPhys.T3,
        diffT1,
        diffT2,
        diffT3,
        consumptionT1,
        consumptionT2,
        consumptionT3,
        totalConsumption: hasPrevious ? totalConsumption : null,
        residualMinusovka,
        residualT1,
        residualT2,
        residualT3,
        residualIncomplete,
        hasChildren: parentMeter,
        childrenBreakdown,
        tariffRateT1,
        tariffRateT2,
        tariffRateT3,
        amountT1,
        amountT2,
        amountT3,
        totalAmount,
      });
    }

    return enriched.reverse();
  }

  private resolveTransformerRatio(
    value: Prisma.Decimal | number | null | undefined,
  ): number {
    if (value == null) {
      return 1;
    }
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  private findZoneRate(
    zones: { zoneCode: string; rate: number | string | { toString(): string } }[],
    zoneCode: string,
  ): number | null {
    const zone = zones.find((item) => item.zoneCode === zoneCode);
    if (!zone) return null;
    const rate = Number(zone.rate);
    return Number.isFinite(rate) ? rate : null;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  async update(id: string, dto: UpdateReadingDto, currentUser: CurrentUser) {
    this.assertCanMutate(currentUser);

    const existing = await this.getReadingOrThrow(id);
    const meter = await this.metersService.findOneScoped(
      existing.meterId,
      currentUser,
    );

    const readingDate = dto.readingDate
      ? new Date(dto.readingDate)
      : existing.readingDate;

    const values = this.normalizeStoredValues(meter.tariffType, {
      valueT1: dto.valueT1 ?? existing.valueT1,
      valueT2:
        dto.valueT2 !== undefined ? dto.valueT2 : existing.valueT2,
      valueT3:
        dto.valueT3 !== undefined ? dto.valueT3 : existing.valueT3,
    });

    this.assertRequiredZones(meter.tariffType, values);
    await this.assertMonotonic(
      existing.meterId,
      readingDate,
      values,
      meter.tariffType,
      existing.id,
    );

    const previous = await this.findNeighbor(
      existing.meterId,
      readingDate,
      'previous',
      existing.id,
    );

    return this.prisma.meterReading.update({
      where: { id },
      data: {
        readingDate,
        periodCode: readingDate.toISOString(),
        periodStartDate: readingDate,
        periodEndDate: readingDate,
        valueT1: values.valueT1,
        valueT2: values.valueT2,
        valueT3: values.valueT3,
        currentValue: values.valueT1,
        previousValue: previous?.valueT1 ?? null,
        comment: dto.comment !== undefined ? dto.comment : undefined,
      },
    });
  }

  async remove(id: string, currentUser: CurrentUser, force = false) {
    try {
      this.assertCanMutate(currentUser);

      const existing = await this.getReadingOrThrow(id);
      await this.metersService.findOneScoped(existing.meterId, currentUser);

      const linkedCharges = await this.prisma.charge.findMany({
        where: {
          OR: [{ startReadingId: id }, { endReadingId: id }],
        },
        select: {
          id: true,
          periodStart: true,
          periodEnd: true,
        },
        orderBy: { periodStart: 'asc' },
      });

      if (linkedCharges.length > 0 && !force) {
        const first = linkedCharges[0];
        const periodStart = this.formatDateOnly(first.periodStart);
        const periodEnd = this.formatDateOnly(first.periodEnd);

        throw new ConflictException({
          message:
            linkedCharges.length === 1
              ? `Показание используется в начислении за период ${periodStart} — ${periodEnd}. Удалить вместе с начислением?`
              : `Показание используется в ${linkedCharges.length} начислениях (в т.ч. за период ${periodStart} — ${periodEnd}). Удалить вместе с начислениями?`,
          charges: linkedCharges.map((charge) => ({
            id: charge.id,
            periodStart: this.formatDateOnly(charge.periodStart),
            periodEnd: this.formatDateOnly(charge.periodEnd),
          })),
        });
      }

      return await this.prisma.$transaction(async (tx) => {
        if (linkedCharges.length > 0) {
          await tx.charge.deleteMany({
            where: {
              id: { in: linkedCharges.map((charge) => charge.id) },
            },
          });
        }

        return tx.meterReading.delete({
          where: { id },
        });
      });
    } catch (error) {
      if (
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Не удалось удалить показание: оно связано с другими записями',
        );
      }

      throw new InternalServerErrorException(
        'Не удалось удалить показание. Попробуйте позже или обратитесь к администратору',
      );
    }
  }

  private formatDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private assertCanMutate(currentUser: CurrentUser) {
    if (
      currentUser.role !== 'admin' &&
      currentUser.role !== 'object_manager'
    ) {
      throw new ForbiddenException(
        'Потребитель может только просматривать показания',
      );
    }
  }

  private assertRequiredZones(_tariffType: string, values: ZoneValues) {
    // Все три поля доступны всегда; T1 обязателен (может быть 0), T2/T3 — по желанию
    if (values.valueT1 == null || Number.isNaN(Number(values.valueT1))) {
      throw new BadRequestException('Укажите значение T1 (можно 0)');
    }
  }

  /** Нормализация значений для записи в БД — сохраняем как введено. */
  private normalizeStoredValues(
    _tariffType: string,
    values: ZoneValues,
  ): {
    valueT1: number;
    valueT2: number | null;
    valueT3: number | null;
  } {
    return {
      valueT1: Number(values.valueT1 ?? 0),
      valueT2:
        values.valueT2 == null || values.valueT2 === undefined
          ? null
          : Number(values.valueT2),
      valueT3:
        values.valueT3 == null || values.valueT3 === undefined
          ? null
          : Number(values.valueT3),
    };
  }

  private async assertMonotonic(
    meterId: string,
    readingDate: Date,
    values: ZoneValues,
    tariffType: string,
    excludeId?: string,
  ) {
    const previous = await this.findNeighbor(
      meterId,
      readingDate,
      'previous',
      excludeId,
    );
    if (previous) {
      this.assertNotLessThan(values, previous, 'предыдущего', tariffType);
    }

    const next = await this.findNeighbor(
      meterId,
      readingDate,
      'next',
      excludeId,
    );
    if (next) {
      this.assertNotGreaterThan(values, next, 'следующего', tariffType);
    }
  }

  private assertNotLessThan(
    current: ZoneValues,
    reference: {
      valueT1: number;
      valueT2: number | null;
      valueT3: number | null;
    },
    label: string,
    tariffType: string,
  ) {
    const cur = resolvePhysicalValues(tariffType, current as never);
    const ref = resolvePhysicalValues(tariffType, reference);
    const zones: Array<'T1' | 'T2' | 'T3'> = ['T1', 'T2', 'T3'];

    for (const zone of zones) {
      const c = cur[zone] ?? 0;
      const r = ref[zone] ?? 0;
      if (c < r) {
        throw new BadRequestException(
          `Новое показание ${zone} не может быть меньше ${label} показания счётчика`,
        );
      }
    }
  }

  private assertNotGreaterThan(
    current: ZoneValues,
    reference: {
      valueT1: number;
      valueT2: number | null;
      valueT3: number | null;
    },
    label: string,
    tariffType: string,
  ) {
    const cur = resolvePhysicalValues(tariffType, current as never);
    const ref = resolvePhysicalValues(tariffType, reference);
    const zones: Array<'T1' | 'T2' | 'T3'> = ['T1', 'T2', 'T3'];

    for (const zone of zones) {
      const c = cur[zone] ?? 0;
      const r = ref[zone] ?? 0;
      if (c > r) {
        throw new BadRequestException(
          `Показание ${zone} не может быть больше ${label} показания счётчика`,
        );
      }
    }
  }

  private async findNeighbor(
    meterId: string,
    readingDate: Date,
    direction: 'previous' | 'next',
    excludeId?: string,
  ) {
    return this.prisma.meterReading.findFirst({
      where: {
        meterId,
        readingDate:
          direction === 'previous'
            ? { lt: readingDate }
            : { gt: readingDate },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: {
        readingDate: direction === 'previous' ? 'desc' : 'asc',
      },
    });
  }

  private async getReadingOrThrow(id: string) {
    const reading = await this.prisma.meterReading.findUnique({
      where: { id },
    });

    if (!reading) {
      throw new NotFoundException('Показание не найдено');
    }

    return reading;
  }
}
