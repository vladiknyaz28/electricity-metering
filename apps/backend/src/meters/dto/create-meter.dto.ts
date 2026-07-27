import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateMeterDto {
  @IsNotEmpty()
  @IsString()
  objectId: string;

  @IsOptional()
  @IsString()
  consumerId?: string;

  @IsNotEmpty()
  @IsString()
  ownerType: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  serialNumber: string;

  @IsNotEmpty()
  @IsString()
  resourceTypeId: string;

  /** @deprecated используйте resourceTypeId; заполняется на сервере */
  @IsOptional()
  @IsString()
  resourceTypeCode?: string;

  @IsNotEmpty()
  @IsString()
  meterCategoryCode: string;

  @IsNotEmpty()
  @IsString()
  tariffType: string;

  /** @deprecated берётся из ResourceType.unit */
  @IsOptional()
  @IsString()
  unit?: string;

  @IsNotEmpty()
  @IsString()
  accuracyClass: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  verificationDueDate?: string;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  parentMeterId?: string | null;

  @IsNotEmpty()
  @IsString()
  installationLocation: string;

  @IsOptional()
  @IsBoolean()
  hasCurrentTransformer?: boolean;

  @IsOptional()
  @IsNumber()
  primaryCurrent?: number;

  @IsOptional()
  @IsNumber()
  secondaryCurrent?: number;
}
