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
    await this.unblockAccess(config.clientAddress);

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

  @Post('add')
  async addPeer() {}

  @Post('generate-keys')
  async generateKeys() {
    return await this.wgService.generateKeyPair();
  }

  // Блокировка доступа
  @Get('block')
  async blockAccess(@Query('ip') ip: string): Promise<{ message: string }> {
    if (!ip) {
      throw new HttpException('IP-адрес не указан', HttpStatus.BAD_REQUEST);
    }
    try {
      await this.wgService.blockAccess(ip);
      return { message: `Доступ для IP ${ip} успешно отключён.` };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        `Ошибка при отключении доступа для IP ${ip}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // Разблокировка доступа
  @Get('unblock')
  async unblockAccess(@Query('ip') ip: string): Promise<{ message: string }> {
    if (!ip) {
      throw new HttpException('IP-адрес не указан', HttpStatus.BAD_REQUEST);
    }
    try {
      await this.wgService.unblockAccess(ip);
      return { message: `Доступ для IP ${ip} успешно включён.` };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        `Ошибка при включении доступа для IP ${ip}: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('block-expired-configs')
  async blockExpiredConfigs() {
    return await this.service.blockExpiredConfigs();
  }
}
