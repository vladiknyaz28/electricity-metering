import { PartialType } from '@nestjs/mapped-types';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Все поля CreateUserDto опциональны, включая password (@IsOptional через PartialType). */
export class UpdateUserDto extends PartialType(CreateUserDto) {
  @IsOptional()
  @IsString()
  @IsIn(['active', 'inactive'])
  status?: string;
}
