import { IsNotEmpty, IsNumber, IsOptional, IsString, ValidateIf } from 'class-validator';

export class CreateConsumerDto {
  @IsNotEmpty()
  @IsString()
  objectId: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  type: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  contactPerson?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumber()
  area?: number;

  @IsOptional()
  @IsNumber()
  sharePercent?: number;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  tariffId?: string | null;

  @IsOptional()
  @IsString()
  status?: string;
}
