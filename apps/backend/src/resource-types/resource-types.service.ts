import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateResourceTypeDto,
  UpdateResourceTypeDto,
} from './dto/resource-type.dto';

@Injectable()
export class ResourceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.resourceType.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: {
        _count: {
          select: { meters: true },
        },
      },
    });
  }

  async create(dto: CreateResourceTypeDto) {
    return this.prisma.resourceType.create({
      data: {
        name: dto.name.trim(),
        unit: dto.unit.trim(),
        isSystem: false,
        status: 'active',
      },
      include: {
        _count: {
          select: { meters: true },
        },
      },
    });
  }

  async update(id: string, dto: UpdateResourceTypeDto) {
    await this.getOrThrow(id);

    return this.prisma.resourceType.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        unit: dto.unit?.trim(),
        status: dto.status,
      },
      include: {
        _count: {
          select: { meters: true },
        },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.resourceType.findUnique({
      where: { id },
      include: {
        _count: {
          select: { meters: true },
        },
      },
    });

    if (!existing) {
      throw new NotFoundException('Тип ресурса не найден');
    }

    if (existing.isSystem) {
      throw new ForbiddenException(
        'Системные типы нельзя удалить, можно только деактивировать',
      );
    }

    if (existing._count.meters > 0) {
      throw new ConflictException(
        `Нельзя удалить тип ресурса: к нему привязано ${existing._count.meters} счётчиков`,
      );
    }

    await this.prisma.resourceType.delete({ where: { id } });
    return { message: 'Тип ресурса удалён' };
  }

  private async getOrThrow(id: string) {
    const item = await this.prisma.resourceType.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException('Тип ресурса не найден');
    }
    return item;
  }
}
