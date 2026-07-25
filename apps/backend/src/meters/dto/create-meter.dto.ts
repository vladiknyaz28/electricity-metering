import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
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
  resourceTypeCode: string;

  @IsNotEmpty()
  @IsString()
  meterCategoryCode: string;

  @IsNotEmpty()
  @IsString()
  tariffType: string;

  @IsNotEmpty()
  @IsString()
  unit: string;

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

  @IsNotEmpty()
  @IsString()
  installationLocation: string;

  @IsOptional()
  @IsBoolean()
  hasCurrentTransformer?: boolean;

  @IsOptional()
  @IsNumber()
  currentTransformerPrimary?: number;

  @IsOptional()
  @IsNumber()
  currentTransformerSecondary?: number;

  @IsOptional()
  @IsNumber()
  transformationCoefficient?: number;
}
