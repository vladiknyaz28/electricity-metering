import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TariffsService } from '../tariffs/tariffs.service';
import { CreateConsumerDto } from './dto/create-consumer.dto';
import { UpdateConsumerDto } from './dto/update-consumer.dto';

const consumerInclude = {
  object: {
    select: {
      id: true,
      name: true,
    },
  },
  meters: {
    select: {
      id: true,
      name: true,
      serialNumber: true,
      parentMeterId: true,
      parentMeter: {
        select: {
          id: true,
          name: true,
          serialNumber: true,
        },
      },
    },
    orderBy: { name: 'asc' as const },
  },
  _count: {
    select: {
      meters: true,
      users: true,
    },
  },
} as const;

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@Injectable()
export class ConsumerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tariffsService: TariffsService,
  ) {}

  async create(dto: CreateConsumerDto, currentUser: CurrentUser) {
    await this.assertManagedObjectAccess(dto.objectId, currentUser);
    await this.assertTariffFamily(dto.tariffId);

    const consumer = await this.prisma.consumer.create({
      data: {
        objectId: dto.objectId,
        name: dto.name,
        type: dto.type,
        taxId: dto.taxId,
        contactPerson: dto.contactPerson,
        phone: dto.phone,
        email: dto.email,
        area: dto.area,
        sharePercent: dto.sharePercent,
        tariffId: dto.tariffId ?? null,
        status: dto.status ?? 'active',
      },
      include: consumerInclude,
    });

    return this.withTariff(consumer);
  }

  async findAll(currentUser: CurrentUser) {
    const consumers = await this.prisma.consumer.findMany({
      where: this.scopeWhere(currentUser),
      include: consumerInclude,
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(consumers.map((item) => this.withTariff(item)));
  }

  async findOneForUser(id: string, currentUser: CurrentUser) {
    const consumer = await this.prisma.consumer.findUnique({
      where: { id },
      include: {
        ...consumerInclude,
        object: {
          select: {
            id: true,
            name: true,
            managerId: true,
          },
        },
      },
    });

    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (currentUser.role === 'consumer' && currentUser.consumerId !== id) {
      throw new ForbiddenException('Доступ запрещён');
    }

    if (
      currentUser.role === 'object_manager' &&
      consumer.object.managerId !== currentUser.id
    ) {
      throw new ForbiddenException('Доступ запрещён');
    }

    return this.withTariff(consumer);
  }

  async update(id: string, dto: UpdateConsumerDto, currentUser: CurrentUser) {
    const existing = await this.findExisting(id);
    await this.assertManagedObjectAccess(existing.objectId, currentUser);

    if (dto.objectId && dto.objectId !== existing.objectId) {
      await this.assertManagedObjectAccess(dto.objectId, currentUser);
    }

    if (dto.tariffId !== undefined) {
      await this.assertTariffFamily(dto.tariffId);
    }

    const consumer = await this.prisma.consumer.update({
      where: { id },
      data: dto,
      include: consumerInclude,
    });

    return this.withTariff(consumer);
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.findExisting(id);
    await this.assertManagedObjectAccess(existing.objectId, currentUser);

    const consumer = await this.prisma.consumer.update({
      where: { id },
      data: { status: 'inactive' },
      include: consumerInclude,
    });

    return this.withTariff(consumer);
  }

  async hardDelete(id: string, currentUser: CurrentUser) {
    const consumer = await this.prisma.consumer.findUnique({
      where: { id },
      include: {
        ...consumerInclude,
        object: {
          select: {
            id: true,
            name: true,
            managerId: true,
          },
        },
      },
    });

    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (
      currentUser.role === 'object_manager' &&
      consumer.object.managerId !== currentUser.id
    ) {
      throw new ForbiddenException('Доступ запрещён');
    }

    if (consumer.status !== 'inactive') {
      throw new BadRequestException(
        'Сначала выполните мягкое удаление (архивирование)',
      );
    }

    if (consumer._count.meters > 0 || consumer._count.users > 0) {
      throw new ConflictException(
        `Невозможно удалить окончательно: привязано ${consumer._count.meters} счётчиков и ${consumer._count.users} пользователей`,
      );
    }

    await this.prisma.consumer.delete({ where: { id } });

    return { message: 'Потребитель удалён окончательно' };
  }

  private async withTariff<T extends { tariffId: string | null }>(consumer: T) {
    if (!consumer.tariffId) {
      return { ...consumer, tariff: null };
    }

    const version = await this.tariffsService.resolveActiveTariffVersion(
      consumer.tariffId,
      new Date(),
    );

    if (!version) {
      return {
        ...consumer,
        tariff: {
          id: consumer.tariffId,
          name: 'Тариф не найден',
          familyId: consumer.tariffId,
        },
      };
    }

    return {
      ...consumer,
      tariff: {
        id: version.familyId ?? version.id,
        familyId: version.familyId ?? version.id,
        name: version.name,
        resourceType: version.resourceType,
        zones: version.zones,
        validFrom: version.validFrom,
        validTo: version.validTo,
      },
    };
  }

  private async assertTariffFamily(tariffId: string | null | undefined) {
    if (tariffId == null || tariffId === '') {
      return;
    }

    const open = await this.prisma.tariff.findFirst({
      where: { familyId: tariffId, validTo: null, status: 'active' },
      select: { id: true },
    });

    if (!open) {
      throw new BadRequestException('Указанная семья тарифов не найдена');
    }
  }

  private async findExisting(id: string) {
    const consumer = await this.prisma.consumer.findUnique({ where: { id } });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }
    return consumer;
  }

  private scopeWhere(currentUser: CurrentUser): Prisma.ConsumerWhereInput {
    if (currentUser.role === 'admin') {
      return {};
    }

    if (currentUser.role === 'object_manager') {
      return { object: { managerId: currentUser.id } };
    }

    return { id: '__none__' };
  }

  private async assertManagedObjectAccess(
    objectId: string,
    currentUser: CurrentUser,
  ) {
    const object = await this.prisma.object.findUnique({
      where: { id: objectId },
    });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }

    if (
      currentUser.role === 'object_manager' &&
      object.managerId !== currentUser.id
    ) {
      throw new ForbiddenException('Нет доступа к этому объекту');
    }
  }
}
