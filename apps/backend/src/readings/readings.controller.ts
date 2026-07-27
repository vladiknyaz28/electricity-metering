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
import { ReadingsService } from './readings.service';
import { CreateReadingDto } from './dto/create-reading.dto';
import { UpdateReadingDto } from './dto/update-reading.dto';

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
  @Roles('admin', 'object_manager')
  create(@Body() dto: CreateReadingDto, @CurrentUser() currentUser: AuthUser) {
    return this.readingsService.create(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager', 'consumer')
  findAll(
    @Query('meterId') meterId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.readingsService.findAllByMeter(meterId, currentUser);
  }

  /** @deprecated используйте GET /readings?meterId= */
  @Get('meter/:meterId')
  @Roles('admin', 'object_manager', 'consumer')
  findAllByMeter(
    @Param('meterId') meterId: string,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.readingsService.findAllByMeter(meterId, currentUser);
  }

  @Patch(':id')
  @Roles('admin', 'object_manager')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReadingDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.readingsService.update(id, dto, currentUser);
  }

  @Delete(':id')
  @Roles('admin', 'object_manager')
  remove(
    @Param('id') id: string,
    @Query('force') force: string | undefined,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.readingsService.remove(
      id,
      currentUser,
      force === 'true' || force === '1',
    );
  }
}
