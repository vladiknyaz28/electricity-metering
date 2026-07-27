import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateReadingDto {
  @IsNotEmpty()
  @IsString()
  meterId: string;

  @IsDateString()
  readingDate: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  valueT1?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  valueT2?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  valueT3?: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  comment?: string;
}
