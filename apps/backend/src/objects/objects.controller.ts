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
  @Roles('admin', 'object_manager')
  create(
    @Body() dto: CreateObjectDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.objectsService.create(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll(@CurrentUser() currentUser: AuthUser) {
    return this.objectsService.findAll(currentUser);
  }

  @Get(':id/minusovka')
  @Roles('admin', 'object_manager')
  getMinusovka(
    @Param('id') id: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.objectsService.getMinusovka(
      id,
      periodStart,
      periodEnd,
      currentUser,
    );
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
  @Roles('admin', 'object_manager')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateObjectDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.objectsService.update(id, dto, currentUser);
  }

  @Delete(':id/permanent')
  @Roles('admin')
  hardDelete(@Param('id') id: string) {
    return this.objectsService.hardDelete(id);
  }

  @Delete(':id')
  @Roles('admin', 'object_manager')
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.objectsService.remove(id, currentUser);
  }
}
