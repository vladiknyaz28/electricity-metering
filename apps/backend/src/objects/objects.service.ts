import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { UpdateObjectDto } from './dto/update-object.dto';

const objectInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
      status: true,
    },
  },
  _count: {
    select: {
      meters: true,
      consumers: true,
    },
  },
} as const;

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@Injectable()
export class ObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateObjectDto, currentUser: CurrentUser) {
    const managerId =
      currentUser.role === 'object_manager' ? currentUser.id : dto.managerId;

    if (currentUser.role !== 'object_manager') {
      await this.ensureValidManager(managerId);
    }

    return this.prisma.object.create({
      data: {
        name: dto.name,
        address: dto.address,
        typeCode: dto.typeCode,
        categoryCode: dto.categoryCode,
        status: dto.status ?? 'active',
        managerId,
      },
      include: objectInclude,
    });
  }

  async findAll(currentUser: CurrentUser) {
    return this.prisma.object.findMany({
      where: this.scopeWhere(currentUser),
      include: objectInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const object = await this.prisma.object.findUnique({
      where: { id },
      include: objectInclude,
    });

    if (!object) {
      throw new NotFoundException('Объект не найден');
    }

    this.assertObjectOwnership(object.managerId, currentUser);

    return object;
  }

  async update(id: string, dto: UpdateObjectDto, currentUser: CurrentUser) {
    const existing = await this.getOrThrow(id);
    this.assertObjectOwnership(existing.managerId, currentUser);

    const data: UpdateObjectDto = { ...dto };

    if (currentUser.role === 'object_manager') {
      delete data.managerId;
    } else {
      await this.ensureValidManager(data.managerId);
    }

    return this.prisma.object.update({
      where: { id },
      data,
      include: objectInclude,
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.getOrThrow(id);
    this.assertObjectOwnership(existing.managerId, currentUser);

    return this.prisma.object.update({
      where: { id },
      data: { status: 'inactive' },
      include: objectInclude,
    });
  }

  async getMinusovka(
    id: string,
    periodStart: string,
    periodEnd: string,
    currentUser: CurrentUser,
  ) {
    if (!periodStart || !periodEnd) {
      throw new BadRequestException(
        'Параметры periodStart и periodEnd обязательны (YYYY-MM-DD)',
      );
    }

    const object = await this.getOrThrow(id);
    this.assertObjectOwnership(object.managerId, currentUser);

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

    const meters = await this.prisma.meter.findMany({
      where: { objectId: id },
      include: {
        consumer: {
          select: { id: true, name: true },
        },
      },
    });

    const mainMeter = meters.find((meter) => meter.isMain);
    if (!mainMeter) {
      return { hasMainMeter: false as const };
    }

    const mainConsumption = await this.meterPeriodConsumption(
      mainMeter.id,
      start,
      end,
      mainMeter.transformerRatio,
    );

    const consumerMeters = meters.filter(
      (meter) => meter.consumerId != null && !meter.isMain,
    );
    const breakdown: Array<{
      meterId: string;
      meterName: string;
      consumerName: string | null;
      consumption: number;
    }> = [];

    let subConsumersConsumption = 0;
    for (const meter of consumerMeters) {
      const consumption = await this.meterPeriodConsumption(
        meter.id,
        start,
        end,
        meter.transformerRatio,
      );
      subConsumersConsumption += consumption;
      breakdown.push({
        meterId: meter.id,
        meterName: meter.name,
        consumerName: meter.consumer?.name ?? null,
        consumption,
      });
    }

    const minusovka = mainConsumption - subConsumersConsumption;

    return {
      hasMainMeter: true as const,
      mainMeterId: mainMeter.id,
      mainConsumption,
      subConsumersConsumption,
      minusovka,
      isAnomaly: minusovka < 0,
      breakdown,
    };
  }

  async hardDelete(id: string) {
    const object = await this.prisma.object.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            meters: true,
            consumers: true,
          },
        },
      },
    });

    if (!object) {
      throw new NotFoundException('Объект не найден');
    }

    if (object.status !== 'inactive') {
      throw new BadRequestException(
        'Сначала выполните мягкое удаление (архивирование) объекта',
      );
    }

    if (object._count.meters > 0 || object._count.consumers > 0) {
      throw new ConflictException(
        `Невозможно удалить объект окончательно: к нему привязано ${object._count.meters} счётчиков и ${object._count.consumers} потребителей`,
      );
    }

    await this.prisma.object.delete({ where: { id } });

    return { message: 'Объект удалён окончательно' };
  }

  private scopeWhere(currentUser: CurrentUser): Prisma.ObjectWhereInput {
    if (currentUser.role === 'admin') {
      return {};
    }

    if (currentUser.role === 'object_manager') {
      return { managerId: currentUser.id };
    }

    return { id: '__none__' };
  }

  private assertObjectOwnership(
    managerId: string | null,
    currentUser: CurrentUser,
  ) {
    if (currentUser.role !== 'object_manager') {
      return;
    }

    if (managerId !== currentUser.id) {
      throw new ForbiddenException('Нет доступа к этому объекту');
    }
  }

  private async getOrThrow(id: string) {
    const object = await this.prisma.object.findUnique({ where: { id } });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }
    return object;
  }

  private async meterPeriodConsumption(
    meterId: string,
    periodStart: Date,
    periodEnd: Date,
    transformerRatio: Prisma.Decimal | number | null,
  ): Promise<number> {
    const startReading = await this.prisma.meterReading.findFirst({
      where: {
        meterId,
        readingDate: { lte: periodStart },
      },
      orderBy: { readingDate: 'desc' },
    });

    const endReading = await this.prisma.meterReading.findFirst({
      where: {
        meterId,
        readingDate: { lte: periodEnd },
      },
      orderBy: { readingDate: 'desc' },
    });

    if (!startReading || !endReading) {
      return 0;
    }

    const startTotal = this.readingTotal(startReading);
    const endTotal = this.readingTotal(endReading);
    const raw = endTotal - startTotal;
    const ratio =
      transformerRatio == null || transformerRatio === undefined
        ? 1
        : Number(transformerRatio);

    return raw * (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
  }

  private readingTotal(reading: {
    valueT1: number;
    valueT2: number | null;
    valueT3: number | null;
  }): number {
    return (
      Number(reading.valueT1) +
      Number(reading.valueT2 ?? 0) +
      Number(reading.valueT3 ?? 0)
    );
  }

  private async ensureValidManager(managerId?: string | null) {
    if (!managerId) {
      return;
    }

    const manager = await this.prisma.user.findUnique({ where: { id: managerId } });
    if (!manager) {
      throw new NotFoundException('Менеджер не найден');
    }

    if (manager.role !== 'object_manager') {
      throw new BadRequestException(
        'Пользователь с указанным managerId не является object_manager',
      );
    }
  }
}
