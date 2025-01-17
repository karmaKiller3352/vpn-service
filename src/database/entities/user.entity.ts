import { Entity, Column, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Config } from './config.entity';
import { Subscription } from './subscription.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  telegramId: number;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  phoneNumber: string;

  @Column({ nullable: false, default: 'telegram' })
  source: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({
    type: 'timestamp',
    default: () => 'CURRENT_TIMESTAMP',
    onUpdate: 'CURRENT_TIMESTAMP',
  })
  updatedAt: Date;

  @OneToOne(() => Config, (config) => config.user)
  config: Config; // Связь один к одному с конфигом

  @OneToOne(() => Subscription, (subscription) => subscription.user)
  subscription: Subscription;
}
