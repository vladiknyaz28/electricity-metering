import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
import { CreateChargeDto } from './dto/create-charge.dto';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

const chargeInclude = {
  meter: {
    select: {
      id: true,
      name: true,
      serialNumber: true,
    },
  },
  consumer: {
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
} as const;

@Injectable()
export class ChargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
  ) {}

  async calculate(dto: CreateChargeDto, currentUser: CurrentUser) {
    const meter = await this.metersService.findOneScoped(dto.meterId, currentUser);

    if (!meter.consumerId) {
      throw new BadRequestException(
        'У счётчика не указан потребитель, начисление невозможно',
      );
    }

    const consumer = await this.prisma.consumer.findUnique({
      where: { id: meter.consumerId },
    });
    if (!consumer) {
      throw new NotFoundException('Потребитель не найден');
    }

    if (!consumer.tariffId) {
      throw new BadRequestException('Потребителю не назначен тариф');
    }

    const tariff = await this.prisma.tariff.findUnique({
      where: { id: consumer.tariffId },
      include: { zones: true },
    });
    if (!tariff) {
      throw new NotFoundException('Тариф не найден');
    }
    if (tariff.status !== 'active') {
      throw new BadRequestException('Тариф неактивен');
    }

    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    const startReading = await this.prisma.meterReading.findFirst({
      where: {
        meterId: dto.meterId,
        readingDate: { lte: periodStart },
      },
      orderBy: { readingDate: 'desc' },
    });
    if (!startReading) {
      throw new NotFoundException('Нет показаний на начало периода');
    }

    const endReading = await this.prisma.meterReading.findFirst({
      where: {
        meterId: dto.meterId,
        readingDate: { lte: periodEnd },
      },
      orderBy: { readingDate: 'desc' },
    });
    if (!endReading || endReading.id === startReading.id) {
      throw new BadRequestException(
        'Недостаточно показаний за указанный период',
      );
    }

    const consumptionT1 = this.round2(endReading.valueT1 - startReading.valueT1);
    if (consumptionT1 < 0) {
      throw new BadRequestException('Отрицательный расход — проверьте показания');
    }

    const consumptionT2 = this.calcZoneConsumption(
      startReading.valueT2,
      endReading.valueT2,
    );
    const consumptionT3 = this.calcZoneConsumption(
      startReading.valueT3,
      endReading.valueT3,
    );

    const rateT1 = this.getZoneRate(tariff.zones, 'T1', consumptionT1 != null);
    const rateT2 = this.getZoneRate(tariff.zones, 'T2', consumptionT2 != null);
    const rateT3 = this.getZoneRate(tariff.zones, 'T3', consumptionT3 != null);

    const amountT1 = this.round2(consumptionT1 * rateT1);
    const amountT2 =
      consumptionT2 != null && rateT2 != null
        ? this.round2(consumptionT2 * rateT2)
        : null;
    const amountT3 =
      consumptionT3 != null && rateT3 != null
        ? this.round2(consumptionT3 * rateT3)
        : null;

    const totalAmount = this.round2(
      amountT1 + (amountT2 ?? 0) + (amountT3 ?? 0),
    );

    return this.prisma.charge.create({
      data: {
        consumerId: consumer.id,
        meterId: meter.id,
        tariffId: tariff.id,
        periodStart,
        periodEnd,
        startReadingId: startReading.id,
        endReadingId: endReading.id,
        consumptionT1,
        consumptionT2,
        consumptionT3,
        amountT1,
        amountT2,
        amountT3,
        totalAmount,
        status: 'draft',
      },
      include: chargeInclude,
    });
  }

  async findAllScoped(currentUser: CurrentUser) {
    return this.prisma.charge.findMany({
      where: this.scopeWhere(currentUser),
      include: chargeInclude,
      orderBy: { periodStart: 'desc' },
    });
  }

  async findOneScoped(id: string, currentUser: CurrentUser) {
    const charge = await this.prisma.charge.findUnique({
      where: { id },
      include: {
        ...chargeInclude,
        meter: {
          select: {
            id: true,
            name: true,
            serialNumber: true,
            objectId: true,
            consumerId: true,
          },
        },
      },
    });

    if (!charge) {
      throw new NotFoundException('Начисление не найдено');
    }

    await this.metersService.findOneScoped(charge.meterId, currentUser);
    return charge;
  }

  async confirm(id: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) {
      throw new NotFoundException('Начисление не найдено');
    }

    return this.prisma.charge.update({
      where: { id },
      data: { status: 'confirmed' },
      include: chargeInclude,
    });
  }

  private scopeWhere(currentUser: CurrentUser): Prisma.ChargeWhereInput {
    if (currentUser.role === 'admin') {
      return {};
    }

    if (currentUser.role === 'object_manager') {
      return { meter: { object: { managerId: currentUser.id } } };
    }

    if (currentUser.role === 'consumer') {
      if (!currentUser.consumerId) {
        return { id: '__none__' };
      }
      return { consumerId: currentUser.consumerId };
    }

    return { id: '__none__' };
  }

  private calcZoneConsumption(
    startValue: number | null,
    endValue: number | null,
  ): number | null {
    if (startValue == null || endValue == null) {
      return null;
    }

    const consumption = this.round2(endValue - startValue);
    if (consumption < 0) {
      throw new BadRequestException('Отрицательный расход — проверьте показания');
    }
    return consumption;
  }

  private getZoneRate(
    zones: { zoneCode: string; rate: number }[],
    zoneCode: string,
    required: boolean,
  ): number {
    const zone = zones.find((item) => item.zoneCode === zoneCode);
    if (!zone) {
      if (required) {
        throw new BadRequestException(
          `В тарифе не найдена ставка для зоны ${zoneCode}`,
        );
      }
      return 0;
    }
    return zone.rate;
  }

  private round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
