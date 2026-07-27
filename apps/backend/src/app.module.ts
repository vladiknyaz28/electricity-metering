import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { ObjectsModule } from './objects/objects.module';
import { ConsumerModule } from './consumer/consumer.module';
import { MetersModule } from './meters/meters.module';
import { ReadingsModule } from './readings/readings.module';
import { TariffsModule } from './tariffs/tariffs.module';
import { ChargesModule } from './charges/charges.module';
import { ResourceTypesModule } from './resource-types/resource-types.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ObjectsModule,
    ConsumerModule,
    MetersModule,
    ReadingsModule,
    TariffsModule,
    ChargesModule,
    ResourceTypesModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
