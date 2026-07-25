import {
  Body,
  Controller,
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
import { ChargesService } from './charges.service';
import { CreateChargeDto } from './dto/create-charge.dto';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('charges')
export class ChargesController {
  constructor(private readonly chargesService: ChargesService) {}

  @Post('calculate')
  @Roles('admin', 'object_manager')
  calculate(
    @Body() dto: CreateChargeDto,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.chargesService.calculate(dto, currentUser);
  }

  @Get()
  @Roles('admin', 'object_manager', 'consumer')
  findAll(@CurrentUser() currentUser: AuthUser) {
    return this.chargesService.findAllScoped(currentUser);
  }

  @Get(':id')
  @Roles('admin', 'object_manager', 'consumer')
  findOne(@Param('id') id: string, @CurrentUser() currentUser: AuthUser) {
    return this.chargesService.findOneScoped(id, currentUser);
  }

  @Patch(':id/confirm')
  @Roles('admin')
  confirm(@Param('id') id: string) {
    return this.chargesService.confirm(id);
  }
}
