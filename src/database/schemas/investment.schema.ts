import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export enum InvestmentStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  STOP_REQUESTED = 'STOP_REQUESTED',
  STOPPED = 'STOPPED',
}

export type InvestmentPositionDocument = HydratedDocument<InvestmentPosition>;

@Schema({ timestamps: true, collection: 'investment_positions' })
export class InvestmentPosition {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, type: String, enum: InvestmentStatus, default: InvestmentStatus.PENDING, index: true })
  status!: InvestmentStatus;

  @Prop({ required: true })
  activationRequestedAt!: Date;

  @Prop({ required: true, index: true })
  startsAt!: Date;

  @Prop({ required: true, default: 0, min: 0 })
  completedCycles!: number;

  @Prop({ required: true, default: false })
  principalWithdrawalEligible!: boolean;

  @Prop({ default: null })
  stopRequestedAt!: Date | null;

  @Prop({ default: null })
  stoppedAt!: Date | null;
}

export const InvestmentPositionSchema = SchemaFactory.createForClass(InvestmentPosition);
InvestmentPositionSchema.index({ status: 1, startsAt: 1 });
