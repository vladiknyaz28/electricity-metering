import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDto } from './create-user.dto';

/** Все поля CreateUserDto опциональны, включая password (@IsOptional через PartialType). */
export class UpdateUserDto extends PartialType(CreateUserDto) {}
