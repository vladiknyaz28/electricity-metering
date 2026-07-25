import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateObjectDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  address: string;

  @IsNotEmpty()
  @IsString()
  typeCode: string;

  @IsNotEmpty()
  @IsString()
  categoryCode: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  managerId?: string;
}
