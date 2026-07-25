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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    UsersModule,
    AuthModule,
    ObjectsModule,
    ConsumerModule,
    MetersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
