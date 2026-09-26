import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { loadProductConfig } from '../config/product.config';
import {
  CycleParticipation,
  CycleParticipationDocument,
  CycleStatus,
  InvestmentPosition,
  InvestmentPositionDocument,
  LedgerAccountType,
  ReferralCommission,
  ReferralCommissionDocument,
  TradingCycle,
  TradingCycleDocument,
  UnifiedTrade,
  UnifiedTradeDocument,
} from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';

const ZERO = new Decimal(0);

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(InvestmentPosition.name) private readonly positions: Model<InvestmentPositionDocument>,
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
    private readonly ledger: LedgerService,
  ) {}

  async getDashboard(userId: Types.ObjectId) {
    const config = loadProductConfig();
    const [
      available,
      activePrincipal,
      pendingCompound,
      withdrawalPending,
      position,
      cycle,
      totalYieldEarned,
      totalReferralEarned,
    ] = await Promise.all([
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_AVAILABLE),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_ACTIVE_PRINCIPAL),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_PENDING_COMPOUND),
      this.ledger.getUserBalance(userId, LedgerAccountType.USER_WITHDRAWAL_PENDING),
      this.positions.findOne({ userId }),
      this.cycles.findOne({ status: { $in: [CycleStatus.RUNNING, CycleStatus.SCHEDULED] } }).sort({ startsAt: -1 }),
      this.sumYieldProfit(userId),
      this.sumReferralCommission(userId),
    ]);

    const totalBalance = available.plus(activePrincipal).plus(pendingCompound).plus(withdrawalPending);
    const totalEarnings = totalYieldEarned.plus(totalReferralEarned);
    const completedCycles = position?.completedCycles ?? 0;
    const minimumCycles = config.MIN_PRINCIPAL_CYCLES;
    const cyclesRemaining = Math.max(0, minimumCycles - completedCycles);

    const currentCycle = cycle ? await this.serializeCurrentCycle(userId, cycle) : null;
    const recentTrades = await this.getRecentTrades(userId, 10);

    return {
      currency: 'USDT',
      wallet: {
        totalBalance: this.money(totalBalance),
        availableBalance: this.money(available),
        activePrincipal: this.money(activePrincipal),
        pendingCompound: this.money(pendingCompound),
        withdrawalPending: this.money(withdrawalPending),
      },
      earnings: {
        totalYieldEarned: this.money(totalYieldEarned),
        totalReferralEarned: this.money(totalReferralEarned),
        totalEarnings: this.money(totalEarnings),
      },
      investment: position ? {
        status: position.status,
        activationRequestedAt: position.activationRequestedAt,
        startsAt: position.startsAt,
        completedCycles,
        minimumPrincipalCycles: minimumCycles,
        cyclesRemaining,
        principalWithdrawalEligible: position.principalWithdrawalEligible,
        stopRequestedAt: position.stopRequestedAt,
      } : {
        status: 'NOT_ACTIVE',
        activationRequestedAt: null,
        startsAt: null,
        completedCycles: 0,
        minimumPrincipalCycles: minimumCycles,
        cyclesRemaining: minimumCycles,
        principalWithdrawalEligible: false,
        stopRequestedAt: null,
      },
      currentCycle,
      recentTrades,
      visibility: {
        showPlatformCapital: false,
        showPlatformUserCount: false,
      },
      disclosure: 'Trading activity is simulated. Amounts in USDT are calculated from the user principal assigned to each cycle.',
    };
  }

  private async serializeCurrentCycle(userId: Types.ObjectId, cycle: TradingCycleDocument) {
    const [participation, tradeDocs] = await Promise.all([
      this.participations.findOne({ userId, cycleId: cycle._id }),
      this.trades.find({ cycleId: cycle._id }).sort({ sequence: 1 }),
    ]);
    const principal = participation ? new Decimal(participation.principal.toString()) : null;
    const closed = tradeDocs.filter((trade) => trade.status === 'CLOSED');
    const accumulatedRate = closed.reduce(
      (sum, trade) => sum.plus(trade.pnlRate?.toString() ?? '0'),
      ZERO,
    );

    return {
      id: cycle._id.toHexString(),
      sequence: cycle.sequence,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      status: cycle.status,
      expectedTradeCount: cycle.expectedTradeCount,
      progress: {
        planned: tradeDocs.filter((trade) => trade.status === 'PLANNED').length,
        open: tradeDocs.filter((trade) => trade.status === 'OPEN').length,
        closed: closed.length,
        total: cycle.expectedTradeCount,
      },
      accumulatedPnlRate: this.rate(accumulatedRate),
      accumulatedPnlUsdt: principal ? this.money(principal.mul(accumulatedRate)) : null,
      finalYieldRate: cycle.status === CycleStatus.COMPLETED && cycle.yieldRate ? this.rate(new Decimal(cycle.yieldRate.toString())) : null,
      participation: participation ? {
        status: participation.status,
        principal: this.money(principal!),
        profit: participation.profit ? this.money(new Decimal(participation.profit.toString())) : null,
      } : null,
      trades: tradeDocs.map((trade) => this.serializeTrade(trade, principal)),
    };
  }

  private async getRecentTrades(userId: Types.ObjectId, limit: number) {
    const participations = await this.participations.find({ userId }).select('cycleId principal');
    if (participations.length === 0) return [];

    const principalByCycle = new Map(
      participations.map((p) => [p.cycleId.toHexString(), new Decimal(p.principal.toString())]),
    );
    const cycleIds = participations.map((p) => p.cycleId);
    const tradeDocs = await this.trades
      .find({ cycleId: { $in: cycleIds }, status: 'CLOSED' })
      .sort({ closedAt: -1 })
      .limit(limit);

    return tradeDocs.map((trade) =>
      this.serializeTrade(trade, principalByCycle.get(trade.cycleId.toHexString()) ?? null),
    );
  }

  private serializeTrade(trade: UnifiedTradeDocument, principal: Decimal | null) {
    const pnlRate = trade.pnlRate ? new Decimal(trade.pnlRate.toString()) : null;
    const pnlUsdt = principal && pnlRate ? principal.mul(pnlRate) : null;

    return {
      id: trade._id.toHexString(),
      cycleId: trade.cycleId.toHexString(),
      sequence: trade.sequence,
      symbol: trade.symbol,
      side: trade.side,
      timeframe: trade.timeframe,
      status: trade.status,
      executionMode: trade.executionMode,
      scheduledOpenAt: trade.scheduledOpenAt,
      scheduledCloseAt: trade.scheduledCloseAt,
      openedAt: trade.openedAt,
      closedAt: trade.closedAt,
      entryPrice: trade.entryPrice?.toString() ?? null,
      exitPrice: trade.exitPrice?.toString() ?? null,
      pnlRate: pnlRate ? this.rate(pnlRate) : null,
      pnlUsdt: pnlUsdt ? this.money(pnlUsdt) : null,
      principalAtCycle: principal ? this.money(principal) : null,
    };
  }

  private async sumYieldProfit(userId: Types.ObjectId): Promise<Decimal> {
    const rows = await this.participations.aggregate<{ total: Types.Decimal128 }>([
      { $match: { userId, profit: { $ne: null } } },
      { $group: { _id: null, total: { $sum: '$profit' } } },
    ]);
    return rows[0]?.total ? new Decimal(rows[0].total.toString()) : ZERO;
  }

  private async sumReferralCommission(userId: Types.ObjectId): Promise<Decimal> {
    const rows = await this.commissions.aggregate<{ total: Types.Decimal128 }>([
      { $match: { referrerId: userId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return rows[0]?.total ? new Decimal(rows[0].total.toString()) : ZERO;
  }

  private money(value: Decimal) {
    return value.toDecimalPlaces(8, Decimal.ROUND_DOWN).toFixed(8);
  }

  private rate(value: Decimal) {
    return value.toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8);
  }
}
