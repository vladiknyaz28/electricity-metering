import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { UpdateObjectDto } from './dto/update-object.dto';

const objectInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
    },
  },
  _count: {
    select: {
      meters: true,
      consumers: true,
    },
  },
} as const;

@Injectable()
export class ObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateObjectDto) {
    await this.ensureValidManager(dto.managerId);

    return this.prisma.object.create({
      data: {
        name: dto.name,
        address: dto.address,
        typeCode: dto.typeCode,
        categoryCode: dto.categoryCode,
        status: dto.status ?? 'active',
        managerId: dto.managerId,
      },
      include: objectInclude,
    });
  }

  async findAll() {
    return this.prisma.object.findMany({
      include: objectInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const object = await this.prisma.object.findUnique({
      where: { id },
      include: objectInclude,
    });

    if (!object) {
      throw new NotFoundException('Объект не найден');
    }

    return object;
  }

  async update(id: string, dto: UpdateObjectDto) {
    await this.findOne(id);
    await this.ensureValidManager(dto.managerId);

    return this.prisma.object.update({
      where: { id },
      data: dto,
      include: objectInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.object.update({
      where: { id },
      data: { status: 'inactive' },
      include: objectInclude,
    });
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

  private async ensureValidManager(managerId?: string) {
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
