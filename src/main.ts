import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { logger } from './winston.logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 443);
}
bootstrap();
