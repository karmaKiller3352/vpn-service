import { ConflictException, Injectable } from '@nestjs/common';

import { DatabaseService } from 'src/database/database.service';
import { WireGuardService } from 'src/wireguard/wireguard.service';

import { AddTgUser, PeerInfo, ConfigServiceType } from './main.types';

@Injectable()
export class MainService {
  constructor(
    private wgService: WireGuardService,
    private dbService: DatabaseService,
  ) {}

  async requestTgUserConfig(user: AddTgUser): Promise<PeerInfo> {
    const { telegramId } = user;
    const { id } = await this.dbService.addUser(telegramId);
    const config = await this.wgService.getUserConfig(id);

    const { startDate, endDate } =
      await this.dbService.getSubscriptionByUserId(id);

    const qrCode = await this.wgService.generateQRCode(config);

    return {
      qrCode,
      configFilePath: config,
      startDate: startDate.toString(),
      expirationDate: endDate.toString(),
    };
  }

  async addHiddenUser(id: number) {
    const { qrCode, configFilePath } = await this.wgService.addPeer(id);

    return {
      qrCode,
      message: '',
      configFilePath,
    };
  }

  async addTGUser(user: AddTgUser): Promise<PeerInfo> {
    const { telegramId } = user;

    const { id } = await this.dbService.addUser(telegramId);

    const configExists = await this.dbService.checkIfConfigForUserExists(id);
    const subscriptionExists =
      await this.dbService.checkIfSubscriptionForUserExists(id);

    if (subscriptionExists) {
      throw new ConflictException(
        `Subscription for user with id = ${telegramId} already exists`,
      );
    }

    if (configExists) {
      throw new ConflictException(
        `Config for user with id = ${telegramId} already exists, use re-generate to update the config`,
      );
    }

    // TO DO: Extend for using other vpn services
    const { qrCode, configFilePath, clientAddress, publicKey } =
      user.configServiceType === 'wireguard'
        ? await this.wgService.addPeer(id)
        : { qrCode: '', configFilePath: '', clientAddress: '', publicKey: '' };

    await this.dbService.createNewConfig({
      userId: id,
      clientAddress,
      publicKey,
      qrCode,
    });

    const { endDate, startDate } = await this.dbService.createSubscription(
      id,
      1,
    );

    return {
      qrCode,
      message: '',
      configFilePath,
      startDate: startDate.toString(),
      expirationDate: endDate.toString(),
    };
  }

  async updateSubscription(
    {
      userId,
      disableImmediately,
      additionalDays,
    }: {
      userId: number;
      disableImmediately?: boolean; // Отключить сразу
      additionalDays?: number;
    }, // Количество дополнительных дней}
  ) {
    const extendedSubscription = await this.dbService.updateSubscriptionEndDate(
      { userId, disableImmediately, additionalDays },
    );
    const config = await this.dbService.getConfigByUserId(userId);
    return { extendedSubscription, config };
  }

  async blockExpiredConfigs() {
    const configs = await this.dbService.getExpiredConfigs();
    const blockedUsers = [];

    for (const config of configs) {
      const {
        user: { id, telegramId },
        clientAddress,
      } = config;
      try {
        await this.wgService.blockAccess(clientAddress);

        await this.dbService.createLog({
          userId: id,
          eventType: 'BLOCK IP - SCHEDULER',
          targetId: null,
          targetType: 'configs',
          details: {
            userTgId: telegramId,
            clientAddress: clientAddress,
            blockingDate: new Date(),
            reason: 'subscription expired',
          },
        });

        blockedUsers.push({ userId: id, telegramId, clientAddress });
      } catch (error) {
        await this.dbService.createLog({
          userId: id,
          eventType: 'BLOCK IP - SCHEDULER ERROR',
          targetId: null,
          targetType: 'configs',
          details: {
            error,
          },
        });
      }
    }

    return blockedUsers;
  }

  async getUserByTGId(telegramId: number) {
    return await this.dbService.getUserByTGId(telegramId);
  }

  async createLog(props: {
    userId: number;
    eventType: string;
    targetId: number | null;
    targetType: string | null;
    details: Record<string, any> | null;
  }) {
    await this.dbService.createLog(props);
  }
}
