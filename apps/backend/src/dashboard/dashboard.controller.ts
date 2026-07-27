import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';

type AuthUser = {
  id: string;
  role: string;
  consumerId?: string | null;
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @Roles('admin', 'object_manager', 'consumer', 'auditor')
  getSummary(
    @Query('periodStart') periodStart: string,
    @Query('periodEnd') periodEnd: string,
    @Query('objectId') objectId: string | undefined,
    @Query('resourceTypeId') resourceTypeId: string | undefined,
    @CurrentUser() currentUser: AuthUser,
  ) {
    return this.dashboardService.getSummary(
      {
        periodStart,
        periodEnd,
        objectId: objectId || undefined,
        resourceTypeId: resourceTypeId || undefined,
      },
      currentUser,
    );
  }
}
