import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { WireguardModule } from './wireguard/wireguard.module';
import { DatabaseModule } from './database/database.module';

import { MainModule } from './main/main.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WireguardModule,
    DatabaseModule,
    ConfigModule.forRoot({
      isGlobal: true, // Делает модуль доступным во всех других модулях
    }),
    MainModule,
    TasksModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
