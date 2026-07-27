import { Module } from '@nestjs/common';
import { ResourceTypesService } from './resource-types.service';
import { ResourceTypesController } from './resource-types.controller';

@Module({
  providers: [ResourceTypesService],
  controllers: [ResourceTypesController],
  exports: [ResourceTypesService],
})
export class ResourceTypesModule {}
