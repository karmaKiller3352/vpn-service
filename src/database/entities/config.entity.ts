import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('configs')
export class Config {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, { onDelete: 'CASCADE' }) // Связь один к одному
  @JoinColumn() // Указывает, что это связь владеющей стороны
  user: User;

  @Column({ unique: true })
  clientAddress: string;

  @Column({ nullable: true })
  qrCode: string;

  @Column()
  publicKey: string;
}
