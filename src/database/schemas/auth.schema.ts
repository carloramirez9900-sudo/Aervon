import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum VerificationChallengeStatus {
  PENDING_TELEGRAM = 'PENDING_TELEGRAM',
  TELEGRAM_VERIFIED = 'TELEGRAM_VERIFIED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED',
}

export type VerificationChallengeDocument = HydratedDocument<VerificationChallenge>;
export type AuthSessionDocument = HydratedDocument<AuthSession>;

@Schema({ timestamps: true, collection: 'verification_challenges' })
export class VerificationChallenge {
  @Prop({ required: true, unique: true, index: true })
  tokenHash!: string;

  @Prop({ required: true, index: true })
  phoneE164!: string;

  @Prop({ default: null, uppercase: true, trim: true })
  referralCode!: string | null;

  @Prop({ required: true, type: String, enum: VerificationChallengeStatus, default: VerificationChallengeStatus.PENDING_TELEGRAM, index: true })
  status!: VerificationChallengeStatus;

  @Prop({ default: null, index: true })
  telegramUserId!: string | null;

  @Prop({ default: null })
  telegramUsername!: string | null;

  @Prop({ default: null })
  verifiedAt!: Date | null;

  @Prop({ default: null })
  usedAt!: Date | null;

  @Prop({ required: true, index: true, expires: 0 })
  expiresAt!: Date;

  @Prop({ required: true, default: 0, min: 0 })
  attempts!: number;
}

export const VerificationChallengeSchema = SchemaFactory.createForClass(VerificationChallenge);
VerificationChallengeSchema.index({ phoneE164: 1, status: 1, createdAt: -1 });

@Schema({ timestamps: true, collection: 'auth_sessions' })
export class AuthSession {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  refreshTokenHash!: string;

  @Prop({ required: true, index: true })
  expiresAt!: Date;

  @Prop({ default: null, index: true })
  revokedAt!: Date | null;

  @Prop({ default: null })
  ipHash!: string | null;

  @Prop({ default: null })
  userAgent!: string | null;

  @Prop({ required: true, default: () => new Date() })
  lastUsedAt!: Date;
}

export const AuthSessionSchema = SchemaFactory.createForClass(AuthSession);
AuthSessionSchema.index({ userId: 1, revokedAt: 1, expiresAt: 1 });
