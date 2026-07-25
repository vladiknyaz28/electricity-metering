import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReadingsService } from './readings.service';
import { CreateReadingDto } from './dto/create-reading.dto';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('readings')
export class ReadingsController {
  constructor(private readonly readingsService: ReadingsService) {}

  @Post()
  @Roles('admin', 'object_manager', 'consumer')
  create(@Body() dto: CreateReadingDto, @CurrentUser() currentUser: AuthUser) {
    return this.readingsService.create(dto, currentUser);
  }

  @Get('meter/:meterId')
  @Roles('admin', 'object_manager', 'consumer')
  findAllByMeter(
    @Param('meterId') meterId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.readingsService.findAllByMeter(meterId, currentUser);
  }
}
