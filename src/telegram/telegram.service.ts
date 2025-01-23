import * as fs from 'fs';
import * as path from 'path';
import * as ngrok from 'ngrok';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, NarrowedContext, Context, Markup } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';

import { MainService } from 'src/main/main.service';
import { WireGuardService } from 'src/wireguard/wireguard.service';

const getConfigurationMessage = (formattedDate: string) =>
  `*Ваша конфигурация готова!*\n\n` +
  `🔑 **Подписка активна до:** ${formattedDate} МСК (UTC+3).\n` +
  `1️⃣ Откройте приложение Wireguard и выберите «Добавить туннель».\n` +
  `2️⃣ **Сканируйте QR-код** в приложении WireGuard для автоматической настройки.\n` +
  `3️⃣ **Или воспользуйтесь [видеоинструкцией](https://youtube.com/shorts/QOjS6nbfVvk)** для ручного импорта \n\n` +
  `⚠️ **Важно**: После истечения срока подписки ваша конфигурация перестанет работать. Для продления нажмите кнопку "Продлить подписку". `;

const getFormattedDate = (expirationDate: string) =>
  new Date(expirationDate).toLocaleString('ru-RU', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

@Injectable()
export class TelegramService {
  public bot: Telegraf;
  private apiURL: string;
  private isDev: boolean;

  constructor(
    private configService: ConfigService,
    private mainService: MainService,
    private wgService: WireGuardService,
  ) {
    this.isDev = this.configService.get<string>('NODE_ENV') === 'development';
    this.apiURL = this.isDev
      ? this.configService.get<string>('DEV_API_URL')
      : this.configService.get<string>('PROD_API_URL');

    this.bot = new Telegraf(this.configService.get<string>('BOT_TOKEN'));
  }

  async onModuleInit() {
    await this.setupWebhook();
  }

  private async setupWebhook() {
    try {
      if (this.isDev) {
        // Запуск ngrok и получение публичного URL
        const ngrokUrl = await ngrok.connect({
          addr: '8443', // Порт, на котором работает NestJS
          region: 'us', // Регион ngrok (можно изменить),
          authtoken: this.configService.get<string>('NGROK_AUTHTOKEN'),
        });

        console.log(`🔗 NGROK URL: ${ngrokUrl}`);

        // Устанавливаем вебхук Telegram с публичным URL
        const webhookUrl = `${ngrokUrl}/api/tg-webhook`;
        await this.bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Вебхук установлен в development mode: ${webhookUrl}`);
      } else {
        const webhookUrl = `${this.apiURL}/api/tg-webhook`;
        await this.bot.telegram.setWebhook(webhookUrl);
        console.log(`✅ Вебхук установлен в production  mode: ${webhookUrl}`);
      }
    } catch (err) {
      console.error('❌ Ошибка установки вебхука через NGROK:', err);
    }

    await this.initializeBot();
  }

  private async initializeBot() {
    this.bot.start(async (ctx) => {
      console.log('Старт', ctx);
      const response =
        `Всё просто — следуйте этим шагам, чтобы подключиться:\n` +
        `1) **Установите WireGuard-клиент**:
  - 📱 [iOS](https://apps.apple.com/app/wireguard/id1441195209)
  - 🤖 [Android](https://play.google.com/store/apps/details?id=com.wireguard.android)
  - 💻 [Windows](https://www.wireguard.com/install/)
  - 🍎 [MacOS](https://www.wireguard.com/install/)\n` +
        `2) После установки нажмите кнопку \n*«Сгенерировать конфигурацию»*\n и получите дальнейшие инструкции\n\n` +
        `⚠️ *Важно*: Используйте только конфигурацию, которую вы получите через этого бота.`;

      await ctx.sendChatAction('typing'); // Отправить действие "печатает"
      await ctx.reply(
        '*Добро пожаловать в VPN-сервис!*',
        this.createKeyboardMenu(),
      );

      ctx.reply(response, {
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true },
        ...Markup.inlineKeyboard([
          Markup.button.callback(
            '🔧 Сгенерировать конфигурацию',
            'generate_config',
          ),
        ]),
      });
    });

    this.bot.action('generate_config', (ctx) => this.handleGenerateConfig(ctx));

    this.bot.telegram.setMyCommands([
      { command: 'request_config', description: '📄 Запросить конфиг' },
      { command: 'renew_subscription', description: '🔄 Продлить подписку' },
    ]);

    // 2 слушателя на запрос конфига
    this.bot.hears('📄 Запросить конфиг', (ctx) =>
      this.handleRequestConfig(ctx),
    );
    this.bot.command('request_config', (ctx) => this.handleRequestConfig(ctx));

    // 2 слушателя на продление подписки
    this.bot.command('renew_subscription', (ctx) =>
      this.renewSubscription(ctx),
    );
    this.bot.hears('🔄 Продлить подписку', (ctx) =>
      this.renewSubscription(ctx),
    );

    this.bot.action('pay_by_card', (ctx) => this.payWithYoMoney(ctx));

    this.bot.action('pay_by_stars', (ctx) => this.payWithStars(ctx));

    this.bot.on('pre_checkout_query', async (ctx) =>
      this.handlePreCheckout(ctx),
    );

    this.bot.on('successful_payment', async (ctx) => {
      let endDateGlobal;
      try {
        const { id: userId } = await this.mainService.getUserByTGId(
          ctx.from.id,
        );

        const {
          extendedSubscription: { endDate },
          config: {
            id,
            user: { telegramId },
            clientAddress,
          },
        } = await this.mainService.updateSubscription({
          userId,
          additionalDays: 30,
        });
        endDateGlobal = endDate;
        await this.wgService.unblockAccess(clientAddress);

        await this.mainService.createLog({
          userId: id,
          eventType: 'UNBLOCK IP',
          targetId: null,
          targetType: 'configs',
          details: {
            additionalDays: 30,
            userTgId: telegramId,
            clientAddress: clientAddress,
            prolongationDate: new Date(),
            reason: 'subscription prolonged',
            providerData: ctx.update.message.successful_payment,
          },
        });
      } catch (error) {
        console.log(error);
      } finally {
        ctx.reply(
          `🎉 Спасибо за оплату!` +
            ` ✨ Ваша подписка успешно продлена до *${getFormattedDate(endDateGlobal.toString())}*.\n` +
            ` 🔐 Теперь у вас полный доступ к нашему VPN-сервису.\n` +
            `🚀 Приятного пользования!\n`,
          {
            parse_mode: 'Markdown',
          },
        );
      }
    });
  }

  private async renewSubscription(ctx) {
    try {
      // Отправляем сообщение с выбором способа оплаты
      await ctx.reply(`*Продлить на 1 месяц:*\n`, {
        ...Markup.inlineKeyboard([
          [Markup.button.callback('Заплатить картой - 100 ₽', 'pay_by_card')],
          [Markup.button.callback('Telegram Stars - 1 ⭐', 'pay_by_stars')],
        ]),
        parse_mode: 'Markdown',
      });
    } catch (error) {
      console.error('Ошибка при отправке опций продления подписки:', error);
      ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  private async handlePreCheckout(
    ctx: NarrowedContext<Context<any>, Update.PreCheckoutQueryUpdate>,
  ) {
    await ctx.answerPreCheckoutQuery(true);
  }

  private createKeyboardMenu(): any {
    return {
      ...Markup.keyboard([
        ['🔄 Продлить подписку', '📄 Запросить конфиг'], // Две кнопки в одном ряду
      ])
        .resize() // Подгоняет клавиатуру под экран пользователя
        .oneTime(false),
      disable_web_page_preview: false,
      parse_mode: 'Markdown',
    };
  }

  private async handleGenerateConfig(ctx) {
    try {
      const userId = ctx.from.id;

      const { qrCode, configFilePath, expirationDate } =
        await this.mainService.addTGUser({ telegramId: userId });

      // Извлекаем только данные изображения (после "base64,")
      const base64Data = qrCode.split(',')[1];

      // Преобразуем Base64 строку в Buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Создание временного файла конфигурации
      const tempFilePath = path.join(__dirname, 'temp_config.conf');

      fs.writeFileSync(tempFilePath, configFilePath);

      await ctx.replyWithPhoto({ source: imageBuffer });
      await ctx.replyWithDocument({
        source: tempFilePath,
        filename: 'wireguard_config.conf',
      });
      ctx.answerCbQuery();

      await ctx.reply(
        getConfigurationMessage(getFormattedDate(expirationDate)),
        this.createKeyboardMenu(),
      );
    } catch (error) {
      console.error(
        'Ошибка при генерации конфигурации:',
        error.response?.message,
      );

      if (error.response?.statusCode === 409) {
        await ctx.reply(
          '❌ Для этого пользователя конфиг уже был создан ранее воспользуйтесь кнопкой \n«Запросить конфиг» в меню чтоб получить его снова.',
          this.createKeyboardMenu(),
        );
      }

      ctx.answerCbQuery();
    }
  }

  private async handleRequestConfig(ctx) {
    console.log('request', ctx);
    try {
      const { qrCode, configFilePath, expirationDate } =
        await this.mainService.requestTgUserConfig({
          telegramId: ctx.from.id,
        });

      // Извлекаем только данные изображения (после "base64,")
      const base64Data = qrCode.split(',')[1];

      // Преобразуем Base64 строку в Buffer
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Создание временного файла конфигурации
      const tempFilePath = path.join(__dirname, 'temp_config.conf');

      fs.writeFileSync(tempFilePath, configFilePath);

      await ctx.replyWithPhoto({ source: imageBuffer });
      await ctx.replyWithDocument({
        source: tempFilePath,
        filename: 'wireguard_config.conf',
      });

      // Отправляем сообщение
      await ctx.reply(
        getConfigurationMessage(getFormattedDate(expirationDate)),
        {
          disable_web_page_preview: false,
          parse_mode: 'Markdown',
        },
      );
    } catch (error) {
      console.error(
        'Ошибка при запросе конфигурации:',
        error.response?.data || error.message,
      );
      ctx.reply('❌ Не удалось получить конфигурацию. Попробуйте позже.');
    }
  }

  private async payWithYoMoney(ctx) {
    console.log('Заплатить с помощью YMoney', ctx);
    try {
      await ctx.sendInvoice({
        title: 'Оплата картой',
        description: 'Доступ к VPN на 1 месяц.',
        payload: 'vpn_subscription_1_month_ymoney',
        provider_token: this.configService.get<string>('YMONEY_PROVIDER_TOKEN'),
        currency: 'RUB',
        prices: [{ label: '1 месяц подписки', amount: 10000 }],
        start_parameter: 'get_access',
      });
    } catch (error) {
      console.error('Ошибка при отправке инвойса:', error);
      ctx.reply('❌ Не удалось создать инвойс. Попробуйте позже.');
    }
  }

  private async payWithStars(ctx) {
    try {
      await ctx.sendInvoice({
        title: 'Telegram Stars Payment',
        description: 'Доступ к VPN на 1 месяц.',
        payload: 'vpn_subscription_1_month_stars',
        currency: 'XTR',
        prices: [{ label: '1 месяц подписки', amount: 1 }],
        start_parameter: 'get_access',
      });
    } catch (error) {
      console.error('Ошибка при отправке инвойса:', error);
      ctx.reply('❌ Не удалось создать инвойс. Попробуйте позже.');
    }
  }
}
