import { Module } from '@nestjs/common';
import { MetersModule } from '../meters/meters.module';
import { TariffsModule } from '../tariffs/tariffs.module';
import { ReadingsService } from './readings.service';
import { ReadingsController } from './readings.controller';

@Module({
  imports: [MetersModule, TariffsModule],
  providers: [ReadingsService],
  controllers: [ReadingsController],
  exports: [ReadingsService],
})
export class ReadingsModule {}
