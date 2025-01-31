import { Client } from 'ssh2';
import * as QRCode from 'qrcode';
import { exec } from 'child_process';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WireGuardService {
  private readonly configPath =
    process.env.WIREGUARD_CONFIG_PATH || '/etc/wireguard/client-configs/';

  constructor(private readonly configService: ConfigService) {
    console.log(`${this.environment} mode`);
    if (!this.configPath) {
      throw new Error('WIREGUARD_CONFIG_PATH is undefined or empty.');
    }
  }
  private readonly environment = process.env.ENVIRONMENT || 'production';

  private serverPublicKey: string = '';

  // Имя контейнера с WireGuard
  private readonly wireguardContainer = 'wireguard';
  private readonly interface = process.env.WIREGUARD_INTERFACE || 'wg0';

  // Универсальное выполнение команды
  private async executeCommand(command: string): Promise<string> {
    if (this.environment === 'development') {
      return this.executeSshCommand(command); // Используем SSH в режиме разработки
    } else {
      return this.executeDockerCommand(command); // Используем Docker локально в продакшене
    }
  }

  // Выполнение команды внутри Docker-контейнера через SSH
  private executeSshCommand(command: string): Promise<string> {
    // Конфигурация SSH
    const sshConfig = {
      host: process.env.SSH_HOST,
      port: 22,
      username: process.env.SSH_USER,
      privateKey: require('fs').readFileSync(process.env.SSH_KEY_PATH),
    };
    const dockerCommand = `docker exec ${this.wireguardContainer} ${command}`;

    return new Promise((resolve, reject) => {
      const conn = new Client();

      conn
        .on('ready', () => {
          conn.exec(dockerCommand, (err, stream) => {
            if (err) {
              reject(err.message);
              return;
            }

            let output = '';
            stream
              .on('close', () => {
                conn.end();
                resolve(output);
              })
              .on('data', (data) => {
                output += data.toString();
              })
              .stderr.on('data', (data) => {
                reject(data.toString());
              });
          });
        })
        .on('error', (err) => reject(err.message))
        .connect(sshConfig);
    });
  }

  // Выполнение команды локально внутри Docker-контейнера
  private executeDockerCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const dockerCommand = `docker exec ${this.wireguardContainer} ${command}`;
      exec(dockerCommand, (error, stdout, stderr) => {
        if (error) {
          reject(error.message);
          return;
        }
        resolve(stdout || stderr);
      });
    });
  }

  // Методы WireGuard
  async getStatus(): Promise<string> {
    const command = `wg show ${this.interface}`;
    return this.executeCommand(command);
  }

  // Генерация пары ключей (privateKey и publicKey)
  async generateKeyPair(): Promise<{ privateKey: string; publicKey: string }> {
    // Генерируем приватный ключ
    const privateKey = (await this.executeCommand('wg genkey')).trim();

    // Генерируем публичный ключ на основе приватного
    const publicKey = (
      await this.executeCommand(`bash -c "echo '${privateKey}' | wg pubkey"`)
    ).trim();

    return { privateKey, publicKey };
  }

  async getServerPublicKey() {
    if (!this.serverPublicKey) {
      const key = (
        await this.executeCommand(`wg show ${this.interface} public-key`)
      ).trim();
      return key;
    }

    return this.serverPublicKey;
  }

  async generateClientConfig({
    privateKey,
    clientAddress,
  }: {
    privateKey: string;
    clientAddress: string;
  }) {
    const vpnHost = this.configService.get<string>('VPN_HOST');
    const serverPublicKey = await this.getServerPublicKey();

    return `
    [Interface]
    PrivateKey = ${privateKey}
    Address = ${clientAddress}
    DNS = 8.8.8.8
    
    [Peer]
    PublicKey = ${serverPublicKey}
    Endpoint = ${vpnHost}
    AllowedIPs = 0.0.0.0/0,::/0
    `;
  }

  async createConfigFile(config: string, userId: number) {
    const clientConfigFileName = `peer-${userId}.conf`;

    const clientConfigPath = this.configPath + clientConfigFileName;

    // Сохраняем конфигурацию клиента в файл
    await this.executeCommand(
      `bash -c "echo '${config}' > ${clientConfigPath}"`,
    );

    return config;
  }

  async generateQRCode(config: string) {
    return await QRCode.toDataURL(config);
  }

  async addPeerToServerConfig({
    publicKey,
    clientAddress,
  }: {
    publicKey: string;
    clientAddress: string;
  }) {
    // Обновление файла конфигурации wg0.conf
    const peerConfig = `
  [Peer]
  PublicKey = ${publicKey}
  AllowedIPs = ${clientAddress}
  `;

    await this.executeCommand(
      `bash -c "echo '${peerConfig}' >> /etc/wireguard/${this.interface}.conf"`,
    );
  }

  async addIpRoute(clientAddress: string) {
    try {
      // Добавление маршрута
      await this.executeCommand(
        `ip route add ${clientAddress} dev ${this.interface}`,
      );
    } catch (error) {
      console.log(error);
    }
  }

  async removeIpRoute(clientAddress: string) {
    try {
      // Удаление маршрута
      await this.executeCommand(
        `ip route del ${clientAddress} dev ${this.interface} || true`,
      );
    } catch (error) {
      console.log(error);
    }
  }

  async getUserConfig(userId: number) {
    const clientConfigFileName = `peer-${userId}.conf`;

    const clientConfigPath = this.configPath + clientConfigFileName;

    const fileContent = await this.executeCommand(`cat ${clientConfigPath}`);

    return fileContent;
  }

  async addPeer(userId: number) {
    const { privateKey, publicKey } = await this.generateKeyPair();

    const clientAddress = await this.getNextAvailableAddress();

    await this.executeCommand(
      `wg set ${this.interface} peer ${publicKey} allowed-ips ${clientAddress}`,
    );

    await this.addPeerToServerConfig({ publicKey, clientAddress });

    const clientConfig = await this.generateClientConfig({
      privateKey,
      clientAddress,
    });

    await this.addIpRoute(clientAddress);

    const configFilePath = await this.createConfigFile(clientConfig, userId);

    const qrCode = await this.generateQRCode(clientConfig);

    // Возвращаем путь к конфигу и QR-код
    return {
      qrCode,
      publicKey,
      clientAddress,
      configFilePath,
    };
  }

  async getNextAvailableAddress(): Promise<string> {
    const subnet = '/32'; // Индивидуальный IP
    const startOctet3 = 8; // 172.30.8.X
    const endOctet3 = 11; // 172.30.11.X
    const start = 1; // Начинаем с 172.30.8.1
    const end = 254; // До 172.30.X.254

    // Получаем список уже занятых адресов
    const result = await this.executeCommand(
      `wg show ${this.interface} allowed-ips`,
    );

    const usedAddresses = result
      .split('\n')
      .map((line) => line.split('\t')[1]) // Извлекаем IP-адрес
      .filter(Boolean)
      .map((ip) => ip.split('/')[0]) // Убираем маску подсети
      .filter(
        (ip) =>
          ip.startsWith('172.30.8.') ||
          ip.startsWith('172.30.9.') ||
          ip.startsWith('172.30.10.') ||
          ip.startsWith('172.30.11.'),
      ); // Проверяем только наш диапазон

    // Перебираем IP в нужном диапазоне
    for (let octet3 = startOctet3; octet3 <= endOctet3; octet3++) {
      for (let octet4 = start; octet4 <= end; octet4++) {
        const candidate = `172.30.${octet3}.${octet4}`;
        if (!usedAddresses.includes(candidate)) {
          return `${candidate}${subnet}`;
        }
      }
    }

    throw new Error(
      'No available IP addresses in the range 172.30.8.1 - 172.30.11.254',
    );
  }

  async removePeer(publicKey: string): Promise<void> {
    const command = `wg set ${this.interface} peer ${publicKey} remove`;
    await this.executeCommand(command);
  }

  async blockAccess(ipAddress: string): Promise<void> {
    // 1. Блокировка трафика через iptables
    await this.executeCommand(
      `iptables -A FORWARD -i ${this.interface} -s ${ipAddress} -j DROP`,
    );
    await this.executeCommand(
      `iptables -A FORWARD -o ${this.interface} -d ${ipAddress} -j DROP`,
    );

    try {
      // 2. Удаление маршрута
      await this.executeCommand(
        `ip route del ${ipAddress} dev ${this.interface} || true`,
      );
    } catch (error) {
      console.log('error');
    }

    console.log(`Доступ для IP ${ipAddress} успешно отключён.`);
  }

  async unblockAccess(ipAddress: string): Promise<void> {
    try {
      // Удаление правил iptables
      await this.executeCommand(
        `iptables -D FORWARD -i ${this.interface} -s ${ipAddress} -j DROP || true`,
      );
      await this.executeCommand(
        `iptables -D FORWARD -o ${this.interface} -d ${ipAddress} -j DROP || true`,
      );
      // Добавление маршрута
      await this.executeCommand(
        `ip route add ${ipAddress} dev ${this.interface}`,
      );
    } catch (error) {
      console.log(error);
    }

    console.log(`Доступ для IP ${ipAddress} успешно включён.`);
  }
}
