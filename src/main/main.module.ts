import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { WireguardModule } from 'src/wireguard/wireguard.module';

import { MainService } from './main.service';
import { MainController } from './main.controller';

@Module({
  exports: [MainService],
  providers: [MainService],
  controllers: [MainController],
  imports: [DatabaseModule, WireguardModule],
})
export class MainModule {}
