import { AddTgUser } from './main.types';
import {
  Get,
  Post,
  Query,
  Controller,
  HttpStatus,
  HttpException,
  Body,
  Delete,
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

  @Post('request-tg-user-config')
  async requestTgUserConfig(@Body() user: AddTgUser) {
    return await this.service.requestTgUserConfig(user);
  }

  @Post('unblock-user')
  async unblockUser(
    @Query('days') additionalDays: number,
    @Query('userId') userId: number,
  ) {
    const {
      extendedSubscription,
      config: {
        id,
        user: { telegramId },
        clientAddress,
      },
    } = await this.service.updateSubscription({
      userId,
      additionalDays,
    });

    await this.wgService.unblockAccess(clientAddress);

    await this.service.createLog({
      userId: id,
      eventType: 'UNBLOCK IP',
      targetId: null,
      targetType: 'configs',
      details: {
        additionalDays,
        userTgId: telegramId,
        clientAddress: clientAddress,
        prolongationDate: new Date(),
        reason: 'subscription prolonged',
      },
    });

    return {
      endDate: extendedSubscription.endDate,
    };
  }

  @Delete('block-user')
  async blockUser(@Query('userId') userId: number) {
    const {
      extendedSubscription,
      config: {
        id,
        user: { telegramId },
        clientAddress,
      },
    } = await this.service.updateSubscription({
      userId,
      disableImmediately: true,
    });

    await this.wgService.blockAccess(clientAddress);

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
