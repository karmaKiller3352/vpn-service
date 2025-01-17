import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MainModule } from 'src/main/main.module';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Инициализация планировщика
    MainModule,           // Импортируем модуль базы данных для работы с сервисами
  ],
  providers: [TasksService],
}) 
export class TasksModule {}
