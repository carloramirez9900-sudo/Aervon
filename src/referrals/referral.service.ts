import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { loadProductConfig } from '../config/product.config';
import {
  InvestmentPosition,
  InvestmentPositionDocument,
  InvestmentStatus,
  ReferralCommission,
  ReferralCommissionDocument,
  User,
  UserDocument,
} from '../database/schemas';

@Injectable()
export class ReferralService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(InvestmentPosition.name) private readonly positions: Model<InvestmentPositionDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
  ) {}

  async getSummary(userId: Types.ObjectId) {
    const config = loadProductConfig();
    const user = await this.users.findById(userId).select('referralCode');
    if (!user) throw new Error('User not found');

    const referredUsers = await this.users.find({ referrerId: userId }).select('_id phoneE164 createdAt').sort({ createdAt: -1 });
    const referredIds = referredUsers.map((item) => item._id);
    const activePositions = referredIds.length
      ? await this.positions.find({ userId: { $in: referredIds }, status: { $in: [InvestmentStatus.PENDING, InvestmentStatus.ACTIVE, InvestmentStatus.STOP_REQUESTED] } }).select('userId status')
      : [];
    const activeIds = new Set(activePositions.map((item) => item.userId.toHexString()));

    const [commissionDocs, totals] = await Promise.all([
      this.commissions.find({ referrerId: userId }).sort({ createdAt: -1 }).limit(100),
      this.commissions.aggregate<{ total: Types.Decimal128 }>([
        { $match: { referrerId: userId } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
    ]);
    const referredById = new Map(referredUsers.map((item) => [item._id.toHexString(), item]));
    const total = totals[0]?.total ? new Decimal(totals[0].total.toString()) : new Decimal(0);

    return {
      referralCode: user.referralCode,
      commissionRate: new Decimal(config.REFERRAL_COMMISSION_RATE).mul(100).toFixed(2),
      directReferrals: referredUsers.length,
      activeReferrals: activeIds.size,
      totalCommission: total.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
      referrals: referredUsers.slice(0, 50).map((item) => ({
        id: item._id.toHexString(),
        phone: this.maskPhone(item.phoneE164),
        joinedAt: (item as unknown as { createdAt?: Date }).createdAt ?? null,
        active: activeIds.has(item._id.toHexString()),
      })),
      commissions: commissionDocs.map((item) => ({
        id: item._id.toHexString(),
        cycleId: item.cycleId.toHexString(),
        referredUserId: item.referredUserId.toHexString(),
        referredPhone: this.maskPhone(referredById.get(item.referredUserId.toHexString())?.phoneE164 ?? ''),
        baseProfit: item.baseProfit.toString(),
        rate: new Decimal(item.rate.toString()).mul(100).toFixed(2),
        amount: item.amount.toString(),
        createdAt: (item as unknown as { createdAt?: Date }).createdAt ?? null,
      })),
    };
  }

  private maskPhone(phone: string) {
    if (!phone) return 'Usuario';
    if (phone.length <= 6) return `••••${phone.slice(-2)}`;
    return `${phone.slice(0, 3)} •••• ${phone.slice(-3)}`;
  }
}
