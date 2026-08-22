import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export const TRIAL_LIMITS = {
  maxObjects: 5,
  maxMeters: 12,
  maxReadingsPerMonth: 30,
} as const;

const TRIAL_CONTACT =
  'Триал-режим: достигнут лимит. Для снятия ограничений свяжитесь с нами: vladiknyaz28@mail.ru · +7 916 578-68-60';

@Injectable()
export class TrialLimitsService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreateObject() {
    const count = await this.prisma.object.count({
      where: { status: { not: 'inactive' } },
    });
    if (count >= TRIAL_LIMITS.maxObjects) {
      throw new BadRequestException(
        `${TRIAL_CONTACT} (объекты: ${count}/${TRIAL_LIMITS.maxObjects})`,
      );
    }
  }

  async assertCanCreateMeter() {
    const count = await this.prisma.meter.count();
    if (count >= TRIAL_LIMITS.maxMeters) {
      throw new BadRequestException(
        `${TRIAL_CONTACT} (счётчики: ${count}/${TRIAL_LIMITS.maxMeters})`,
      );
    }
  }

  async assertCanCreateReading() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const count = await this.prisma.meterReading.count({
      where: { readingDate: { gte: monthStart, lt: monthEnd } },
    });
    if (count >= TRIAL_LIMITS.maxReadingsPerMonth) {
      throw new BadRequestException(
        `${TRIAL_CONTACT} (показания в этом месяце: ${count}/${TRIAL_LIMITS.maxReadingsPerMonth})`,
      );
    }
  }
}
