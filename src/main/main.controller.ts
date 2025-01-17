import { AddTgUser } from './main.types';
import {
  Get,
  Post,
  Query,
  Controller,
  HttpStatus,
  HttpException,
  Body,
} from '@nestjs/common';
import { MainService } from './main.service';
import { WireGuardService } from 'src/wireguard/wireguard.service';

@Controller('api')
export class MainController {
  constructor(
    private readonly service: MainService,
    private readonly wgService: WireGuardService,
  ) {}

  @Get('status')
  async getStatus() {
    return await this.wgService.getStatus();
  }

  @Post('add-tg-user')
  async addTGUser(@Body() user: AddTgUser) {
    return await this.service.addTGUser(user);
  }

  @Post('extend-subscription')
  async extendSubscription(
    @Query('days') days: number,
    @Query('userId') userId: number,
  ) {
    const { extendedSubscription, config } =
      await this.service.extendSubscription(userId, days);
    const {
      clientAddress,
      user: { id, telegramId },
    } = config;
    await this.wgService.unblockAccess(config.clientAddress);

    await this.service.createLog({
      userId: id,
      eventType: 'BLOCK IP',
      targetId: null,
      targetType: 'configs',
      details: {
        userTgId: telegramId,
        clientAddress: clientAddress,
        blockingDate: new Date(),
        reason: 'subscription expired',
      },
    });

    return {
      endDate: extendedSubscription.endDate,
    };
  }

  @Post('block-expired-configs')
  async blockExpiredConfigs() {
    return await this.service.blockExpiredConfigs();
  }
}
