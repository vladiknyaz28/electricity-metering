import { Module } from '@nestjs/common';
import { MetersModule } from '../meters/meters.module';
import { TariffsModule } from '../tariffs/tariffs.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [MetersModule, TariffsModule],
  providers: [DashboardService],
  controllers: [DashboardController],
  exports: [DashboardService],
})
export class DashboardModule {}
