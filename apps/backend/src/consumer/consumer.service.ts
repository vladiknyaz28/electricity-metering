import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConsumerDto } from './dto/create-consumer.dto';
import { UpdateConsumerDto } from './dto/update-consumer.dto';

const objectInclude = {
  object: {
    select: {
      id: true,
      name: true,
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
        status: dto.status ?? 'active',
      },
      include: objectInclude,
    });
  }

  async findAll() {
    return this.prisma.consumer.findMany({
      include: objectInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForUser(id: string, currentUser: CurrentUser) {
    const consumer = await this.prisma.consumer.findUnique({
      where: { id },
      include: objectInclude,
    });

    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (currentUser.role === 'consumer' && currentUser.consumerId !== id) {
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
      include: objectInclude,
    });
  }

  async remove(id: string) {
    await this.findExisting(id);

    return this.prisma.consumer.update({
      where: { id },
      data: { status: 'inactive' },
      include: objectInclude,
    });
  }

  private async findExisting(id: string) {
    const consumer = await this.prisma.consumer.findUnique({ where: { id } });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }
    return consumer;
  }

  private async ensureObjectExists(objectId: string) {
    const object = await this.prisma.object.findUnique({ where: { id: objectId } });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }
  }
}
