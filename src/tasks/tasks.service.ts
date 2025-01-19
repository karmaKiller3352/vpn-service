import { Injectable } from '@nestjs/common';
import { Cron, CronExpression, Timeout } from '@nestjs/schedule';
import { MainService } from 'src/main/main.service';

@Injectable()
export class TasksService {
  constructor(private readonly mainService: MainService) {}

  @Timeout(0) // Немедленный запуск задачи при старте
  async handleExpiredSubscriptionsImmediately(): Promise<void> {
    console.log('[Scheduler] Task started immediately after app startup');
    await this.handleExpiredSubscriptions();
  }

  // @Cron(CronExpression.EVERY_HOUR) // Выполняется каждый час
  async handleExpiredSubscriptions(): Promise<void> { 
    console.log(`[Scheduler] Task started at ${new Date().toISOString()}`);
    await this.mainService.blockExpiredConfigs();
  }
}
