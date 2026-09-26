import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum LedgerAccountType {
  USER_AVAILABLE = 'USER_AVAILABLE',
  USER_ACTIVE_PRINCIPAL = 'USER_ACTIVE_PRINCIPAL',
  USER_PENDING_COMPOUND = 'USER_PENDING_COMPOUND',
  USER_WITHDRAWAL_PENDING = 'USER_WITHDRAWAL_PENDING',
  PLATFORM_TREASURY = 'PLATFORM_TREASURY',
  PLATFORM_YIELD_EXPENSE = 'PLATFORM_YIELD_EXPENSE',
  PLATFORM_REFERRAL_EXPENSE = 'PLATFORM_REFERRAL_EXPENSE',
}

export enum LedgerDirection {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export type LedgerAccountDocument = HydratedDocument<LedgerAccount>;
export type LedgerTransactionDocument = HydratedDocument<LedgerTransaction>;
export type LedgerEntryDocument = HydratedDocument<LedgerEntry>;

@Schema({ timestamps: true, collection: 'ledger_accounts' })
export class LedgerAccount {
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId!: Types.ObjectId | null;

  @Prop({ required: true, type: String, enum: LedgerAccountType, index: true })
  type!: LedgerAccountType;

  @Prop({ required: true, default: 'USDT', uppercase: true })
  currency!: string;
}

export const LedgerAccountSchema = SchemaFactory.createForClass(LedgerAccount);
LedgerAccountSchema.index(
  { userId: 1, type: 1, currency: 1 },
  { unique: true, name: 'uniq_user_account_type_currency' },
);

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'ledger_transactions' })
export class LedgerTransaction {
  @Prop({ required: true, unique: true, index: true })
  idempotencyKey!: string;

  @Prop({ required: true, index: true })
  eventType!: string;

  @Prop({ default: null, index: true })
  referenceId!: string | null;

  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  metadata!: Record<string, unknown> | null;
}

export const LedgerTransactionSchema = SchemaFactory.createForClass(LedgerTransaction);

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'ledger_entries' })
export class LedgerEntry {
  @Prop({ type: Types.ObjectId, ref: LedgerTransaction.name, required: true, index: true })
  transactionId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: LedgerAccount.name, required: true, index: true })
  accountId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: LedgerDirection })
  direction!: LedgerDirection;

  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 })
  amount!: Types.Decimal128;
}

export const LedgerEntrySchema = SchemaFactory.createForClass(LedgerEntry);
LedgerEntrySchema.index({ accountId: 1, createdAt: 1 });
LedgerEntrySchema.index({ transactionId: 1, accountId: 1 });
