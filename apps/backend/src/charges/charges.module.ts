import { Module } from '@nestjs/common';
import { MetersModule } from '../meters/meters.module';
import { ChargesService } from './charges.service';
import { ChargesController } from './charges.controller';

@Module({
  imports: [MetersModule],
  providers: [ChargesService],
  controllers: [ChargesController],
  exports: [ChargesService],
})
export class ChargesModule {}
