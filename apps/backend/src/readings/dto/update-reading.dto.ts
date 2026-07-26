import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateReadingDto } from './create-reading.dto';

export class UpdateReadingDto extends PartialType(
  OmitType(CreateReadingDto, ['meterId'] as const),
) {}
