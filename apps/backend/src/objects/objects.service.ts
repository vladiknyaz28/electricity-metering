import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
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
  meters: {
    select: {
      id: true,
      resourceTypeId: true,
      resourceTypeCode: true,
      resourceType: { select: { id: true, name: true } },
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
  ) {}

  async create(dto: CreateObjectDto, currentUser: CurrentUser) {
    const managerId =
      currentUser.role === 'object_manager' ? currentUser.id : dto.managerId;

    if (currentUser.role !== 'object_manager') {
      await this.ensureValidManager(managerId);
    }

    return this.withMetersByResource(
      await this.prisma.object.create({
        data: {
          name: dto.name,
          address: dto.address,
          typeCode: dto.typeCode,
          categoryCode: dto.categoryCode,
          status: dto.status ?? 'active',
          managerId,
        },
        include: objectInclude,
      }),
    );
  }

  async findAll(currentUser: CurrentUser) {
    const objects = await this.prisma.object.findMany({
      where: this.scopeWhere(currentUser),
      include: objectInclude,
      orderBy: { createdAt: 'desc' },
    });
    return objects.map((object) => this.withMetersByResource(object));
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
    return this.withMetersByResource(object);
  }

  private withMetersByResource<
    T extends {
      meters: Array<{
        resourceTypeId: string | null;
        resourceTypeCode: string;
        resourceType: { id: string; name: string } | null;
      }>;
    },
  >(object: T) {
    const map = new Map<
      string,
      { resourceTypeId: string | null; resourceName: string; count: number }
    >();
    for (const meter of object.meters) {
      const resourceTypeId = meter.resourceTypeId;
      const resourceName =
        meter.resourceType?.name || meter.resourceTypeCode || 'Ресурс';
      const key = resourceTypeId ?? resourceName;
      const prev = map.get(key) ?? {
        resourceTypeId,
        resourceName,
        count: 0,
      };
      prev.count += 1;
      map.set(key, prev);
    }
    const { meters: _meters, ...rest } = object;
    return {
      ...rest,
      metersByResource: [...map.values()].sort((a, b) =>
        a.resourceName.localeCompare(b.resourceName, 'ru'),
      ),
    };
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

    return this.withMetersByResource(
      await this.prisma.object.update({
        where: { id },
        data,
        include: objectInclude,
      }),
    );
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.getOrThrow(id);
    this.assertObjectOwnership(existing.managerId, currentUser);

    return this.withMetersByResource(
      await this.prisma.object.update({
        where: { id },
        data: { status: 'inactive' },
        include: objectInclude,
      }),
    );
  }

  async getMinusovka(
    id: string,
    periodStart: string,
    periodEnd: string,
    currentUser: CurrentUser,
  ) {
    const object = await this.getOrThrow(id);
    this.assertObjectOwnership(object.managerId, currentUser);

    const mainMeter = await this.prisma.meter.findFirst({
      where: { objectId: id, isMain: true },
      select: { id: true },
    });

    if (!mainMeter) {
      return { hasMainMeter: false as const };
    }

    const result = await this.metersService.getMinusovka(
      mainMeter.id,
      periodStart,
      periodEnd,
      currentUser,
    );

    return {
      hasMainMeter: true as const,
      mainMeterId: result.parentMeterId,
      mainConsumption: result.parentConsumption,
      subConsumersConsumption: result.childrenConsumption,
      minusovka: result.minusovka,
      isAnomaly: result.isAnomaly,
      breakdown: result.breakdown,
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
