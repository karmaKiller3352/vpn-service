import { Module } from '@nestjs/common';
import { WireGuardService } from './wireguard.service';

@Module({
  exports: [WireGuardService],
  providers: [WireGuardService],
})
export class WireguardModule {}
