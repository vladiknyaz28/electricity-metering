import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { UpdateReadingDto } from './dto/update-reading.dto';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

type ZoneValues = {
  valueT1: number;
  valueT2?: number | null;
  valueT3?: number | null;
};

@Injectable()
export class ReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
  ) {}

  async create(dto: CreateReadingDto, currentUser: CurrentUser) {
    this.assertCanMutate(currentUser);

    const meter = await this.metersService.findOneScoped(
      dto.meterId,
      currentUser,
    );
    this.assertRequiredZones(meter.tariffType, dto);

    const readingDate = new Date(dto.readingDate);
    await this.assertMonotonic(dto.meterId, readingDate, dto);

    const previous = await this.findNeighbor(
      dto.meterId,
      readingDate,
      'previous',
    );
    const periodCode = readingDate.toISOString();

    return this.prisma.meterReading.create({
      data: {
        meterId: dto.meterId,
        periodCode,
        periodStartDate: readingDate,
        periodEndDate: readingDate,
        valueT1: dto.valueT1,
        valueT2: dto.valueT2,
        valueT3: dto.valueT3,
        readingDate,
        currentValue: dto.valueT1,
        previousValue: previous?.valueT1 ?? null,
        transformationCoefficient: 1,
        source: 'manual',
        status: 'submitted',
        anomalyType: 'none',
        isClosedPeriod: false,
        comment: dto.comment,
        submittedById: currentUser.id,
      },
    });
  }

  async findAllByMeter(meterId: string, currentUser: CurrentUser) {
    if (!meterId) {
      throw new BadRequestException('Параметр meterId обязателен');
    }

    await this.metersService.findOneScoped(meterId, currentUser);

    return this.prisma.meterReading.findMany({
      where: { meterId },
      orderBy: { readingDate: 'desc' },
    });
  }

  async update(id: string, dto: UpdateReadingDto, currentUser: CurrentUser) {
    this.assertCanMutate(currentUser);

    const existing = await this.getReadingOrThrow(id);
    const meter = await this.metersService.findOneScoped(
      existing.meterId,
      currentUser,
    );

    const readingDate = dto.readingDate
      ? new Date(dto.readingDate)
      : existing.readingDate;

    const values: ZoneValues = {
      valueT1: dto.valueT1 ?? existing.valueT1,
      valueT2:
        dto.valueT2 !== undefined ? dto.valueT2 : existing.valueT2,
      valueT3:
        dto.valueT3 !== undefined ? dto.valueT3 : existing.valueT3,
    };

    this.assertRequiredZones(meter.tariffType, values);
    await this.assertMonotonic(
      existing.meterId,
      readingDate,
      values,
      existing.id,
    );

    const previous = await this.findNeighbor(
      existing.meterId,
      readingDate,
      'previous',
      existing.id,
    );

    return this.prisma.meterReading.update({
      where: { id },
      data: {
        readingDate,
        periodCode: readingDate.toISOString(),
        periodStartDate: readingDate,
        periodEndDate: readingDate,
        valueT1: values.valueT1,
        valueT2: values.valueT2,
        valueT3: values.valueT3,
        currentValue: values.valueT1,
        previousValue: previous?.valueT1 ?? null,
        comment: dto.comment !== undefined ? dto.comment : undefined,
      },
    });
  }

  async remove(id: string, currentUser: CurrentUser) {
    this.assertCanMutate(currentUser);

    const existing = await this.getReadingOrThrow(id);
    await this.metersService.findOneScoped(existing.meterId, currentUser);

    return this.prisma.meterReading.delete({
      where: { id },
    });
  }

  private assertCanMutate(currentUser: CurrentUser) {
    if (
      currentUser.role !== 'admin' &&
      currentUser.role !== 'object_manager'
    ) {
      throw new ForbiddenException(
        'Потребитель может только просматривать показания',
      );
    }
  }

  private assertRequiredZones(tariffType: string, values: ZoneValues) {
    if (
      (tariffType === 'double' || tariffType === 'triple') &&
      values.valueT2 == null
    ) {
      throw new BadRequestException(
        'Для этого счётчика обязательно указать значение T2',
      );
    }

    if (tariffType === 'triple' && values.valueT3 == null) {
      throw new BadRequestException(
        'Для этого счётчика обязательно указать значение T3',
      );
    }
  }

  private async assertMonotonic(
    meterId: string,
    readingDate: Date,
    values: ZoneValues,
    excludeId?: string,
  ) {
    const previous = await this.findNeighbor(
      meterId,
      readingDate,
      'previous',
      excludeId,
    );
    if (previous) {
      this.assertNotLessThan(values, previous, 'предыдущего');
    }

    const next = await this.findNeighbor(
      meterId,
      readingDate,
      'next',
      excludeId,
    );
    if (next) {
      this.assertNotGreaterThan(values, next, 'следующего');
    }
  }

  private assertNotLessThan(
    current: ZoneValues,
    reference: ZoneValues,
    label: string,
  ) {
    if (current.valueT1 < reference.valueT1) {
      throw new BadRequestException(
        `Новое показание T1 не может быть меньше ${label} показания счётчика`,
      );
    }

    if (
      current.valueT2 != null &&
      reference.valueT2 != null &&
      current.valueT2 < reference.valueT2
    ) {
      throw new BadRequestException(
        `Новое показание T2 не может быть меньше ${label} показания счётчика`,
      );
    }

    if (
      current.valueT3 != null &&
      reference.valueT3 != null &&
      current.valueT3 < reference.valueT3
    ) {
      throw new BadRequestException(
        `Новое показание T3 не может быть меньше ${label} показания счётчика`,
      );
    }
  }

  private assertNotGreaterThan(
    current: ZoneValues,
    reference: ZoneValues,
    label: string,
  ) {
    if (current.valueT1 > reference.valueT1) {
      throw new BadRequestException(
        `Показание T1 не может быть больше ${label} показания счётчика`,
      );
    }

    if (
      current.valueT2 != null &&
      reference.valueT2 != null &&
      current.valueT2 > reference.valueT2
    ) {
      throw new BadRequestException(
        `Показание T2 не может быть больше ${label} показания счётчика`,
      );
    }

    if (
      current.valueT3 != null &&
      reference.valueT3 != null &&
      current.valueT3 > reference.valueT3
    ) {
      throw new BadRequestException(
        `Показание T3 не может быть больше ${label} показания счётчика`,
      );
    }
  }

  private async findNeighbor(
    meterId: string,
    readingDate: Date,
    direction: 'previous' | 'next',
    excludeId?: string,
  ) {
    return this.prisma.meterReading.findFirst({
      where: {
        meterId,
        readingDate:
          direction === 'previous'
            ? { lt: readingDate }
            : { gt: readingDate },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: {
        readingDate: direction === 'previous' ? 'desc' : 'asc',
      },
    });
  }

  private async getReadingOrThrow(id: string) {
    const reading = await this.prisma.meterReading.findUnique({
      where: { id },
    });

    if (!reading) {
      throw new NotFoundException('Показание не найдено');
    }

    return reading;
  }
}
