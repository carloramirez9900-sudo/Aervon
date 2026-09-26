import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { D } from '../common/money';
import { loadProductConfig } from '../config/product.config';
import { fromDecimal128, toDecimal128 } from '../database/decimal128';
import {
  CompoundMode,
  CycleParticipation,
  CycleParticipationDocument,
  CycleStatus,
  InvestmentPosition,
  InvestmentPositionDocument,
  InvestmentStatus,
  LedgerAccountType,
  LedgerDirection,
  ParticipationStatus,
  ReferralCommission,
  ReferralCommissionDocument,
  TradingCycle,
  TradingCycleDocument,
  TradeStatus,
  UnifiedTrade,
  UnifiedTradeDocument,
  User,
  UserDocument,
} from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';
import { calculateReferralCommission } from '../referrals/referral.domain';
import { calculateCycleProfit, cycleWindow, validateYieldRate } from './cycle.domain';

@Injectable()
export class CycleService {
  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    @InjectModel(InvestmentPosition.name) private readonly positions: Model<InvestmentPositionDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
    private readonly ledger: LedgerService,
  ) {}

  async createCycle(sequence: number, startsAt: Date) {
    const config = loadProductConfig();
    const window = cycleWindow(startsAt, config.CYCLE_HOURS);
    return this.cycles.findOneAndUpdate(
      { sequence },
      { $setOnInsert: {
        sequence,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        status: CycleStatus.SCHEDULED,
        expectedTradeCount: config.TRADES_PER_CYCLE,
      } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  }

  async startCycle(cycleId: Types.ObjectId) {
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (![CycleStatus.SCHEDULED, CycleStatus.RUNNING].includes(cycle.status)) {
      throw new Error(`Cycle cannot start from status ${cycle.status}`);
    }

    if (cycle.status === CycleStatus.SCHEDULED) {
      cycle.status = CycleStatus.RUNNING;
      await cycle.save();
    }

    const positions = await this.positions.find({
      status: { $in: [InvestmentStatus.PENDING, InvestmentStatus.ACTIVE] },
      startsAt: { $lte: cycle.startsAt },
    }).select('_id userId status completedCycles');

    for (const position of positions) {
      await this.enrollPosition(cycle, position);
    }

    return this.cycles.findById(cycleId);
  }

  private async enrollPosition(cycle: TradingCycleDocument, position: InvestmentPositionDocument) {
    await this.ledger.withTransaction(async (session) => {
      const existing = await this.participations.findOne({ userId: position.userId, cycleId: cycle._id }).session(session);
      if (existing) return;

      const active = await this.ledger.ensureAccount(position.userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL, session);
      const pending = await this.ledger.ensureAccount(position.userId, LedgerAccountType.USER_PENDING_COMPOUND, session);
      const pendingBalance = await this.ledger.getBalanceByAccount(pending, session);

      if (pendingBalance.gt(0)) {
        await this.ledger.transfer({
          idempotencyKey: `cycle:${cycle._id.toHexString()}:compound:${position.userId.toHexString()}`,
          eventType: 'COMPOUND_APPLIED',
          fromAccount: pending,
          toAccount: active,
          amount: pendingBalance,
          referenceId: cycle._id.toHexString(),
        }, session);
      }

      const principal = await this.ledger.getBalanceByAccount(active, session);
      if (principal.lte(0)) return;

      await this.participations.create([{
        userId: position.userId,
        cycleId: cycle._id,
        principal: toDecimal128(principal),
        status: ParticipationStatus.ACTIVE,
        completedPrincipalCycles: position.completedCycles,
      }], { session });

      if (position.status === InvestmentStatus.PENDING) {
        await this.positions.updateOne(
          { _id: position._id, status: InvestmentStatus.PENDING },
          { $set: { status: InvestmentStatus.ACTIVE } },
          { session },
        );
      }
    });
  }

  async closeCycle(cycleId: Types.ObjectId, yieldRateValue: Decimal) {
    const config = loadProductConfig();
    const rules = {
      tradesPerCycle: config.TRADES_PER_CYCLE,
      minYieldRate: D(config.DAILY_YIELD_MIN_RATE),
      maxYieldRate: D(config.DAILY_YIELD_MAX_RATE),
      minimumPrincipalCycles: config.MIN_PRINCIPAL_CYCLES,
    };
    validateYieldRate(yieldRateValue, rules);

    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status === CycleStatus.COMPLETED) return cycle;
    if (cycle.status !== CycleStatus.RUNNING) throw new Error('Only a running cycle can be closed');

    const closedTradeDocs = await this.trades.find({ cycleId: cycle._id, status: TradeStatus.CLOSED }).select('pnlRate');
    if (closedTradeDocs.length !== cycle.expectedTradeCount) {
      throw new Error(`Cycle requires exactly ${cycle.expectedTradeCount} closed trades; found ${closedTradeDocs.length}`);
    }
    const simulatedPnlTotal = closedTradeDocs.reduce(
      (sum, trade) => sum.plus(trade.pnlRate ? fromDecimal128(trade.pnlRate) : D(0)),
      D(0),
    );
    if (!simulatedPnlTotal.eq(yieldRateValue)) {
      throw new Error(`Cycle PnL reconciliation failed: trades=${simulatedPnlTotal.toFixed()} yield=${yieldRateValue.toFixed()}`);
    }

    if (cycle.yieldRate && !fromDecimal128(cycle.yieldRate).eq(yieldRateValue)) {
      throw new Error('Cycle yield rate was already fixed to a different value');
    }
    if (!cycle.yieldRate) {
      cycle.yieldRate = toDecimal128(yieldRateValue);
      await cycle.save();
    }

    const participantIds = await this.participations.find({ cycleId: cycle._id }).distinct('_id');
    for (const participationId of participantIds) {
      await this.settleParticipation(new Types.ObjectId(participationId), yieldRateValue, rules.minimumPrincipalCycles);
    }

    const remaining = await this.participations.countDocuments({
      cycleId: cycle._id,
      status: { $ne: ParticipationStatus.COMPLETED },
    });
    if (remaining > 0) throw new Error(`Cycle has ${remaining} unsettled participations`);

    cycle.status = CycleStatus.COMPLETED;
    await cycle.save();
    return cycle;
  }

  private async settleParticipation(participationId: Types.ObjectId, yieldRateValue: Decimal, minimumCycles: number) {
    const config = loadProductConfig();
    await this.ledger.withTransaction(async (session) => {
      const participation = await this.participations.findById(participationId).session(session);
      if (!participation || participation.status === ParticipationStatus.COMPLETED) return;

      const position = await this.positions.findOne({ userId: participation.userId }).session(session);
      if (!position) throw new Error('Investment position not found');
      const user = await this.users.findById(participation.userId).session(session);
      if (!user) throw new Error('User not found');

      const principal = fromDecimal128(participation.principal);
      const result = calculateCycleProfit({
        principal,
        yieldRate: yieldRateValue,
        completedPrincipalCyclesBefore: position.completedCycles,
      }, {
        tradesPerCycle: config.TRADES_PER_CYCLE,
        minYieldRate: D(config.DAILY_YIELD_MIN_RATE),
        maxYieldRate: D(config.DAILY_YIELD_MAX_RATE),
        minimumPrincipalCycles: minimumCycles,
      });

      const yieldExpense = await this.ledger.ensureAccount(null, LedgerAccountType.PLATFORM_YIELD_EXPENSE, session);
      const shouldAutoCompound = user.compoundMode === CompoundMode.AUTOMATIC && position.status !== InvestmentStatus.STOP_REQUESTED;
      const destinationType = shouldAutoCompound
        ? LedgerAccountType.USER_PENDING_COMPOUND
        : LedgerAccountType.USER_AVAILABLE;
      const profitDestination = await this.ledger.ensureAccount(participation.userId, destinationType, session);

      if (result.profit.gt(0)) {
        await this.ledger.post({
          idempotencyKey: `cycle:${participation.cycleId.toHexString()}:yield:${participation.userId.toHexString()}`,
          eventType: 'CYCLE_YIELD_CREDITED',
          referenceId: participation.cycleId.toHexString(),
          metadata: { userId: participation.userId.toHexString(), autoCompound: shouldAutoCompound },
          postings: [
            { accountId: yieldExpense._id, side: LedgerDirection.DEBIT, amount: result.profit },
            { accountId: profitDestination._id, side: LedgerDirection.CREDIT, amount: result.profit },
          ],
        }, session);
      }

      if (user.referrerId && result.profit.gt(0)) {
        const commissionAmount = calculateReferralCommission(result.profit, D(config.REFERRAL_COMMISSION_RATE));
        if (commissionAmount.gt(0)) {
          const referralExpense = await this.ledger.ensureAccount(null, LedgerAccountType.PLATFORM_REFERRAL_EXPENSE, session);
          const referrerAvailable = await this.ledger.ensureAccount(user.referrerId, LedgerAccountType.USER_AVAILABLE, session);
          await this.ledger.post({
            idempotencyKey: `cycle:${participation.cycleId.toHexString()}:referral:${participation.userId.toHexString()}`,
            eventType: 'REFERRAL_COMMISSION_CREDITED',
            referenceId: participation.cycleId.toHexString(),
            metadata: { referredUserId: participation.userId.toHexString(), referrerId: user.referrerId.toHexString() },
            postings: [
              { accountId: referralExpense._id, side: LedgerDirection.DEBIT, amount: commissionAmount },
              { accountId: referrerAvailable._id, side: LedgerDirection.CREDIT, amount: commissionAmount },
            ],
          }, session);

          await this.commissions.updateOne(
            { cycleId: participation.cycleId, referredUserId: participation.userId },
            { $setOnInsert: {
              cycleId: participation.cycleId,
              referrerId: user.referrerId,
              referredUserId: participation.userId,
              baseProfit: toDecimal128(result.profit),
              rate: toDecimal128(D(config.REFERRAL_COMMISSION_RATE)),
              amount: toDecimal128(commissionAmount),
            } },
            { upsert: true, session },
          );
        }
      }

      position.completedCycles = result.completedPrincipalCycles;
      position.principalWithdrawalEligible = result.principalWithdrawalEligible;

      if (position.status === InvestmentStatus.STOP_REQUESTED && result.principalWithdrawalEligible) {
        const active = await this.ledger.ensureAccount(participation.userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL, session);
        const available = await this.ledger.ensureAccount(participation.userId, LedgerAccountType.USER_AVAILABLE, session);
        const activePrincipal = await this.ledger.getBalanceByAccount(active, session);
        if (activePrincipal.gt(0)) {
          await this.ledger.transfer({
            idempotencyKey: `cycle:${participation.cycleId.toHexString()}:principal-release:${participation.userId.toHexString()}`,
            eventType: 'PRINCIPAL_RELEASED',
            fromAccount: active,
            toAccount: available,
            amount: activePrincipal,
            referenceId: participation.cycleId.toHexString(),
          }, session);
        }
        position.status = InvestmentStatus.STOPPED;
        position.stoppedAt = new Date();
      }
      await position.save({ session });

      participation.yieldRate = toDecimal128(yieldRateValue);
      participation.profit = toDecimal128(result.profit);
      participation.completedPrincipalCycles = result.completedPrincipalCycles;
      participation.status = ParticipationStatus.COMPLETED;
      await participation.save({ session });
    });
  }
}
