import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';
import {
  resolvePhysicalValues,
  totalConsumptionFromZones,
} from '../common/meter-zones';

const meterInclude = {
  object: {
    select: {
      id: true,
      name: true,
    },
  },
  consumer: {
    select: {
      id: true,
      name: true,
    },
  },
  resourceType: {
    select: {
      id: true,
      name: true,
      unit: true,
      isSystem: true,
      status: true,
    },
  },
  parentMeter: {
    select: {
      id: true,
      name: true,
      serialNumber: true,
    },
  },
  _count: {
    select: {
      readings: true,
      children: true,
    },
  },
} as const;

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

type TransformerFields = {
  hasCurrentTransformer: boolean;
  primaryCurrent: number | null;
  secondaryCurrent: number | null;
  transformerRatio: Prisma.Decimal | null;
};

@Injectable()
export class MetersService {
  private readonly logger = new Logger(MetersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMeterDto, currentUser: CurrentUser) {
    const object = await this.getObjectOrThrow(dto.objectId);
    this.assertObjectManagerAccess(currentUser, object.managerId);

    const isMain = dto.isMain ?? false;
    const consumerId = isMain ? null : (dto.consumerId ?? null);
    if (consumerId) {
      await this.ensureConsumerBelongsToObject(consumerId, dto.objectId);
    }

    const parentMeterId = isMain ? null : (dto.parentMeterId ?? null);

    // Тариф счётчика — только без потребителя; иначе берётся тариф потребителя
    const tariffId = consumerId ? null : (dto.tariffId ?? null);

    const transformer = this.resolveTransformerFields(
      dto.hasCurrentTransformer ?? false,
      dto.primaryCurrent,
      dto.secondaryCurrent,
    );

    const resourceType = await this.getResourceTypeOrThrow(dto.resourceTypeId);
    await this.validateParentMeter(
      parentMeterId,
      dto.objectId,
      null,
      resourceType.id,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (isMain) {
          await tx.meter.updateMany({
            where: { objectId: dto.objectId, isMain: true },
            data: { isMain: false },
          });
        }

        return tx.meter.create({
          data: {
            objectId: dto.objectId,
            consumerId,
            ownerType: dto.ownerType,
            name: dto.name,
            serialNumber: dto.serialNumber,
            // legacy fields: синхронизируем из справочника, в UI больше не вводятся
            resourceTypeCode: resourceType.name,
            resourceTypeId: resourceType.id,
            meterCategoryCode: dto.meterCategoryCode,
            tariffType: dto.tariffType,
            tariffId,
            unit: resourceType.unit,
            accuracyClass: dto.accuracyClass,
            status: dto.status ?? 'active',
            verificationDueDate: dto.verificationDueDate
              ? new Date(dto.verificationDueDate)
              : null,
            isMain,
            parentMeterId,
            installationLocation: dto.installationLocation,
            ...transformer,
          },
          include: meterInclude,
        });
      });
    } catch (error) {
      this.rethrowSerialConflict(error);
    }
  }

  async findAllScoped(currentUser: CurrentUser) {
    return this.prisma.meter.findMany({
      where: this.scopeWhere(currentUser),
      include: meterInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneScoped(id: string, currentUser: CurrentUser) {
    const meter = await this.prisma.meter.findUnique({
      where: { id },
      include: meterInclude,
    });

    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }

    await this.assertMeterAccess(meter, currentUser, 'Доступ запрещён');
    return meter;
  }

  async update(id: string, dto: UpdateMeterDto, currentUser: CurrentUser) {
    const existing = await this.getMeterOrThrow(id);
    await this.assertMeterAccess(
      existing,
      currentUser,
      'Вы не являетесь менеджером этого объекта',
    );

    const targetObjectId = dto.objectId ?? existing.objectId;
    if (dto.objectId && dto.objectId !== existing.objectId) {
      const object = await this.getObjectOrThrow(dto.objectId);
      this.assertObjectManagerAccess(currentUser, object.managerId);
    }

    const targetIsMain = dto.isMain ?? existing.isMain;
    const targetConsumerId =
      targetIsMain === true
        ? null
        : dto.consumerId !== undefined
          ? dto.consumerId
          : existing.consumerId;

    if (targetConsumerId) {
      await this.ensureConsumerBelongsToObject(targetConsumerId, targetObjectId);
    }

    const {
      hasCurrentTransformer,
      primaryCurrent,
      secondaryCurrent,
      verificationDueDate,
      isMain: dtoIsMain,
      consumerId: _consumerId,
      objectId: dtoObjectId,
      resourceTypeId,
      resourceTypeCode: _legacyCode,
      unit: _legacyUnit,
      parentMeterId: dtoParentMeterId,
      tariffId: dtoTariffId,
      ...rest
    } = dto;

    let parentMeterId: string | null | undefined = undefined;
    if (targetIsMain) {
      parentMeterId = null;
    } else if (dtoParentMeterId !== undefined) {
      parentMeterId = dtoParentMeterId;
    }

    const targetResourceTypeId =
      resourceTypeId !== undefined
        ? resourceTypeId
        : existing.resourceTypeId;

    const parentToValidate =
      parentMeterId !== undefined
        ? parentMeterId
        : resourceTypeId !== undefined
          ? existing.parentMeterId
          : undefined;

    if (parentToValidate !== undefined) {
      await this.validateParentMeter(
        parentToValidate,
        targetObjectId,
        id,
        targetResourceTypeId,
      );
    }

    let tariffId: string | null | undefined = undefined;
    if (targetConsumerId) {
      // При наличии потребителя тариф счётчика не используется
      tariffId = null;
    } else if (dtoTariffId !== undefined) {
      tariffId = dtoTariffId;
    }

    const data: Prisma.MeterUncheckedUpdateInput = {
      ...rest,
      objectId: dtoObjectId,
      isMain: dtoIsMain,
      consumerId: targetIsMain
        ? null
        : dto.consumerId !== undefined
          ? targetConsumerId
          : undefined,
      parentMeterId,
      tariffId,
      verificationDueDate:
        verificationDueDate !== undefined
          ? verificationDueDate
            ? new Date(verificationDueDate)
            : null
          : undefined,
    };

    if (resourceTypeId) {
      const resourceType = await this.getResourceTypeOrThrow(resourceTypeId);
      data.resourceTypeId = resourceType.id;
      data.unit = resourceType.unit;
      data.resourceTypeCode = resourceType.name;
    }

    const shouldUpdateTransformer =
      hasCurrentTransformer !== undefined ||
      primaryCurrent !== undefined ||
      secondaryCurrent !== undefined;

    if (shouldUpdateTransformer) {
      Object.assign(
        data,
        this.resolveTransformerFields(
          hasCurrentTransformer ?? existing.hasCurrentTransformer,
          primaryCurrent !== undefined
            ? primaryCurrent
            : (existing.primaryCurrent ?? undefined),
          secondaryCurrent !== undefined
            ? secondaryCurrent
            : (existing.secondaryCurrent ?? undefined),
        ),
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.isMain === true) {
          await tx.meter.updateMany({
            where: {
              objectId: targetObjectId,
              isMain: true,
              NOT: { id },
            },
            data: { isMain: false },
          });
        }

        if (dto.isMain === true || targetIsMain) {
          data.parentMeterId = null;
        }

        return tx.meter.update({
          where: { id },
          data,
          include: meterInclude,
        });
      });
    } catch (error) {
      this.rethrowSerialConflict(error);
    }
  }

  async getMinusovka(
    meterId: string,
    periodStart: string,
    periodEnd: string,
    currentUser: CurrentUser,
  ) {
    if (!periodStart || !periodEnd) {
      throw new BadRequestException(
        'Параметры periodStart и periodEnd обязательны (YYYY-MM-DD)',
      );
    }

    const start = new Date(`${periodStart}T00:00:00.000Z`);
    const end = new Date(`${periodEnd}T23:59:59.999Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Некорректный формат даты периода');
    }

    if (start > end) {
      throw new BadRequestException(
        'periodStart не может быть позже periodEnd',
      );
    }

    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
    });

    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }

    await this.assertMeterAccess(meter, currentUser, 'Доступ запрещён');

    const children = await this.findMinusovkaChildren(meter);

    if (children.length === 0) {
      throw new BadRequestException(
        'У этого счётчика нет подчинённых счётчиков, минусовку считать не с чем',
      );
    }

    const parentResult = await this.calculateMeterConsumption(
      meter.id,
      start,
      end,
    );
    const parentConsumption = parentResult.consumption;

    const breakdown: Array<{
      meterId: string;
      meterName: string;
      consumerName: string | null;
      consumption: number;
      hasData: boolean;
    }> = [];

    let childrenConsumption = 0;
    for (const child of children) {
      const childResult = await this.calculateMeterConsumption(
        child.id,
        start,
        end,
      );
      childrenConsumption += childResult.consumption;
      breakdown.push({
        meterId: child.id,
        meterName: child.name,
        consumerName: child.consumer?.name ?? null,
        consumption: childResult.consumption,
        hasData: childResult.hasData,
      });
    }

    const minusovka = parentConsumption - childrenConsumption;

    this.logger.debug(
      `[minusovka] meter=${meterId} period=${periodStart}..${periodEnd} ` +
        `parent=${parentConsumption} (hasData=${parentResult.hasData}) ` +
        `children=${childrenConsumption} minusovka=${minusovka} ` +
        `kids=${children.length} isMain=${meter.isMain}`,
    );

    return {
      parentMeterId: meter.id,
      parentMeterName: meter.name,
      parentConsumption,
      childrenConsumption,
      minusovka,
      isAnomaly: minusovka < 0,
      breakdown,
    };
  }

  /**
   * familyId тарифа для расчёта Тариф/Сумма:
   * — есть потребитель → consumer.tariffId
   * — нет потребителя (главный/групповой) → meter.tariffId
   */
  async resolveMeterTariffFamilyId(meter: {
    consumerId: string | null;
    tariffId?: string | null;
  }): Promise<string | null> {
    if (meter.consumerId) {
      const consumer = await this.prisma.consumer.findUnique({
        where: { id: meter.consumerId },
        select: { tariffId: true },
      });
      return consumer?.tariffId ?? null;
    }
    return meter.tariffId ?? null;
  }

  /**
   * Счётчики, вычитаемые из минусовки данного родителя.
   * Главный (isMain): все счётчики объекта ТОГО ЖЕ resourceTypeId с
   * parentMeterId = этот id ИЛИ parentMeterId IS NULL (питаются от
   * главного по умолчанию), кроме самого главного.
   * Счётчики другого типа ресурса НИКОГДА не включаются.
   * Не главный: только явные дети (parentMeterId = этот id) того же ресурса.
   */
  async findMinusovkaChildren(meter: {
    id: string;
    objectId: string;
    isMain: boolean;
    resourceTypeId: string | null;
  }) {
    const sameResource: { resourceTypeId: string | null } = {
      resourceTypeId: meter.resourceTypeId ?? null,
    };

    if (meter.isMain) {
      return this.prisma.meter.findMany({
        where: {
          objectId: meter.objectId,
          id: { not: meter.id },
          isMain: false,
          ...sameResource,
          OR: [{ parentMeterId: meter.id }, { parentMeterId: null }],
        },
        select: {
          id: true,
          name: true,
          serialNumber: true,
          parentMeterId: true,
          resourceTypeId: true,
          consumer: {
            select: { id: true, name: true },
          },
        },
        orderBy: { name: 'asc' },
      });
    }

    return this.prisma.meter.findMany({
      where: {
        parentMeterId: meter.id,
        ...sameResource,
      },
      select: {
        id: true,
        name: true,
        serialNumber: true,
        parentMeterId: true,
        resourceTypeId: true,
        consumer: {
          select: { id: true, name: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Потребление счётчика за период [periodStart, periodEnd].
   * Та же модель, что строки таблицы Показаний: для каждой пары
   * consecutive readings, где дата ТЕКУЩЕГО показания попадает в период,
   * добавляем (current − previous) × transformerRatio по активным зонам.
   *
   * exclusiveStart=true — интервал (periodStart, periodEnd], нужен для
   * остатка по строке родителя (чтобы не захватить предыдущую строку).
   * exclusiveStart=false — [periodStart, periodEnd] для месячной минусовки.
   */
  async calculateMeterConsumption(
    meterId: string,
    periodStart: Date,
    periodEnd: Date,
    options?: { exclusiveStart?: boolean },
  ): Promise<{ consumption: number; hasData: boolean }> {
    const detailed = await this.calculateMeterConsumptionDetailed(
      meterId,
      periodStart,
      periodEnd,
      options,
    );
    return {
      consumption: detailed.consumption,
      hasData: detailed.hasData,
    };
  }

  async calculateMeterConsumptionDetailed(
    meterId: string,
    periodStart: Date,
    periodEnd: Date,
    options?: { exclusiveStart?: boolean },
  ): Promise<{
    consumption: number;
    byZone: { T1: number; T2: number; T3: number };
    hasData: boolean;
  }> {
    const empty = {
      consumption: 0,
      byZone: { T1: 0, T2: 0, T3: 0 },
      hasData: false,
    };

    const meter = await this.prisma.meter.findUnique({
      where: { id: meterId },
      select: {
        id: true,
        tariffType: true,
        transformerRatio: true,
      },
    });

    if (!meter) {
      return empty;
    }

    const startBound = this.startOfUtcDay(periodStart);
    const endBound = this.endOfUtcDay(periodEnd);
    const exclusiveStart = options?.exclusiveStart === true;

    const readings = await this.prisma.meterReading.findMany({
      where: { meterId },
      orderBy: { readingDate: 'asc' },
      select: {
        id: true,
        readingDate: true,
        valueT1: true,
        valueT2: true,
        valueT3: true,
      },
    });

    if (readings.length < 2) {
      this.logger.debug(
        `[consumption] meter=${meterId} readings=${readings.length} → 0`,
      );
      return empty;
    }

    const ratio = this.resolveTransformerRatio(meter.transformerRatio);

    let cT1Sum = 0;
    let cT2Sum = 0;
    let cT3Sum = 0;
    let intervals = 0;

    for (let index = 1; index < readings.length; index++) {
      const previous = readings[index - 1];
      const current = readings[index];
      const inPeriod = exclusiveStart
        ? current.readingDate > startBound && current.readingDate <= endBound
        : current.readingDate >= startBound && current.readingDate <= endBound;

      if (!inPeriod) {
        continue;
      }

      const curPhys = resolvePhysicalValues(meter.tariffType, current);
      const prevPhys = resolvePhysicalValues(meter.tariffType, previous);

      const cT1 = this.round4((curPhys.T1 - prevPhys.T1) * ratio);
      const cT2 = this.round4((curPhys.T2 - prevPhys.T2) * ratio);
      const cT3 = this.round4((curPhys.T3 - prevPhys.T3) * ratio);

      cT1Sum = this.round4(cT1Sum + cT1);
      cT2Sum = this.round4(cT2Sum + cT2);
      cT3Sum = this.round4(cT3Sum + cT3);
      intervals += 1;
    }

    const byZone = { T1: cT1Sum, T2: cT2Sum, T3: cT3Sum };
    const consumption = this.round4(
      totalConsumptionFromZones(cT1Sum, cT2Sum, cT3Sum),
    );

    this.logger.debug(
      `[consumption] meter=${meterId} period=${startBound.toISOString().slice(0, 10)}..${endBound.toISOString().slice(0, 10)} ` +
        `exclusiveStart=${exclusiveStart} intervals=${intervals} consumption=${consumption}`,
    );

    return { consumption, byZone, hasData: intervals > 0 };
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

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private endOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
        23,
        59,
        59,
        999,
      ),
    );
  }

  private round4(value: number): number {
    return Math.round(value * 10000) / 10000;
  }

  private async validateParentMeter(
    parentMeterId: string | null,
    objectId: string,
    selfId: string | null,
    childResourceTypeId: string | null | undefined,
  ) {
    if (!parentMeterId) {
      return;
    }

    if (selfId && parentMeterId === selfId) {
      throw new BadRequestException(
        'Счётчик не может быть родителем самому себе',
      );
    }

    const parent = await this.prisma.meter.findUnique({
      where: { id: parentMeterId },
      select: {
        id: true,
        objectId: true,
        parentMeterId: true,
        resourceTypeId: true,
      },
    });

    if (!parent) {
      throw new BadRequestException('Родительский счётчик не найден');
    }

    if (parent.objectId !== objectId) {
      throw new BadRequestException(
        'Родительский счётчик должен принадлежать тому же объекту',
      );
    }

    if (
      childResourceTypeId !== undefined &&
      (parent.resourceTypeId ?? null) !== (childResourceTypeId ?? null)
    ) {
      throw new BadRequestException(
        'Счётчик может быть подчинён только счётчику того же типа ресурса',
      );
    }

    if (!selfId) {
      return;
    }

    let cursor: string | null = parent.parentMeterId;
    const visited = new Set<string>([parent.id]);

    while (cursor) {
      if (cursor === selfId) {
        throw new BadRequestException('Циклическая вложенность счётчиков');
      }
      if (visited.has(cursor)) {
        break;
      }
      visited.add(cursor);

      const next: { id: string; parentMeterId: string | null } | null =
        await this.prisma.meter.findUnique({
          where: { id: cursor },
          select: { id: true, parentMeterId: true },
        });
      cursor = next?.parentMeterId ?? null;
    }
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.getMeterOrThrow(id);
    await this.assertMeterAccess(
      existing,
      currentUser,
      'Вы не являетесь менеджером этого объекта',
    );

    return this.prisma.meter.update({
      where: { id },
      data: { status: 'inactive' },
      include: meterInclude,
    });
  }

  async hardDelete(id: string, currentUser: CurrentUser) {
    const meter = await this.prisma.meter.findUnique({
      where: { id },
      include: {
        object: {
          select: {
            managerId: true,
          },
        },
        _count: {
          select: {
            readings: true,
          },
        },
      },
    });

    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }

    if (
      currentUser.role === 'object_manager' &&
      meter.object.managerId !== currentUser.id
    ) {
      throw new ForbiddenException('Нет доступа к этому счётчику');
    }

    if (meter.status !== 'inactive') {
      throw new BadRequestException('Сначала выполните мягкое удаление счётчика');
    }

    if (meter._count.readings > 0) {
      throw new ConflictException(
        `Невозможно удалить: у счётчика есть ${meter._count.readings} показаний`,
      );
    }

    await this.prisma.meter.delete({ where: { id } });

    return { message: 'Счётчик удалён окончательно' };
  }

  private resolveTransformerFields(
    hasCurrentTransformer: boolean,
    primaryCurrent?: number | null,
    secondaryCurrent?: number | null,
  ): TransformerFields {
    if (!hasCurrentTransformer) {
      return {
        hasCurrentTransformer: false,
        primaryCurrent: null,
        secondaryCurrent: null,
        transformerRatio: null,
      };
    }

    if (
      primaryCurrent == null ||
      secondaryCurrent == null ||
      primaryCurrent <= 0 ||
      secondaryCurrent <= 0
    ) {
      throw new BadRequestException(
        'Для подключения через трансформаторы тока укажите primaryCurrent и secondaryCurrent (> 0)',
      );
    }

    const ratio =
      Math.round((primaryCurrent / secondaryCurrent) * 10000) / 10000;

    return {
      hasCurrentTransformer: true,
      primaryCurrent,
      secondaryCurrent,
      transformerRatio: new Prisma.Decimal(ratio.toFixed(4)),
    };
  }

  private scopeWhere(currentUser: CurrentUser): Prisma.MeterWhereInput {
    if (currentUser.role === 'admin') {
      return {};
    }

    if (currentUser.role === 'object_manager') {
      return { object: { managerId: currentUser.id } };
    }

    if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      return { consumerId: currentUser.consumerId };
    }

    return { id: '__none__' };
  }

  private async assertMeterAccess(
    meter: { objectId: string; consumerId: string | null },
    currentUser: CurrentUser,
    forbiddenMessage: string,
  ) {
    if (currentUser.role === 'admin') {
      return;
    }

    if (currentUser.role === 'object_manager') {
      const object = await this.getObjectOrThrow(meter.objectId);
      if (object.managerId !== currentUser.id) {
        throw new ForbiddenException(forbiddenMessage);
      }
      return;
    }

    if (currentUser.role === 'consumer') {
      if (currentUser.consumerId !== meter.consumerId) {
        throw new ForbiddenException('Доступ запрещён');
      }
      return;
    }

    throw new ForbiddenException('Доступ запрещён');
  }

  private assertObjectManagerAccess(
    currentUser: CurrentUser,
    managerId: string | null,
  ) {
    if (currentUser.role !== 'object_manager') {
      return;
    }

    if (managerId !== currentUser.id) {
      throw new ForbiddenException('Вы не являетесь менеджером этого объекта');
    }
  }

  private async getResourceTypeOrThrow(id: string) {
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { id },
    });
    if (!resourceType) {
      throw new NotFoundException('Тип ресурса не найден');
    }
    if (resourceType.status !== 'active') {
      throw new BadRequestException('Тип ресурса неактивен');
    }
    return resourceType;
  }

  private async getObjectOrThrow(objectId: string) {
    const object = await this.prisma.object.findUnique({ where: { id: objectId } });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }
    return object;
  }

  private async getMeterOrThrow(id: string) {
    const meter = await this.prisma.meter.findUnique({ where: { id } });
    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }
    return meter;
  }

  private async ensureConsumerBelongsToObject(
    consumerId: string | undefined,
    objectId: string,
  ) {
    if (!consumerId) {
      return;
    }

    const consumer = await this.prisma.consumer.findUnique({ where: { id: consumerId } });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (consumer.objectId !== objectId) {
      throw new BadRequestException(
        'Потребитель не принадлежит указанному объекту',
      );
    }
  }

  private rethrowSerialConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException(
        'Счётчик с таким серийным номером уже существует',
      );
    }
    throw error;
  }
}
