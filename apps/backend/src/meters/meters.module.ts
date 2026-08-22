import { Module } from '@nestjs/common';
import { MetersService } from './meters.service';
import { MetersController } from './meters.controller';
import { TrialLimitsService } from '../common/trial-limits.service';

@Module({
  providers: [MetersService, TrialLimitsService],
  controllers: [MetersController],
  exports: [MetersService],
})
export class MetersModule {}
