import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { Config } from './entities/config.entity';
import { Log } from './entities/log.entity';
import { Subscription } from './entities/subscription.entity';
import { User } from './entities/user.entity';

@Injectable()
export class DatabaseService {
  constructor(
    @InjectRepository(Log)
    private readonly logRepository: Repository<Log>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>, // Репозиторий для работы с пользователями
    @InjectRepository(Config)
    private readonly configRepository: Repository<Config>, // Репозиторий для конфигов
  ) {}

  // Метод для добавления пользователя
  async addUser(telegramId: number): Promise<User> {
    // Проверяем, существует ли пользователь
    let user = await this.userRepository.findOneBy({ telegramId });
    if (user) {
      return user; // Если пользователь уже существует, возвращаем его
    }

    // Если пользователя нет, создаём его
    user = await this.userRepository.save(
      this.userRepository.create({ telegramId }),
    );

    await this.createLog({
      userId: user.id,
      eventType: 'USER_CREATION',
      targetId: telegramId,
      targetType: 'users',
      details: {
        telegramId,
        userId: user.id,
        source: user.source,
      },
    });
    return user; // Сохраняем пользователя и возвращаем его
  }

  // Пример метода для получения всех пользователей
  async getAllUsers(): Promise<User[]> {
    return this.userRepository.find();
  }

  async checkIfConfigForUserExists(userId: number) {
    const existingConfig = await this.configRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'], // Загружаем связь явно
    });

    if (existingConfig) return true;

    return false;
  }

  async getConfigByUserId(userId: number): Promise<Config | null> {
    return this.configRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'], // Загружаем связь с user
    });
  }

  async createNewConfig({
    userId,
    qrCode,
    clientAddress,
    publicKey,
  }: {
    userId: number;
    clientAddress: string;
    publicKey: string;
    qrCode: string | null;
  }): Promise<Config> {
    // Проверяем, существует ли пользователь
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // Создаём новый конфиг
    const config = this.configRepository.create({
      user,
      clientAddress,
      publicKey,
      qrCode,
    });

    return this.configRepository.save(config);
  }

  async checkIfSubscriptionForUserExists(userId: number) {
    const existingSubscription = await this.subscriptionRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (existingSubscription) return true;

    return false;
  }

  async createSubscription(
    userId: number,
    durationDays: number,
  ): Promise<Subscription> {
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    const now = new Date();
    const endDate = new Date(now);
    endDate.setDate(now.getDate() + durationDays); // Добавляем дни к текущей дате

    const subscription = this.subscriptionRepository.create({
      user,
      startDate: now,
      endDate,
      isActive: false, // Активируем подписку
    });

    await this.createLog({
      userId,
      eventType: 'SUBSCRIPTION_CREATED',
      targetId: subscription.id,
      targetType: 'subscriptions',
      details: {
        durationDays,
        startDate: now,
        endDate,
      },
    });

    return this.subscriptionRepository.save(subscription);
  }

  async updateSubscriptionEndDate(
    {
      userId,
      disableImmediately,
      additionalDays,
    }: {
      userId: number;
      disableImmediately?: boolean; // Отключить сразу
      additionalDays?: number;
    }, // Количество дополнительных дней}
  ): Promise<Subscription> {
    // Проверяем, существует ли пользователь
    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found.`);
    }

    // Проверяем, существует ли подписка для пользователя
    const subscription = await this.subscriptionRepository.findOne({
      where: { user: { id: userId } },
      relations: ['user'],
    });

    if (!subscription) {
      throw new NotFoundException(
        `No active subscription found for user ID ${userId}.`,
      );
    }

    const oldEndDate = subscription.endDate;

    // Если параметр disableImmediately передан, устанавливаем endDate на текущую дату
    if (disableImmediately) {
      subscription.endDate = new Date();
    }

    // Если передано количество дополнительных дней, добавляем их к текущему endDate
    if (additionalDays) {
      subscription.endDate = new Date(
        subscription.endDate.getTime() + additionalDays * 24 * 60 * 60 * 1000,
      );
    }

    // Логируем изменения
    await this.createLog({
      userId,
      eventType: 'SUBSCRIPTION_UPDATED',
      targetId: subscription.id,
      targetType: 'subscriptions',
      details: {
        oldEndDate,
        newEndDate: subscription.endDate,
        additionalDays,
        disableImmediately,
      },
    });

    // Сохраняем обновленную подписку
    return this.subscriptionRepository.save(subscription);
  }

  async getExpiredConfigs(): Promise<Config[]> {
    const now = new Date();

    // Получаем все истёкшие подписки с их конфигами
    const expiredSubscriptions = await this.subscriptionRepository.find({
      where: { endDate: LessThan(now) },
      relations: ['user'], // Загружаем пользователя для связи с конфигом
    });

    // Собираем все конфиги, связанные с истёкшими подписками
    const expiredConfigs: Config[] = [];
    for (const subscription of expiredSubscriptions) {
      const config = await this.configRepository.findOne({
        where: { user: { id: subscription.user.id } },
        relations: ['user'],
      });

      if (config) {
        expiredConfigs.push(config);
      }
    }

    return expiredConfigs;
  }

  async createLog({
    userId,
    eventType,
    targetId,
    targetType,
    details,
  }: {
    userId: number;
    eventType: string;
    targetId: number | null;
    targetType: string | null;
    details: Record<string, any> | null;
  }): Promise<Log> {
    const log = this.logRepository.create({
      user: { id: userId }, // Ссылка на пользователя
      eventType,
      targetId,
      targetType,
      details,
    });
    return this.logRepository.save(log);
  }
}
