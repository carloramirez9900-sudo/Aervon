import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReferralCommissionDocument = HydratedDocument<ReferralCommission>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, collection: 'referral_commissions' })
export class ReferralCommission {
  @Prop({ type: Types.ObjectId, ref: 'TradingCycle', required: true, index: true }) cycleId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) referrerId!: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true }) referredUserId!: Types.ObjectId;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) baseProfit!: Types.Decimal128;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) rate!: Types.Decimal128;
  @Prop({ required: true, type: MongooseSchema.Types.Decimal128 }) amount!: Types.Decimal128;
}
export const ReferralCommissionSchema = SchemaFactory.createForClass(ReferralCommission);
ReferralCommissionSchema.index({ cycleId: 1, referredUserId: 1 }, { unique: true });
ReferralCommissionSchema.index({ referrerId: 1, createdAt: -1 });
