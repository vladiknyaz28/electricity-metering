import { Type } from 'class-transformer';
import { IsDateString, IsNotEmpty, IsString } from 'class-validator';

export class CreateChargeDto {
  @IsNotEmpty()
  @IsString()
  meterId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;
}
