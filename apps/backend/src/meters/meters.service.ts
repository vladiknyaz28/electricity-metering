import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';

const meterInclude = {
  object: {
    select: {
      id: true,
      name: true,
    },
  },
  consumer: {
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
export class MetersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMeterDto, currentUser: CurrentUser) {
    const object = await this.getObjectOrThrow(dto.objectId);
    this.assertObjectManagerAccess(currentUser, object.managerId);
    await this.ensureConsumerBelongsToObject(dto.consumerId, dto.objectId);

    try {
      return await this.prisma.meter.create({
        data: {
          objectId: dto.objectId,
          consumerId: dto.consumerId,
          ownerType: dto.ownerType,
          name: dto.name,
          serialNumber: dto.serialNumber,
          resourceTypeCode: dto.resourceTypeCode,
          meterCategoryCode: dto.meterCategoryCode,
          tariffType: dto.tariffType,
          unit: dto.unit,
          accuracyClass: dto.accuracyClass,
          status: dto.status ?? 'active',
          verificationDueDate: dto.verificationDueDate
            ? new Date(dto.verificationDueDate)
            : null,
          isMain: dto.isMain ?? false,
          installationLocation: dto.installationLocation,
          hasCurrentTransformer: dto.hasCurrentTransformer ?? false,
          currentTransformerPrimary: dto.currentTransformerPrimary,
          currentTransformerSecondary: dto.currentTransformerSecondary,
          transformationCoefficient: dto.transformationCoefficient ?? 1,
        },
        include: meterInclude,
      });
    } catch (error) {
      this.rethrowSerialConflict(error);
    }
  }

  async findAllScoped(currentUser: CurrentUser) {
    return this.prisma.meter.findMany({
      where: this.scopeWhere(currentUser),
      include: meterInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneScoped(id: string, currentUser: CurrentUser) {
    const meter = await this.prisma.meter.findUnique({
      where: { id },
      include: meterInclude,
    });

    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }

    await this.assertMeterAccess(meter, currentUser, 'Доступ запрещён');
    return meter;
  }

  async update(id: string, dto: UpdateMeterDto, currentUser: CurrentUser) {
    const existing = await this.getMeterOrThrow(id);
    await this.assertMeterAccess(
      existing,
      currentUser,
      'Вы не являетесь менеджером этого объекта',
    );

    const targetObjectId = dto.objectId ?? existing.objectId;
    if (dto.objectId && dto.objectId !== existing.objectId) {
      const object = await this.getObjectOrThrow(dto.objectId);
      this.assertObjectManagerAccess(currentUser, object.managerId);
    }

    const targetConsumerId =
      dto.consumerId !== undefined ? dto.consumerId : existing.consumerId;
    if (dto.consumerId !== undefined || dto.objectId) {
      await this.ensureConsumerBelongsToObject(targetConsumerId ?? undefined, targetObjectId);
    }

    try {
      return await this.prisma.meter.update({
        where: { id },
        data: {
          ...dto,
          verificationDueDate:
            dto.verificationDueDate !== undefined
              ? dto.verificationDueDate
                ? new Date(dto.verificationDueDate)
                : null
              : undefined,
        },
        include: meterInclude,
      });
    } catch (error) {
      this.rethrowSerialConflict(error);
    }
  }

  async remove(id: string, currentUser: CurrentUser) {
    const existing = await this.getMeterOrThrow(id);
    await this.assertMeterAccess(
      existing,
      currentUser,
      'Вы не являетесь менеджером этого объекта',
    );

    return this.prisma.meter.update({
      where: { id },
      data: { status: 'inactive' },
      include: meterInclude,
    });
  }

  private scopeWhere(currentUser: CurrentUser): Prisma.MeterWhereInput {
    if (currentUser.role === 'admin') {
      return {};
    }

    if (currentUser.role === 'object_manager') {
      return { object: { managerId: currentUser.id } };
    }

    if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      return { consumerId: currentUser.consumerId };
    }

    return { id: '__none__' };
  }

  private async assertMeterAccess(
    meter: { objectId: string; consumerId: string | null },
    currentUser: CurrentUser,
    forbiddenMessage: string,
  ) {
    if (currentUser.role === 'admin') {
      return;
    }

    if (currentUser.role === 'object_manager') {
      const object = await this.getObjectOrThrow(meter.objectId);
      if (object.managerId !== currentUser.id) {
        throw new ForbiddenException(forbiddenMessage);
      }
      return;
    }

    if (currentUser.role === 'consumer') {
      if (currentUser.consumerId !== meter.consumerId) {
        throw new ForbiddenException('Доступ запрещён');
      }
      return;
    }

    throw new ForbiddenException('Доступ запрещён');
  }

  private assertObjectManagerAccess(
    currentUser: CurrentUser,
    managerId: string | null,
  ) {
    if (currentUser.role !== 'object_manager') {
      return;
    }

    if (managerId !== currentUser.id) {
      throw new ForbiddenException('Вы не являетесь менеджером этого объекта');
    }
  }

  private async getObjectOrThrow(objectId: string) {
    const object = await this.prisma.object.findUnique({ where: { id: objectId } });
    if (!object) {
      throw new NotFoundException('Объект не найден');
    }
    return object;
  }

  private async getMeterOrThrow(id: string) {
    const meter = await this.prisma.meter.findUnique({ where: { id } });
    if (!meter) {
      throw new NotFoundException('Счётчик не найден');
    }
    return meter;
  }

  private async ensureConsumerBelongsToObject(
    consumerId: string | undefined,
    objectId: string,
  ) {
    if (!consumerId) {
      return;
    }

    const consumer = await this.prisma.consumer.findUnique({ where: { id: consumerId } });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (consumer.objectId !== objectId) {
      throw new BadRequestException('Потребитель не принадлежит указанному объекту');
    }
  }

  private rethrowSerialConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('Счётчик с таким серийным номером уже существует');
    }
    throw error;
  }
}
