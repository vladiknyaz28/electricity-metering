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
import { TariffsService } from './tariffs.service';
import { CreateTariffDto } from './dto/create-tariff.dto';
import { UpdateTariffDto } from './dto/update-tariff.dto';
import { NewTariffVersionDto } from './dto/new-tariff-version.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('tariffs')
export class TariffsController {
  constructor(private readonly tariffsService: TariffsService) {}

  @Post()
  create(@Body() dto: CreateTariffDto) {
    return this.tariffsService.create(dto);
  }

  @Get('families')
  @Roles('admin', 'object_manager')
  findFamilies() {
    return this.tariffsService.findFamilies();
  }

  @Delete('families/:familyId')
  removeFamily(@Param('familyId') familyId: string) {
    return this.tariffsService.removeFamily(familyId);
  }

  @Get()
  @Roles('admin', 'object_manager')
  findAll() {
    return this.tariffsService.findAll();
  }

  @Get(':familyId/history')
  @Roles('admin', 'object_manager')
  findHistory(@Param('familyId') familyId: string) {
    return this.tariffsService.findHistory(familyId);
  }

  @Post(':familyId/new-version')
  createNewVersion(
    @Param('familyId') familyId: string,
    @Body() dto: NewTariffVersionDto,
  ) {
    return this.tariffsService.createNewVersion(familyId, dto);
  }

  @Get(':id')
  @Roles('admin', 'object_manager')
  findOne(@Param('id') id: string) {
    return this.tariffsService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTariffDto) {
    return this.tariffsService.update(id, dto);
  }

  @Patch(':id/assign/:consumerId')
  assignToConsumer(
    @Param('id') id: string,
    @Param('consumerId') consumerId: string,
  ) {
    return this.tariffsService.assignToConsumer(consumerId, id);
  }
}
