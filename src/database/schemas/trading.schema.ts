import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export enum CycleStatus {
  SCHEDULED = 'SCHEDULED', RUNNING = 'RUNNING', COMPLETED = 'COMPLETED', CANCELLED = 'CANCELLED',
}
export enum TradeStatus { PLANNED = 'PLANNED', OPEN = 'OPEN', CLOSED = 'CLOSED', CANCELLED = 'CANCELLED' }
export enum TradeSide { LONG = 'LONG', SHORT = 'SHORT' }
export enum TradeExecutionMode { SIMULATED = 'SIMULATED' }
export enum ParticipationStatus {
  PENDING = 'PENDING', ACTIVE = 'ACTIVE', COMPLETED = 'COMPLETED', STOP_REQUESTED = 'STOP_REQUESTED', STOPPED = 'STOPPED',
}

export type TradingCycleDocument = HydratedDocument<TradingCycle>;
export type UnifiedTradeDocument = HydratedDocument<UnifiedTrade>;
export type CycleParticipationDocument = HydratedDocument<CycleParticipation>;

@Schema({ timestamps: true, collection: 'trading_cycles' })
export class TradingCycle {
  @Prop({ required: true, unique: true, index: true }) sequence!: number;
  @Prop({ required: true, index: true }) startsAt!: Date;
  @Prop({ required: true }) endsAt!: Date;
  @Prop({ required: true, type: String, enum: CycleStatus, default: CycleStatus.SCHEDULED, index: true }) status!: CycleStatus;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) yieldRate!: Types.Decimal128 | null;
  @Prop({ default: null }) planSeed!: string | null;
  @Prop({ default: null }) plannedAt!: Date | null;
  @Prop({ required: true, default: 5, min: 5, max: 5 }) expectedTradeCount!: number;
}
export const TradingCycleSchema = SchemaFactory.createForClass(TradingCycle);
TradingCycleSchema.index({ status: 1, startsAt: 1 });

@Schema({ timestamps: true, collection: 'unified_trades' })
export class UnifiedTrade {
  @Prop({ type: Types.ObjectId, ref: TradingCycle.name, required: true, index: true }) cycleId!: Types.ObjectId;
  @Prop({ required: true, min: 1, max: 5 }) sequence!: number;
  @Prop({ required: true, uppercase: true }) exchange!: string;
  @Prop({ required: true, uppercase: true, index: true }) symbol!: string;
  @Prop({ required: true, type: String, enum: TradeSide }) side!: TradeSide;
  @Prop({ required: true }) timeframe!: string;
  @Prop({ required: true, type: String, enum: TradeStatus, default: TradeStatus.PLANNED, index: true }) status!: TradeStatus;
  @Prop({ required: true, type: String, enum: TradeExecutionMode, default: TradeExecutionMode.SIMULATED }) executionMode!: TradeExecutionMode;
  @Prop({ required: true }) scheduledOpenAt!: Date;
  @Prop({ required: true }) scheduledCloseAt!: Date;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) targetPnlRate!: Types.Decimal128;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) marketReferenceOpenPrice!: Types.Decimal128 | null;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) marketReferenceClosePrice!: Types.Decimal128 | null;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) entryPrice!: Types.Decimal128 | null;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) exitPrice!: Types.Decimal128 | null;
  @Prop({ default: null }) openedAt!: Date | null;
  @Prop({ default: null }) closedAt!: Date | null;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) pnlRate!: Types.Decimal128 | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) entrySnapshot!: Record<string, unknown> | null;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) exitSnapshot!: Record<string, unknown> | null;
  @Prop({ default: null }) entrySnapshotHash!: string | null;
  @Prop({ default: null }) exitSnapshotHash!: string | null;
  @Prop({ required: true }) strategyVersion!: string;
}
export const UnifiedTradeSchema = SchemaFactory.createForClass(UnifiedTrade);
UnifiedTradeSchema.index({ cycleId: 1, sequence: 1 }, { unique: true });
UnifiedTradeSchema.index({ cycleId: 1, status: 1 });

@Schema({ timestamps: true, collection: 'cycle_participations' })
export class CycleParticipation {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) userId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: TradingCycle.name, required: true, index: true }) cycleId!: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) principal!: Types.Decimal128;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) yieldRate!: Types.Decimal128 | null;
  @Prop({ type: MongooseSchema.Types.Decimal128, default: null }) profit!: Types.Decimal128 | null;
  @Prop({ required: true, type: String, enum: ParticipationStatus, default: ParticipationStatus.PENDING, index: true }) status!: ParticipationStatus;
  @Prop({ required: true, default: 0, min: 0 }) completedPrincipalCycles!: number;
}
export const CycleParticipationSchema = SchemaFactory.createForClass(CycleParticipation);
CycleParticipationSchema.index({ userId: 1, cycleId: 1 }, { unique: true });
