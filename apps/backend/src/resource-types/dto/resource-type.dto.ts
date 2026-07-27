import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateResourceTypeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  unit: string;
}

export class UpdateResourceTypeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}
