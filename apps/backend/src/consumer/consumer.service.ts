import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsumerDto } from './dto/create-consumer.dto';
import { UpdateConsumerDto } from './dto/update-consumer.dto';

const consumerInclude = {
  object: {
    select: {
      id: true,
      name: true,
    },
  },
  tariff: {
    select: {
      id: true,
      name: true,
    },
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
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateConsumerDto) {
    await this.ensureObjectExists(dto.objectId);

    return this.prisma.consumer.create({
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
        tariffId: dto.tariffId,
        status: dto.status ?? 'active',
      },
      include: consumerInclude,
    });
  }

  async findAll(currentUser: CurrentUser) {
    return this.prisma.consumer.findMany({
      where: this.scopeWhere(currentUser),
      include: consumerInclude,
      orderBy: { createdAt: 'desc' },
    });
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

    return consumer;
  }

  async update(id: string, dto: UpdateConsumerDto) {
    await this.findExisting(id);

    if (dto.objectId) {
      await this.ensureObjectExists(dto.objectId);
    }

    return this.prisma.consumer.update({
      where: { id },
      data: dto,
      include: consumerInclude,
    });
  }

  async remove(id: string) {
    await this.findExisting(id);

    return this.prisma.consumer.update({
      where: { id },
      data: { status: 'inactive' },
      include: consumerInclude,
    });
  }

  async hardDelete(id: string) {
    const consumer = await this.prisma.consumer.findUnique({
      where: { id },
      include: consumerInclude,
    });

    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
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

  private async ensureObjectExists(objectId: string) {
    const object = await this.prisma.object.findUnique({ where: { id: objectId } });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }
  }
}
