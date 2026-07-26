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
import { ConsumerService } from './consumer.service';
import { CreateConsumerDto } from './dto/create-consumer.dto';
import { UpdateConsumerDto } from './dto/update-consumer.dto';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consumers')
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  @Post()
  @Roles('admin', 'object_manager')
  create(
    @Body() dto: CreateConsumerDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.consumerService.create(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll(@CurrentUser() currentUser: AuthUser) {
    return this.consumerService.findAll(currentUser);
  }

  @Get(':id')
  @Roles('admin', 'object_manager', 'consumer')
  findOne(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.consumerService.findOneForUser(id, currentUser);
  }

  @Patch(':id')
  @Roles('admin', 'object_manager')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateConsumerDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.consumerService.update(id, dto, currentUser);
  }

  @Delete(':id/permanent')
  @Roles('admin', 'object_manager')
  hardDelete(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.consumerService.hardDelete(id, currentUser);
  }

  @Delete(':id')
  @Roles('admin', 'object_manager')
  remove(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.consumerService.remove(id, currentUser);
  }
}
