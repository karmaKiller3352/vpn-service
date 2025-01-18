import { Log } from './entities/log.entity';
import { Subscription } from './entities/subscription.entity';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Config } from './entities/config.entity';
import { DatabaseService } from './database.service';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        username: process.env.DB_USERNAME || 'vpn_user',
        password: process.env.DB_PASSWORD || 'vpn_password',
        database: process.env.DB_NAME || 'vpn_database',
        autoLoadEntities: true, // Автоматическая загрузка сущностей
        synchronize: true,//process.env.NODE_ENV !== 'production', // Только для разработки,
        logging: true, // Включение логирования запросов
        // logger: 'advanced-console', // Логирование в консоль
      }),
    }),
    TypeOrmModule.forFeature([User, Subscription, Config, Log]), // Подключение сущностей
  ],
  exports: [DatabaseService, TypeOrmModule],
  providers: [DatabaseService], // Экспортируем для других модулей
})
export class DatabaseModule {}
