// telegram-bot.controller.ts
import { Controller, Post, Req } from '@nestjs/common';

import { TelegramService } from './telegram.service';

@Controller('tg-webhook')
export class TelegramController {
  constructor(private botService: TelegramService) {}

  @Post()
  async handleWebhook(@Req() req) {
    await this.botService.bot.handleUpdate(req.body);
  }
}
