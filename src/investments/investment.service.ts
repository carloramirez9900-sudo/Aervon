import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { D } from '../common/money';
import { loadProductConfig } from '../config/product.config';
import {
  CycleParticipation,
  CycleParticipationDocument,
  InvestmentPosition,
  InvestmentPositionDocument,
  InvestmentStatus,
  LedgerAccountType,
  CompoundMode,
  User,
  UserDocument,
  ParticipationStatus,
} from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';
import { nextCycleStart, validateActivation } from './investment.support';

@Injectable()
export class InvestmentService {
  constructor(
    @InjectModel(InvestmentPosition.name) private readonly positions: Model<InvestmentPositionDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly ledger: LedgerService,
  ) {}


  async getOverview(userId: Types.ObjectId) {
    const config = loadProductConfig();
    const [user, position, available, activePrincipal, pendingCompound] = await Promise.all([
      this.users.findById(userId).select('compoundMode'),
      this.positions.findOne({ userId }),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_AVAILABLE),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_PENDING_COMPOUND),
    ]);
    if (!user) throw new Error('User not found');
    const completedCycles = position?.completedCycles ?? 0;
    return {
      compoundMode: user.compoundMode,
      availableBalance: available.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
      activePrincipal: activePrincipal.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
      pendingCompound: pendingCompound.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8),
      position: position ? {
        status: position.status,
        startsAt: position.startsAt,
        completedCycles,
        minimumPrincipalCycles: config.MIN_PRINCIPAL_CYCLES,
        cyclesRemaining: Math.max(0, config.MIN_PRINCIPAL_CYCLES - completedCycles),
        principalWithdrawalEligible: position.principalWithdrawalEligible,
        stopRequestedAt: position.stopRequestedAt,
      } : {
        status: 'NOT_ACTIVE',
        startsAt: null,
        completedCycles: 0,
        minimumPrincipalCycles: config.MIN_PRINCIPAL_CYCLES,
        cyclesRemaining: config.MIN_PRINCIPAL_CYCLES,
        principalWithdrawalEligible: false,
        stopRequestedAt: null,
      },
    };
  }

  async setCompoundMode(userId: Types.ObjectId, mode: CompoundMode) {
    const user = await this.users.findByIdAndUpdate(
      userId,
      { $set: { compoundMode: mode } },
      { new: true },
    ).select('compoundMode');
    if (!user) throw new Error('User not found');
    return { compoundMode: user.compoundMode };
  }

  async activate(userId: Types.ObjectId, requestedPrincipal: Decimal, commandId: string, requestedAt = new Date()) {
    const config = loadProductConfig();
    return this.ledger.withTransaction(async (session) => {
      const current = await this.positions.findOne({ userId }).session(session);
      if (current && current.status !== InvestmentStatus.STOPPED) {
        throw new Error('Trading is already active or pending for this user');
      }

      const available = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_AVAILABLE, session);
      const active = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL, session);
      const availableBalance = await this.ledger.getBalanceByAccount(available, session);
      const principal = validateActivation({
        availableBalance,
        requestedPrincipal,
        minimumDeposit: D(config.MIN_DEPOSIT_USDT),
      });

      await this.ledger.transfer({
        idempotencyKey: `investment:activate:${userId.toHexString()}:${commandId}`,
        eventType: 'INVESTMENT_ACTIVATED',
        fromAccount: available,
        toAccount: active,
        amount: principal,
        referenceId: userId.toHexString(),
      }, session);

      const startsAt = nextCycleStart(requestedAt, config.CYCLE_HOURS);
      if (current) {
        current.status = InvestmentStatus.PENDING;
        current.activationRequestedAt = requestedAt;
        current.startsAt = startsAt;
        current.completedCycles = 0;
        current.principalWithdrawalEligible = false;
        current.stopRequestedAt = null;
        current.stoppedAt = null;
        await current.save({ session });
        return current;
      }

      const [position] = await this.positions.create([{
        userId,
        status: InvestmentStatus.PENDING,
        activationRequestedAt: requestedAt,
        startsAt,
        completedCycles: 0,
        principalWithdrawalEligible: false,
      }], { session });
      return position;
    });
  }

  async requestCompound(userId: Types.ObjectId, amount: Decimal, commandId: string, requestedAt = new Date()) {
    if (amount.lte(0)) throw new Error('Compound amount must be positive');
    return this.ledger.withTransaction(async (session) => {
      const position = await this.positions.findOne({ userId }).session(session);
      if (!position || position.status === InvestmentStatus.STOPPED) throw new Error('No active investment');

      const available = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_AVAILABLE, session);
      const pending = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_PENDING_COMPOUND, session);
      const balance = await this.ledger.getBalanceByAccount(available, session);
      if (amount.gt(balance)) throw new Error('Insufficient available balance');

      return this.ledger.transfer({
        idempotencyKey: `compound:request:${userId.toHexString()}:${commandId}`,
        eventType: 'COMPOUND_REQUESTED',
        fromAccount: available,
        toAccount: pending,
        amount,
        referenceId: userId.toHexString(),
      }, session);
    });
  }

  async requestStop(userId: Types.ObjectId, commandId: string, requestedAt = new Date()) {
    const config = loadProductConfig();
    return this.ledger.withTransaction(async (session) => {
      const position = await this.positions.findOne({ userId }).session(session);
      if (!position || position.status === InvestmentStatus.STOPPED) throw new Error('No active investment');
      if (position.completedCycles < config.MIN_PRINCIPAL_CYCLES) {
        throw new Error(`Principal requires ${config.MIN_PRINCIPAL_CYCLES} completed cycles before stopping`);
      }

      const activeParticipation = await this.participations.findOne({
        userId,
        status: { $in: [ParticipationStatus.PENDING, ParticipationStatus.ACTIVE] },
      }).session(session);

      position.stopRequestedAt = requestedAt;
      position.principalWithdrawalEligible = true;
      if (activeParticipation) {
        position.status = InvestmentStatus.STOP_REQUESTED;
        await position.save({ session });
        return { position, releasedImmediately: false };
      }

      const active = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL, session);
      const available = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_AVAILABLE, session);
      const principal = await this.ledger.getBalanceByAccount(active, session);
      if (principal.gt(0)) {
        await this.ledger.transfer({
          idempotencyKey: `investment:stop-release:${userId.toHexString()}:${commandId}`,
          eventType: 'PRINCIPAL_RELEASED',
          fromAccount: active,
          toAccount: available,
          amount: principal,
          referenceId: userId.toHexString(),
        }, session);
      }
      position.status = InvestmentStatus.STOPPED;
      position.stoppedAt = requestedAt;
      await position.save({ session });
      return { position, releasedImmediately: true };
    });
  }
}
