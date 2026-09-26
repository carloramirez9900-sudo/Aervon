import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { AuthSession, AuthSessionDocument, BlockchainDeposit, BlockchainDepositDocument, DepositAddress, DepositAddressDocument, InvestmentPosition, InvestmentPositionDocument, ReferralCommission, ReferralCommissionDocument, User, UserDocument, UserStatus, Withdrawal, WithdrawalDocument } from '../database/schemas';
import { fromDecimal128 } from '../database/decimal128';
import { AdminRole } from './admin.types';
import { AdminLedgerService } from './admin-ledger.service';
import { AdminAuditService } from './admin-audit.service';

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(InvestmentPosition.name) private readonly investments: Model<InvestmentPositionDocument>,
    @InjectModel(DepositAddress.name) private readonly addresses: Model<DepositAddressDocument>,
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(Withdrawal.name) private readonly withdrawals: Model<WithdrawalDocument>,
    @InjectModel(AuthSession.name) private readonly sessions: Model<AuthSessionDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
    private readonly ledger: AdminLedgerService,
    private readonly audit: AdminAuditService,
  ) {}

  async list(input: { page: number; limit: number; q?: string; status?: UserStatus; adminOnly?: boolean }) {
    const filter: any = {};
    if (input.status) filter.status = input.status;
    if (input.adminOnly) filter.adminRoles = { $exists: true, $ne: [] };
    if (input.q?.trim()) {
      const q = input.q.trim();
      const or: any[] = [
        { phoneE164: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { telegramUsername: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
        { referralCode: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } },
      ];
      if (Types.ObjectId.isValid(q)) or.push({ _id: new Types.ObjectId(q) });
      filter.$or = or;
    }
    const skip = (input.page - 1) * input.limit;
    const [items, total] = await Promise.all([
      this.users.find(filter).sort({ createdAt: -1 }).skip(skip).limit(input.limit).select('phoneE164 telegramUsername status referralCode referrerId compoundMode lastLoginAt adminRoles createdAt').lean(),
      this.users.countDocuments(filter),
    ]);
    return { items: items.map((u:any)=>({ id:u._id.toString(), ...u, _id: undefined })), page: input.page, limit: input.limit, total, pages: Math.ceil(total/input.limit) };
  }

  async detail(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('User not found');
    const userId = new Types.ObjectId(id);
    const user = await this.users.findById(userId).select('phoneE164 telegramUserId telegramUsername phoneVerifiedAt telegramVerifiedAt status referralCode referrerId compoundMode lastLoginAt adminRoles createdAt updatedAt').lean();
    if (!user) throw new NotFoundException('User not found');
    const [balances, investment, address, deposits, withdrawals, sessions, referralEarned] = await Promise.all([
      this.ledger.userBalances(userId),
      this.investments.findOne({ userId }).lean(),
      this.addresses.findOne({ userId }).lean(),
      this.deposits.find({ userId }).sort({ createdAt:-1 }).limit(20).lean(),
      this.withdrawals.find({ userId }).sort({ requestedAt:-1 }).limit(20).lean(),
      this.sessions.countDocuments({ userId, revokedAt: null, expiresAt: { $gt: new Date() } }),
      this.commissions.find({ referrerId: userId }).select('amount').lean(),
    ]);
    const referralTotal = referralEarned.reduce((a:any,r:any)=>a.plus(fromDecimal128(r.amount)),new Decimal(0));
    return {
      user: { id, ...user, _id: undefined }, balances,
      investment: investment ? { ...investment, _id: investment._id.toString(), userId: undefined } : null,
      depositAddress: address ? { address: address.address, network: address.network, active: address.active } : null,
      recentDeposits: deposits.map((d:any)=>({ id:d._id.toString(), amount:fromDecimal128(d.amount).toFixed(), status:d.status, txHash:d.txHash, createdAt:d.createdAt, confirmedAt:d.confirmedAt, creditedAt:d.creditedAt })),
      recentWithdrawals: withdrawals.map((w:any)=>({ id:w._id.toString(), amount:fromDecimal128(w.amount).toFixed(), status:w.status, destination:w.destination, txHash:w.txHash, requestedAt:w.requestedAt, confirmedAt:w.confirmedAt, failureReason:w.failureReason })),
      activeSessions: sessions,
      referralEarnedUsdt: referralTotal.toFixed(),
    };
  }

  async setStatus(input: { actorId: string; actorRoles: AdminRole[]; targetId: string; status: UserStatus; reason: string; ip?: string | null; requestId?: string | null }) {
    if (!input.reason?.trim()) throw new BadRequestException('Reason is required');
    const user = await this.users.findById(input.targetId);
    if (!user) throw new NotFoundException('User not found');
    if (user._id.toHexString() === input.actorId && input.status === UserStatus.SUSPENDED) throw new BadRequestException('Administrator cannot suspend their own account');
    if ((user.adminRoles ?? []).length && !input.actorRoles.includes(AdminRole.SUPER_ADMIN)) throw new BadRequestException('Only SUPER_ADMIN can change another administrator status');
    const before = { status: user.status };
    user.status = input.status;
    await user.save();
    if (input.status === UserStatus.SUSPENDED) await this.sessions.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await this.audit.record({ actorUserId: input.actorId, action: 'USER_STATUS_CHANGED', targetType:'USER', targetId:input.targetId, before, after:{status:user.status}, reason:input.reason, ip:input.ip, requestId:input.requestId });
    return { id: input.targetId, status: user.status };
  }

  async setRoles(input: { actorId:string; targetId:string; roles:AdminRole[]; reason:string; ip?:string|null; requestId?:string|null }) {
    if (!input.reason?.trim()) throw new BadRequestException('Reason is required');
    const allowed = new Set(Object.values(AdminRole));
    if (input.roles.some(r=>!allowed.has(r))) throw new BadRequestException('Invalid administrator role');
    const user = await this.users.findById(input.targetId);
    if (!user) throw new NotFoundException('User not found');
    const before = { adminRoles: user.adminRoles ?? [] };
    const removingSuper = (user.adminRoles ?? []).includes(AdminRole.SUPER_ADMIN) && !input.roles.includes(AdminRole.SUPER_ADMIN);
    if (removingSuper) {
      const superAdmins = await this.users.countDocuments({ adminRoles: AdminRole.SUPER_ADMIN });
      if (superAdmins <= 1) throw new BadRequestException('Cannot remove the last SUPER_ADMIN');
    }
    user.adminRoles = [...new Set(input.roles)];
    await user.save();
    await this.audit.record({ actorUserId:input.actorId, action:'ADMIN_ROLES_CHANGED', targetType:'USER', targetId:input.targetId, before, after:{adminRoles:user.adminRoles}, reason:input.reason, ip:input.ip, requestId:input.requestId });
    return { id: input.targetId, adminRoles: user.adminRoles };
  }

  async adjustBalance(input:{actorId:string;targetId:string;amount:string;direction:'CREDIT'|'DEBIT';reason:string;idempotencyKey:string;ip?:string|null;requestId?:string|null}) {
    if (!input.reason?.trim()) throw new BadRequestException('Reason is required');
    if (!Types.ObjectId.isValid(input.targetId)) throw new NotFoundException('User not found');
    const user = await this.users.exists({_id:input.targetId}); if(!user) throw new NotFoundException('User not found');
    let amount: Decimal; try { amount=new Decimal(input.amount); } catch { throw new BadRequestException('Invalid amount'); }
    await this.ledger.adminAdjust({ userId:new Types.ObjectId(input.targetId), amount, direction:input.direction, reason:input.reason, idempotencyKey:`admin-adjust:${input.idempotencyKey}` });
    await this.audit.record({actorUserId:input.actorId,action:'ADMIN_BALANCE_ADJUSTMENT',targetType:'USER',targetId:input.targetId,after:{amount:amount.toFixed(),direction:input.direction},reason:input.reason,ip:input.ip,requestId:input.requestId});
    return { ok:true, balance: await this.ledger.userBalances(new Types.ObjectId(input.targetId)) };
  }
}
