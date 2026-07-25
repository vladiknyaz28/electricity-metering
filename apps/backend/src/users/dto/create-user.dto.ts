import { IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export const USER_ROLES = ['admin', 'object_manager', 'consumer', 'auditor'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsIn(USER_ROLES)
  role: UserRole;

  @IsOptional()
  @IsString()
  consumerId?: string;
}