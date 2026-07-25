import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ObjectsService } from './objects.service';
import { CreateObjectDto } from './dto/create-object.dto';
import { UpdateObjectDto } from './dto/update-object.dto';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('objects')
export class ObjectsController {
  constructor(private readonly objectsService: ObjectsService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateObjectDto) {
    return this.objectsService.create(dto);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll(@CurrentUser() currentUser: AuthUser) {
    return this.objectsService.findAll(currentUser);
  }

  @Get(':id')
  @Roles('admin', 'object_manager')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.objectsService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateObjectDto) {
    return this.objectsService.update(id, dto);
  }

  @Delete(':id/permanent')
  @Roles('admin')
  hardDelete(@Param('id') id: string) {
    return this.objectsService.hardDelete(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.objectsService.remove(id);
  }
}
