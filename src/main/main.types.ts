export type AddTgUser = {
  telegramId: number;
};

export type PeerInfo = {
  qrCode: string;
  message?: string;
  startDate: string;
  configFilePath: string;
  expirationDate: string;
};
