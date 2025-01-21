import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { MainModule } from 'src/main/main.module';
import { WireguardModule } from 'src/wireguard/wireguard.module';

import { TelegramService } from './telegram.service';
import { TelegramController } from './telegram.controller';

@Module({
  providers: [TelegramService],
  controllers: [TelegramController],
  imports: [WireguardModule, ConfigModule, MainModule],
})
export class TelegramModule {}
