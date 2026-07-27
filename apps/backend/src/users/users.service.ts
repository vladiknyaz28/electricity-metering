import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto, currentUser: CurrentUser) {
    if (currentUser.role === 'object_manager') {
      if (dto.role !== 'consumer' || !dto.consumerId) {
        throw new ForbiddenException(
          'Менеджер может создавать только логины потребителей своих объектов',
        );
      }
      await this.assertManagerOwnsConsumer(dto.consumerId, currentUser.id);
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Пользователь с таким email уже существует');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
        passwordHash,
        role: dto.role,
        consumerId: dto.consumerId,
      },
    });

    return this.sanitize(user);
  }

  async findAll(
    filters: { role?: string; consumerId?: string },
    currentUser: CurrentUser,
  ) {
    if (currentUser.role === 'object_manager') {
      if (!filters.consumerId) {
        throw new ForbiddenException(
          'Менеджеру доступен только список пользователей конкретного потребителя',
        );
      }
      await this.assertManagerOwnsConsumer(filters.consumerId, currentUser.id);
    }

    const where: Prisma.UserWhereInput = {};
    if (filters.role) {
      where.role = filters.role;
    }
    if (filters.consumerId) {
      where.consumerId = filters.consumerId;
    }

    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string, currentUser: CurrentUser) {
    const user = await this.findById(id);
    await this.assertCanManageUser(user, currentUser);
    return this.sanitize(user);
  }

  /** Внутренний поиск без ACL (JWT validate и т.п.). */
  async findById(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.sanitize(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto, currentUser: CurrentUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Пользователь не найден');
    }
    await this.assertCanManageUser(existing, currentUser);

    if (currentUser.role === 'object_manager') {
      if (dto.role && dto.role !== 'consumer') {
        throw new ForbiddenException(
          'Менеджер не может менять роль пользователя на не-consumer',
        );
      }
      if (dto.consumerId && dto.consumerId !== existing.consumerId) {
        await this.assertManagerOwnsConsumer(dto.consumerId, currentUser.id);
      }
    }

    const { password, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (password !== undefined && password !== '') {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await this.prisma.user.update({ where: { id }, data });
    return this.sanitize(user);
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Пользователь не найден');
    }
    await this.assertCanManageUser(existing, currentUser);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'inactive' },
    });
    return this.sanitize(user);
  }

  async hardDelete(id: string, currentUser: CurrentUser) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            managedObjects: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    await this.assertCanManageUser(user, currentUser);

    if (user.status !== 'inactive') {
      throw new BadRequestException(
        'Сначала выполните мягкое удаление (деактивацию) пользователя',
      );
    }

    if (user._count.managedObjects > 0) {
      throw new ConflictException(
        `Невозможно удалить: пользователь назначен менеджером на ${user._count.managedObjects} объектов`,
      );
    }

    await this.prisma.user.delete({ where: { id } });

    return { message: 'Пользователь удалён окончательно' };
  }

  private async assertManagerOwnsConsumer(
    consumerId: string,
    managerId: string,
  ) {
    const consumer = await this.prisma.consumer.findUnique({
      where: { id: consumerId },
      include: {
        object: {
          select: { managerId: true },
        },
      },
    });

    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (consumer.object.managerId !== managerId) {
      throw new ForbiddenException('Нет доступа к этому потребителю');
    }
  }

  private async assertCanManageUser(
    user: { role: string; consumerId: string | null },
    currentUser: CurrentUser,
  ) {
    if (currentUser.role === 'admin') {
      return;
    }

    if (currentUser.role !== 'object_manager') {
      throw new ForbiddenException('Доступ запрещён');
    }

    if (user.role !== 'consumer' || !user.consumerId) {
      throw new ForbiddenException(
        'Менеджер может управлять только логинами потребителей',
      );
    }

    await this.assertManagerOwnsConsumer(user.consumerId, currentUser.id);
  }

  private sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
