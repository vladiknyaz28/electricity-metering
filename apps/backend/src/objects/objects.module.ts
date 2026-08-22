import { Module } from '@nestjs/common';
import { ObjectsService } from './objects.service';
import { ObjectsController } from './objects.controller';
import { MetersModule } from '../meters/meters.module';
import { TrialLimitsService } from '../common/trial-limits.service';

@Module({
  imports: [MetersModule],
  providers: [ObjectsService, TrialLimitsService],
  controllers: [ObjectsController],
  exports: [ObjectsService],
})
export class ObjectsModule {}
