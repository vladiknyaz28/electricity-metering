import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { UpdateObjectDto } from './dto/update-object.dto';

const managerInclude = {
  manager: {
    select: {
      id: true,
      fullName: true,
      email: true,
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
      include: managerInclude,
    });
  }

  async findAll() {
    return this.prisma.object.findMany({
      include: managerInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const object = await this.prisma.object.findUnique({
      where: { id },
      include: managerInclude,
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
      include: managerInclude,
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.object.update({
      where: { id },
      data: { status: 'inactive' },
      include: managerInclude,
    });
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
