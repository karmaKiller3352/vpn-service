import { Module } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { ScheduleModule } from '@nestjs/schedule';
import { MainModule } from 'src/main/main.module';
import { DatabaseModule } from 'src/database/database.module';
import { TelegramModule } from 'src/telegram/telegram.module'; 

@Module({
  imports: [
    ScheduleModule.forRoot(), // Инициализация планировщика
    MainModule, // Импортируем модуль базы данных для работы с сервисами
    DatabaseModule,
    TelegramModule,
  ],
  providers: [TasksService],
})
export class TasksModule {}
