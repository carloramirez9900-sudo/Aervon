import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ModelsModule } from '../database/models.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TelegramService } from './telegram.service';

@Module({
  imports: [ModelsModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, TelegramService],
  exports: [AuthService],
})
export class AuthModule {}
