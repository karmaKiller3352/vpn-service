export type AddTgUser = {
  telegramId: number;
  configServiceType: ConfigServiceType;
};

export type PeerInfo = {
  qrCode: string;
  message?: string;
  startDate: string;
  configFilePath: string;
  expirationDate: string;
};

export type ConfigServiceType = 'wireguard' | 'openvpn';
