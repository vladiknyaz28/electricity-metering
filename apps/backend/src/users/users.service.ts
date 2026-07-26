import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
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

  async findAll(role?: string) {
    const where: Prisma.UserWhereInput = role ? { role } : {};
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.sanitize(user);
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);

    const { password, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (password !== undefined && password !== '') {
      data.passwordHash = await bcrypt.hash(password, 10);
    }

    const user = await this.prisma.user.update({ where: { id }, data });
    return this.sanitize(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { status: 'inactive' },
    });
    return this.sanitize(user);
  }

  async hardDelete(id: string) {
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

  private sanitize(user: any) {
    const { passwordHash, ...rest } = user;
    return rest;
  }
}
