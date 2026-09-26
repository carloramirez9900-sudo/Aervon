import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum WithdrawalStatus {
  REQUESTED = 'REQUESTED',
  RESERVED = 'RESERVED',
  WAITING_LIQUIDITY = 'WAITING_LIQUIDITY',
  WAITING_GAS = 'WAITING_GAS',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  SIGNED = 'SIGNED',
  BROADCASTED = 'BROADCASTED',
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  SECURITY_HOLD = 'SECURITY_HOLD',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export type WithdrawalDocument = HydratedDocument<Withdrawal>;

@Schema({ timestamps: true, collection: 'withdrawals' })
export class Withdrawal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) amount!: Types.Decimal128;
  @Prop({ required: true, default: 'BSC', uppercase: true }) network!: string;
  @Prop({ required: true, default: 'USDT', uppercase: true }) asset!: string;
  @Prop({ required: true, trim: true, lowercase: true }) destination!: string;
  @Prop({ required: true, type: String, enum: WithdrawalStatus, default: WithdrawalStatus.REQUESTED, index: true }) status!: WithdrawalStatus;
  @Prop({ default: null, sparse: true, index: true }) txHash!: string | null;
  @Prop({ default: null }) nonce!: number | null;
  @Prop({ default: null, select: false }) signedTransaction!: string | null;
  @Prop({ default: null }) gasLimit!: string | null;
  @Prop({ default: null }) gasPriceWei!: string | null;
  @Prop({ default: null }) estimatedGasCostWei!: string | null;
  @Prop({ default: null }) blockNumber!: number | null;
  @Prop({ required: true, unique: true, index: true }) idempotencyKey!: string;
  @Prop({ default: null }) failureReason!: string | null;
  @Prop({ required: true, default: 0, min: 0 }) attempts!: number;
  @Prop({ default: null, index: true }) processingLeaseUntil!: Date | null;
  @Prop({ required: true, default: () => new Date(), index: true }) requestedAt!: Date;
  @Prop({ default: null }) reservedAt!: Date | null;
  @Prop({ default: null }) broadcastedAt!: Date | null;
  @Prop({ default: null }) confirmedAt!: Date | null;
}
export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);
WithdrawalSchema.index({ userId: 1, requestedAt: -1 });
WithdrawalSchema.index({ status: 1, requestedAt: 1 });
WithdrawalSchema.index({ status: 1, processingLeaseUntil: 1, requestedAt: 1 });

export type WithdrawalSignerLockDocument = HydratedDocument<WithdrawalSignerLock>;

@Schema({ timestamps: true, collection: 'withdrawal_signer_locks' })
export class WithdrawalSignerLock {
  @Prop({ required: true, unique: true, index: true }) key!: string;
  @Prop({ required: true }) owner!: string;
  @Prop({ required: true, index: true }) leaseUntil!: Date;
}
export const WithdrawalSignerLockSchema = SchemaFactory.createForClass(WithdrawalSignerLock);
