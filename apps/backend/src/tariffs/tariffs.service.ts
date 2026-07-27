import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { NewTariffVersionDto } from './dto/new-tariff-version.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';

const tariffInclude = {
  zones: true,
  resourceType: {
    select: {
      id: true,
      name: true,
      unit: true,
      isSystem: true,
      status: true,
    },
  },
} as const;

@Injectable()
export class TariffsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Находит версию тарифа семьи, действующую на дату onDate.
   * consumer.tariffId хранит familyId.
   */
  async resolveActiveTariffVersion(familyId: string, onDate: Date) {
    if (!familyId) {
      return null;
    }

    const day = this.startOfUtcDay(onDate);

    const version = await this.prisma.tariff.findFirst({
      where: {
        familyId,
        status: 'active',
        validFrom: { lte: day },
        OR: [{ validTo: null }, { validTo: { gte: day } }],
      },
      include: tariffInclude,
      orderBy: { validFrom: 'desc' },
    });

    return version;
  }

  async create(dto: CreateTariffDto) {
    const resourceType = await this.prisma.resourceType.findUnique({
      where: { id: dto.resourceTypeId },
    });
    if (!resourceType) {
      throw new BadRequestException('Тип ресурса не найден');
    }

    if (!dto.zones?.length) {
      throw new BadRequestException('Укажите хотя бы одну ставку');
    }

    const validFrom = this.startOfUtcDay(new Date(dto.validFrom));

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.tariff.create({
        data: {
          name: dto.name.trim(),
          resourceTypeId: resourceType.id,
          resourceTypeCode: resourceType.name,
          validFrom,
          validTo: null,
          status: dto.status ?? 'active',
          zones: {
            create: dto.zones.map((zone) => ({
              zoneCode: zone.zoneCode,
              rate: this.roundRate(zone.rate),
            })),
          },
        },
        include: tariffInclude,
      });

      return tx.tariff.update({
        where: { id: created.id },
        data: { familyId: created.id },
        include: tariffInclude,
      });
    });
  }

  async createNewVersion(familyId: string, dto: NewTariffVersionDto) {
    const openVersion = await this.prisma.tariff.findFirst({
      where: { familyId, validTo: null },
      include: { zones: true },
      orderBy: { validFrom: 'desc' },
    });

    if (!openVersion) {
      throw new NotFoundException('Открытая версия тарифа не найдена');
    }

    const newValidFrom = this.startOfUtcDay(new Date(dto.validFrom));
    const openValidFrom = this.startOfUtcDay(openVersion.validFrom);

    if (newValidFrom <= openValidFrom) {
      throw new BadRequestException(
        'Дата вступления новой версии должна быть строго позже validFrom текущей версии',
      );
    }

    const closeValidTo = this.addUtcDays(newValidFrom, -1);
    const zones = this.ratesToZones(dto);

    return this.prisma.$transaction(async (tx) => {
      await tx.tariff.update({
        where: { id: openVersion.id },
        data: { validTo: closeValidTo },
      });

      return tx.tariff.create({
        data: {
          name: openVersion.name,
          resourceTypeId: openVersion.resourceTypeId,
          resourceTypeCode: openVersion.resourceTypeCode,
          familyId,
          validFrom: newValidFrom,
          validTo: null,
          status: 'active',
          zones: {
            create: zones,
          },
        },
        include: tariffInclude,
      });
    });
  }

  /** Список семей с текущей открытой версией (validTo = null). */
  async findFamilies() {
    const openVersions = await this.prisma.tariff.findMany({
      where: { validTo: null, status: 'active' },
      include: tariffInclude,
      orderBy: { name: 'asc' },
    });

    return openVersions.map((version) => ({
      familyId: version.familyId ?? version.id,
      name: version.name,
      status: version.status,
      resourceTypeId: version.resourceTypeId,
      resourceType: version.resourceType,
      currentVersion: version,
    }));
  }

  async findHistory(familyId: string) {
    const versions = await this.prisma.tariff.findMany({
      where: { familyId },
      include: tariffInclude,
      orderBy: { validFrom: 'desc' },
    });

    if (versions.length === 0) {
      throw new NotFoundException('Семья тарифов не найдена');
    }

    return {
      familyId,
      name: versions[0].name,
      versions,
    };
  }

  /** @deprecated используйте findFamilies; оставлен для совместимости */
  async findAll() {
    return this.findFamilies();
  }

  async findOne(id: string) {
    const tariff = await this.prisma.tariff.findUnique({
      where: { id },
      include: tariffInclude,
    });

    if (!tariff) {
      throw new NotFoundException('Тариф не найден');
    }

    return tariff;
  }

  async update(id: string, dto: UpdateTariffDto) {
    await this.findOne(id);

    const { zones, validFrom, resourceTypeId, ...rest } = dto;

    let resourceTypeCode: string | undefined;
    if (resourceTypeId) {
      const resourceType = await this.prisma.resourceType.findUnique({
        where: { id: resourceTypeId },
      });
      if (!resourceType) {
        throw new BadRequestException('Тип ресурса не найден');
      }
      resourceTypeCode = resourceType.name;
    }

    return this.prisma.$transaction(async (tx) => {
      if (zones) {
        await tx.tariffZone.deleteMany({ where: { tariffId: id } });
        await tx.tariffZone.createMany({
          data: zones.map((zone) => ({
            tariffId: id,
            zoneCode: zone.zoneCode,
            rate: this.roundRate(zone.rate),
          })),
        });
      }

      return tx.tariff.update({
        where: { id },
        data: {
          ...rest,
          ...(resourceTypeId ? { resourceTypeId, resourceTypeCode } : {}),
          ...(validFrom !== undefined
            ? { validFrom: this.startOfUtcDay(new Date(validFrom)) }
            : {}),
        },
        include: tariffInclude,
      });
    });
  }

  async removeFamily(familyId: string) {
    const versions = await this.prisma.tariff.findMany({
      where: { familyId },
      select: { id: true },
    });

    if (versions.length === 0) {
      throw new NotFoundException('Семья тарифов не найдена');
    }

    const assignedConsumers = await this.prisma.consumer.count({
      where: { tariffId: familyId },
    });

    if (assignedConsumers > 0) {
      throw new ConflictException(
        `Тариф назначен ${assignedConsumers} потребителям, сначала снимите назначение`,
      );
    }

    const versionIds = versions.map((item) => item.id);

    await this.prisma.$transaction(async (tx) => {
      // Charge ссылается на версию Tariff без onDelete Cascade
      await tx.charge.deleteMany({
        where: { tariffId: { in: versionIds } },
      });
      // TariffZone удалится каскадно вместе с Tariff
      await tx.tariff.deleteMany({
        where: { id: { in: versionIds } },
      });
    });

    return { familyId, message: 'Тариф удалён окончательно' };
  }

  async assignToConsumer(consumerId: string, familyId: string) {
    const open = await this.prisma.tariff.findFirst({
      where: { familyId, validTo: null, status: 'active' },
    });
    if (!open) {
      throw new NotFoundException('Семья тарифов не найдена');
    }

    const consumer = await this.prisma.consumer.findUnique({
      where: { id: consumerId },
    });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    return this.prisma.consumer.update({
      where: { id: consumerId },
      data: { tariffId: familyId },
      include: {
        object: { select: { id: true, name: true } },
      },
    });
  }

  private ratesToZones(dto: NewTariffVersionDto) {
    const zones: Array<{ zoneCode: string; rate: Prisma.Decimal }> = [];
    if (dto.rateT1 != null) {
      zones.push({ zoneCode: 'T1', rate: this.roundRate(dto.rateT1) });
    }
    if (dto.rateT2 != null) {
      zones.push({ zoneCode: 'T2', rate: this.roundRate(dto.rateT2) });
    }
    if (dto.rateT3 != null) {
      zones.push({ zoneCode: 'T3', rate: this.roundRate(dto.rateT3) });
    }
    if (zones.length === 0) {
      throw new BadRequestException('Укажите хотя бы одну ставку');
    }
    return zones;
  }

  private roundRate(value: number): Prisma.Decimal {
    const rounded = Math.round(Number(value) * 1000) / 1000;
    return new Prisma.Decimal(rounded.toFixed(3));
  }

  private startOfUtcDay(date: Date): Date {
    return new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
  }

  private addUtcDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setUTCDate(result.getUTCDate() + days);
    return result;
  }
}
