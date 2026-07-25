import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';

@Injectable()
export class TariffsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTariffDto) {
    return this.prisma.tariff.create({
      data: {
        name: dto.name,
        resourceTypeCode: dto.resourceTypeCode,
        validFrom: new Date(dto.validFrom),
        validTo: dto.validTo ? new Date(dto.validTo) : null,
        status: dto.status ?? 'active',
        zones: {
          create: dto.zones.map((zone) => ({
            zoneCode: zone.zoneCode,
            rate: zone.rate,
          })),
        },
      },
      include: { zones: true },
    });
  }

  async findAll() {
    return this.prisma.tariff.findMany({
      include: { zones: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const tariff = await this.prisma.tariff.findUnique({
      where: { id },
      include: { zones: true },
    });

    if (!tariff) {
      throw new NotFoundException('Тариф не найден');
    }

    return tariff;
  }

  async update(id: string, dto: UpdateTariffDto) {
    await this.findOne(id);

    const { zones, validFrom, validTo, ...rest } = dto;

    return this.prisma.$transaction(async (tx) => {
      if (zones) {
        await tx.tariffZone.deleteMany({ where: { tariffId: id } });
        await tx.tariffZone.createMany({
          data: zones.map((zone) => ({
            tariffId: id,
            zoneCode: zone.zoneCode,
            rate: zone.rate,
          })),
        });
      }

      return tx.tariff.update({
        where: { id },
        data: {
          ...rest,
          ...(validFrom !== undefined
            ? { validFrom: new Date(validFrom) }
            : {}),
          ...(validTo !== undefined
            ? { validTo: validTo ? new Date(validTo) : null }
            : {}),
        },
        include: { zones: true },
      });
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.tariff.update({
      where: { id },
      data: { status: 'inactive' },
      include: { zones: true },
    });
  }

  async assignToConsumer(consumerId: string, tariffId: string) {
    await this.findOne(tariffId);

    const consumer = await this.prisma.consumer.findUnique({
      where: { id: consumerId },
    });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    return this.prisma.consumer.update({
      where: { id: consumerId },
      data: { tariffId },
      include: {
        tariff: { include: { zones: true } },
        object: { select: { id: true, name: true } },
      },
    });
  }
}
