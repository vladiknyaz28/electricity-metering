import { Module } from '@nestjs/common';
import { ObjectsService } from './objects.service';
import { ObjectsController } from './objects.controller';
import { MetersModule } from '../meters/meters.module';

@Module({
  imports: [MetersModule],
  providers: [ObjectsService],
  controllers: [ObjectsController],
  exports: [ObjectsService],
})
export class ObjectsModule {}
