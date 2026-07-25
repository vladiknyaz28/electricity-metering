import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MetersService } from '../meters/meters.service';
import { CreateReadingDto } from './dto/create-reading.dto';

type CurrentUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@Injectable()
export class ReadingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metersService: MetersService,
  ) {}

  async create(dto: CreateReadingDto, currentUser: CurrentUser) {
    await this.metersService.findOneScoped(dto.meterId, currentUser);

    const readingDate = new Date(dto.readingDate);

    const lastReading = await this.prisma.meterReading.findFirst({
      where: { meterId: dto.meterId },
      orderBy: { readingDate: 'desc' },
    });

    if (lastReading) {
      if (dto.valueT1 < lastReading.valueT1) {
        throw new BadRequestException(
          'Новое показание не может быть меньше предыдущего для зоны T1',
        );
      }

      if (
        dto.valueT2 != null &&
        lastReading.valueT2 != null &&
        dto.valueT2 < lastReading.valueT2
      ) {
        throw new BadRequestException(
          'Новое показание не может быть меньше предыдущего для зоны T2',
        );
      }

      if (
        dto.valueT3 != null &&
        lastReading.valueT3 != null &&
        dto.valueT3 < lastReading.valueT3
      ) {
        throw new BadRequestException(
          'Новое показание не может быть меньше предыдущего для зоны T3',
        );
      }
    }

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
        previousValue: lastReading?.valueT1 ?? null,
        transformationCoefficient: 1,
        source: dto.source ?? 'manual',
        status: 'submitted',
        anomalyType: 'none',
        isClosedPeriod: false,
        comment: dto.comment,
        submittedById: currentUser.id,
      },
    });
  }

  async findAllByMeter(meterId: string, currentUser: CurrentUser) {
    await this.metersService.findOneScoped(meterId, currentUser);

    return this.prisma.meterReading.findMany({
      where: { meterId },
      orderBy: { readingDate: 'desc' },
    });
  }
}
