import { Module } from '@nestjs/common';
import { ObjectsService } from './objects.service';
import { ObjectsController } from './objects.controller';

@Module({
  providers: [ObjectsService],
  controllers: [ObjectsController],
  exports: [ObjectsService],
})
export class ObjectsModule {}
