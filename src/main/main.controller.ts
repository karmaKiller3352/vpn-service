import { AddTgUser } from './main.types';
import {
  Get,
  Post,
  Query,
  Controller,
  Body,
  Delete,
  HttpCode,
} from '@nestjs/common';
import { MainService } from './main.service';
import { WireGuardService } from 'src/wireguard/wireguard.service';
import { Telegraf } from 'telegraf';

const bot = new Telegraf('7909061014:AAEnsyLCcGSSsMmccrqh86GkNSD-AggZdqM');

bot.hears('🔄 Продлить подписку', async (ctx) => {
  try {
    const res = await ctx.sendInvoice({
      title: 'Подписка на VPN',
      description: 'Доступ к VPN-сервису на 1 месяц.',
      payload: 'vpn_subscription_1_month', // Уникальный идентификатор заказа
      provider_token: '381764678:TEST:108590', // Токен провайдера
      currency: 'RUB', // Российский рубль

      prices: [
        { label: '1 месяц подписки', amount: 10000 }, // Цена в копейках (100.00 RUB)
      ],

      start_parameter: 'get_access', // Параметр для автоматического открытия счета
    });
  } catch (error) {
    console.error('Ошибка при отправке инвойса:', error);
    ctx.reply('❌ Не удалось создать инвойс. Попробуйте позже.');
  }
});
bot.on("pre_checkout_query", async (ctx) => {
  try {
    console.log("Получен pre_checkout_query:", ctx.update.pre_checkout_query);

    // Подтверждаем платёж (true - подтвердить, false - отклонить)
    await ctx.answerPreCheckoutQuery(true);

    console.log("Платёж подтверждён.");
  } catch (error) {
    console.error("Ошибка при подтверждении платежа:", error);

    // Если возникла ошибка, отклоняем платёж
    await ctx.answerPreCheckoutQuery(false, "Ошибка обработки платежа");
  }
});

@Controller()
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

  @Post('tg-webhook')
  @HttpCode(200)
  async tgWebHook(@Body() update) {
    try {
      // Обработка обновления через Telegraf
      await bot.handleUpdate(update);
      console.log('Получен и обработан вебхук от Telegram:', update);

      return { status: 'ok', update };
    } catch (error) {
      console.error('Ошибка при обработке вебхука:', error);
      return { success: false };
    }
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
