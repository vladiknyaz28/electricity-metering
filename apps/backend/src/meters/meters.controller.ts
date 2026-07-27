import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
import { MetersService } from './meters.service';
import { CreateMeterDto } from './dto/create-meter.dto';
import { UpdateMeterDto } from './dto/update-meter.dto';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
  isSuperAdmin?: boolean;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('meters')
export class MetersController {
  constructor(private readonly metersService: MetersService) {}

  @Post()
  @Roles('admin', 'object_manager')
  create(@Body() dto: CreateMeterDto, @CurrentUser() currentUser: AuthUser) {
    this.assertCanSetMeterTariff(dto, currentUser);
    return this.metersService.create(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager', 'consumer')
  findAll(@CurrentUser() currentUser: AuthUser) {
    return this.metersService.findAllScoped(currentUser);
  }

  @Get(':id/minusovka')
  @Roles('admin', 'object_manager')
  getMinusovka(
    @Param('id') id: string,
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.metersService.getMinusovka(
      id,
      periodStart,
      periodEnd,
      currentUser,
    );
  }

  @Get(':id')
  @Roles('admin', 'object_manager', 'consumer')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.metersService.findOneScoped(id, currentUser);
  }

  @Patch(':id')
  @Roles('admin', 'object_manager')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateMeterDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    this.assertCanSetMeterTariff(dto, currentUser);
    return this.metersService.update(id, dto, currentUser);
  }

  @Delete(':id/permanent')
  @Roles('admin', 'object_manager')
  hardDelete(
    @Param('id') id: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.metersService.hardDelete(id, currentUser);
  }

  @Delete(':id')
  @Roles('admin', 'object_manager')
  remove(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.metersService.remove(id, currentUser);
  }

  /** Meter.tariffId — только isSuperAdmin (роль admin/manager не достаточна). */
  private assertCanSetMeterTariff(
    dto: { tariffId?: string | null },
    currentUser: AuthUser,
  ) {
    if (dto.tariffId === undefined) {
      return;
    }
    if (currentUser.isSuperAdmin === true) {
      return;
    }
    throw new ForbiddenException(
      'Изменение тарифа счётчика доступно только главному администратору',
    );
  }
}
