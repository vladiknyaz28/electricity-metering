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

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('consumers')
export class ConsumerController {
  constructor(private readonly consumerService: ConsumerService) {}

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateConsumerDto) {
    return this.consumerService.create(dto);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll(
    @CurrentUser()
    currentUser: { id: string; role: string; consumerId?: string | null },
  ) {
    return this.consumerService.findAll(currentUser);
  }

  @Get(':id')
  @Roles('admin', 'object_manager', 'consumer')
  findOne(
    @Param('id') id: string,
    @CurrentUser()
    currentUser: { id: string; role: string; consumerId?: string | null },
  ) {
    return this.consumerService.findOneForUser(id, currentUser);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateConsumerDto) {
    return this.consumerService.update(id, dto);
  }

  @Delete(':id/permanent')
  @Roles('admin')
  hardDelete(@Param('id') id: string) {
    return this.consumerService.hardDelete(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.consumerService.remove(id);
  }
}
