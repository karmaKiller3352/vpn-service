import { Module } from '@nestjs/common';
import { DatabaseModule } from 'src/database/database.module';
import { WireguardModule } from 'src/wireguard/wireguard.module';
import { MainController } from './main.controller';

import { MainService } from './main.service';

@Module({
  imports: [DatabaseModule, WireguardModule],
  providers: [MainService],
  controllers: [MainController],
  exports: [MainService]
})
export class MainModule {}
