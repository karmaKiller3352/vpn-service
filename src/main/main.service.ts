import { DatabaseService } from './../database/database.service';
import { WireGuardService } from './../wireguard/wireguard.service';
import { AddTgUser, PeerInfo } from './main.types';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class MainService {
  constructor(
    private wgService: WireGuardService,
    private dbService: DatabaseService,
  ) {}

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

    const { qrCode, configFilePath, clientAddress, publicKey } =
      await this.wgService.addPeer(id);

    await this.dbService.createNewConfig({
      userId: id,
      clientAddress,
      publicKey,
      qrCode,
    });

    const { endDate, startDate } = await this.dbService.createSubscription(
      id,
      2,
    );

    return {
      qrCode,
      message: '',
      configFilePath,
      startDate: startDate.toString(),
      expirationDate: endDate.toString(),
    };
  }

  async extendSubscription(userId: number, days: number) {
    const extendedSubscription = await this.dbService.extendSubscription(
      userId,
      days,
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
          eventType: 'BLOCK IP_ERROR',
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
