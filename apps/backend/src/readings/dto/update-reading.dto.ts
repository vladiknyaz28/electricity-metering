import { PartialType, OmitType } from '@nestjs/mapped-types';
import { Transform, Type } from 'class-transformer';
import { IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';
import { CreateReadingDto } from './create-reading.dto';

function optionalNullableNumber({ value }: { value: unknown }) {
  if (value === null) return null;
  if (value === undefined || value === '') return undefined;
  return Number(value);
}

export class UpdateReadingDto extends PartialType(
  OmitType(CreateReadingDto, ['meterId'] as const),
) {
  @IsOptional()
  @Transform(optionalNullableNumber)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rateT1Override?: number | null;

  @IsOptional()
  @Transform(optionalNullableNumber)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rateT2Override?: number | null;

  @IsOptional()
  @Transform(optionalNullableNumber)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  rateT3Override?: number | null;
}
