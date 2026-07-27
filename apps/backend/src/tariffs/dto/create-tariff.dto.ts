import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class TariffZoneDto {
  @IsNotEmpty()
  @IsString()
  zoneCode: string;

  @IsNumber()
  @Min(0.001)
  @Type(() => Number)
  rate: number;
}

export class CreateTariffDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  resourceTypeId: string;

  /** @deprecated синхронизируется из ResourceType */
  @IsOptional()
  @IsString()
  resourceTypeCode?: string;

  @IsDateString()
  validFrom: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Укажите хотя бы одну ставку' })
  @ValidateNested({ each: true })
  @Type(() => TariffZoneDto)
  zones: TariffZoneDto[];
}
