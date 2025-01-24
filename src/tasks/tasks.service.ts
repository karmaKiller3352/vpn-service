import { Injectable } from '@nestjs/common';
import { MainService } from 'src/main/main.service';
import { DatabaseService } from 'src/database/database.service';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { TelegramService } from 'src/telegram/telegram.service';

@Injectable()
export class TasksService {
  constructor(
    private readonly mainService: MainService,
    private readonly dbService: DatabaseService,
    private readonly tgService: TelegramService,
  ) {}

  @Timeout(0) // Немедленный запуск задачи при старте
  async handleExpiredSubscriptionsImmediately(): Promise<void> {
    console.log('[Scheduler] Task started immediately after app startup');
    await this.mainService.blockExpiredConfigs();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT) // Запуск ежедневно в полночь
  async notifyExpiringSubscriptions(): Promise<void> {
    const expiringSubscriptions =
      await this.dbService.findExpiringSubscriptions();

    const sendingMessages = expiringSubscriptions.map(
      async ({ user: { telegramId }, endDate }) =>
        telegramId &&
        this.tgService.sendSubscriptionReminder(telegramId, endDate),
    );

    await Promise.allSettled(sendingMessages);
  }
}
