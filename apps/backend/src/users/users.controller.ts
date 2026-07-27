import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('admin', 'object_manager')
  create(@Body() dto: CreateUserDto, @CurrentUser() currentUser: AuthUser) {
    return this.usersService.create(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll(
    @Query('role') role: string | undefined,
    @Query('consumerId') consumerId: string | undefined,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.usersService.findAll({ role, consumerId }, currentUser);
  }

  @Get(':id')
  @Roles('admin', 'object_manager')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.usersService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles('admin', 'object_manager')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.usersService.update(id, dto, currentUser);
  }

  @Delete(':id/permanent')
  @Roles('admin', 'object_manager')
  hardDelete(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.usersService.hardDelete(id, currentUser);
  }

  @Delete(':id')
  @Roles('admin', 'object_manager')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.usersService.remove(id, currentUser);
  }
}
