import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';

export class NewTariffVersionDto {
  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  rateT1?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  rateT2?: number;

  @IsOptional()
  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  rateT3?: number;
}
