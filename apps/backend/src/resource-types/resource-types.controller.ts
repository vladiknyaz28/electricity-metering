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
import { ResourceTypesService } from './resource-types.service';
import {
  CreateResourceTypeDto,
  UpdateResourceTypeDto,
} from './dto/resource-type.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('resource-types')
export class ResourceTypesController {
  constructor(private readonly resourceTypesService: ResourceTypesService) {}

  @Get()
  @Roles('admin', 'object_manager', 'consumer', 'auditor')
  findAll() {
    return this.resourceTypesService.findAll();
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateResourceTypeDto) {
    return this.resourceTypesService.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateResourceTypeDto) {
    return this.resourceTypesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.resourceTypesService.remove(id);
  }
}
