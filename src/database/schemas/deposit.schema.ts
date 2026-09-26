import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type DepositAddressDocument = HydratedDocument<DepositAddress>;
export type BlockchainDepositDocument = HydratedDocument<BlockchainDeposit>;
export type ChainCursorDocument = HydratedDocument<ChainCursor>;
export type WalletIndexCounterDocument = HydratedDocument<WalletIndexCounter>;

export enum DepositStatus {
  DETECTED = 'DETECTED',
  CONFIRMING = 'CONFIRMING',
  CONFIRMED = 'CONFIRMED',
  BELOW_MINIMUM = 'BELOW_MINIMUM',
  CREDITED = 'CREDITED',
  SWEEP_PENDING = 'SWEEP_PENDING',
  SWEPT = 'SWEPT',
  SWEEP_FAILED = 'SWEEP_FAILED',
  REORGED = 'REORGED',
}

@Schema({ timestamps: true, collection: 'deposit_addresses' })
export class DepositAddress {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true, lowercase: true })
  address!: string;

  @Prop({ required: true, unique: true, index: true, min: 0 })
  derivationIndex!: number;

  @Prop({ required: true, default: 'BSC', uppercase: true })
  network!: string;

  @Prop({ required: true, default: true, index: true })
  active!: boolean;

  @Prop({ default: null })
  sweepOwner!: string | null;
  @Prop({ default: null })
  sweepLeaseUntil!: Date | null;
  @Prop({ default: null })
  sweepRequestId!: string | null;
  @Prop({ default: [], type: [MongooseSchema.Types.ObjectId] })
  sweepRowIds!: Types.ObjectId[];
  @Prop({ default: null, select: false })
  sweepSignedTransaction!: string | null;
  @Prop({ default: null })
  sweepTxHash!: string | null;
}
export const DepositAddressSchema = SchemaFactory.createForClass(DepositAddress);
DepositAddressSchema.index({ network: 1, active: 1 });

@Schema({ timestamps: true, collection: 'blockchain_deposits' })
export class BlockchainDeposit {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: DepositAddress.name, required: true, index: true })
  depositAddressId!: Types.ObjectId;

  @Prop({ required: true, lowercase: true, index: true })
  toAddress!: string;

  @Prop({ required: true, lowercase: true, index: true })
  fromAddress!: string;

  @Prop({ required: true, lowercase: true, index: true })
  txHash!: string;

  @Prop({ required: true, min: 0 })
  logIndex!: number;

  @Prop({ required: true, min: 0, index: true })
  blockNumber!: number;

  @Prop({ required: true, lowercase: true })
  blockHash!: string;

  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 })
  amount!: Types.Decimal128;

  @Prop({ required: true, default: 'USDT' })
  asset!: string;

  @Prop({ required: true, default: 'BSC', uppercase: true })
  network!: string;

  @Prop({ required: true, type: String, enum: DepositStatus, default: DepositStatus.DETECTED, index: true })
  status!: DepositStatus;

  @Prop({ default: null })
  confirmedAt!: Date | null;

  @Prop({ default: null })
  creditedAt!: Date | null;

  @Prop({ default: null, lowercase: true })
  sweepTxHash!: string | null;

  @Prop({ default: null })
  sweptAt!: Date | null;

  @Prop({ default: null })
  lastError!: string | null;
}
export const BlockchainDepositSchema = SchemaFactory.createForClass(BlockchainDeposit);
BlockchainDepositSchema.index({ txHash: 1, logIndex: 1 }, { unique: true, name: 'uniq_chain_deposit_event' });
BlockchainDepositSchema.index({ userId: 1, status: 1, createdAt: -1 });
BlockchainDepositSchema.index({ status: 1, blockNumber: 1 });

@Schema({ timestamps: true, collection: 'chain_cursors' })
export class ChainCursor {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ required: true, min: 0 })
  lastScannedBlock!: number;
}
export const ChainCursorSchema = SchemaFactory.createForClass(ChainCursor);

@Schema({ timestamps: true, collection: 'wallet_index_counters' })
export class WalletIndexCounter {
  @Prop({ required: true, unique: true, index: true })
  key!: string;

  @Prop({ required: true, min: 0, default: 0 })
  seq!: number;
}
export const WalletIndexCounterSchema = SchemaFactory.createForClass(WalletIndexCounter);
