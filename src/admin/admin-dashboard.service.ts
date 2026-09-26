import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import Decimal from 'decimal.js';
import { BlockchainDeposit, BlockchainDepositDocument, CycleParticipation, CycleParticipationDocument, DepositStatus, InvestmentPosition, InvestmentPositionDocument, InvestmentStatus, ReferralCommission, ReferralCommissionDocument, TradingCycle, TradingCycleDocument, UnifiedTrade, UnifiedTradeDocument, User, UserDocument, UserStatus, Withdrawal, WithdrawalDocument, WithdrawalStatus, LedgerAccountType } from '../database/schemas';
import { fromDecimal128 } from '../database/decimal128';
import { AdminLedgerService } from './admin-ledger.service';
import { WithdrawalChainService } from '../withdrawals/withdrawal-chain.service';

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(Withdrawal.name) private readonly withdrawals: Model<WithdrawalDocument>,
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    @InjectModel(InvestmentPosition.name) private readonly investments: Model<InvestmentPositionDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    @InjectModel(ReferralCommission.name) private readonly commissions: Model<ReferralCommissionDocument>,
    private readonly ledgerSummary: AdminLedgerService,
    private readonly chain: WithdrawalChainService,
    private readonly config: ConfigService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  private startOfToday() {
    const d = new Date(); d.setUTCHours(0,0,0,0); return d;
  }

  async overview() {
    const today = this.startOfToday();
    const pendingWithdrawalStatuses = [
      WithdrawalStatus.REQUESTED, WithdrawalStatus.RESERVED, WithdrawalStatus.WAITING_LIQUIDITY,
      WithdrawalStatus.WAITING_GAS, WithdrawalStatus.QUEUED, WithdrawalStatus.PROCESSING,
      WithdrawalStatus.SIGNED, WithdrawalStatus.BROADCASTED, WithdrawalStatus.CONFIRMING, WithdrawalStatus.SECURITY_HOLD,
    ];
    const [
      usersTotal, activeUsers, suspendedUsers, activeInvestments,
      depositsTodayRows, withdrawalsTodayRows, pendingWithdrawals,
      waitingLiquidity, waitingGas, securityHold,
      cycle, activePrincipal, availableBalance, withdrawalReserved,
      referralTotalRows,
    ] = await Promise.all([
      this.users.countDocuments({}),
      this.users.countDocuments({ status: UserStatus.ACTIVE }),
      this.users.countDocuments({ status: UserStatus.SUSPENDED }),
      this.investments.countDocuments({ status: { $in: [InvestmentStatus.ACTIVE, InvestmentStatus.PENDING, InvestmentStatus.STOP_REQUESTED] } }),
      this.deposits.find({ creditedAt: { $gte: today }, status: { $in: [DepositStatus.CREDITED, DepositStatus.SWEEP_PENDING, DepositStatus.SWEPT, DepositStatus.SWEEP_FAILED] } }).select('amount').lean(),
      this.withdrawals.find({ confirmedAt: { $gte: today }, status: WithdrawalStatus.CONFIRMED }).select('amount').lean(),
      this.withdrawals.countDocuments({ status: { $in: pendingWithdrawalStatuses } }),
      this.withdrawals.countDocuments({ status: WithdrawalStatus.WAITING_LIQUIDITY }),
      this.withdrawals.countDocuments({ status: WithdrawalStatus.WAITING_GAS }),
      this.withdrawals.countDocuments({ status: WithdrawalStatus.SECURITY_HOLD }),
      this.cycles.findOne({ status: { $in: ['RUNNING','SCHEDULED'] } }).sort({ startsAt: 1 }).lean(),
      this.ledgerSummary.aggregateType(LedgerAccountType.USER_ACTIVE_PRINCIPAL),
      this.ledgerSummary.aggregateType(LedgerAccountType.USER_AVAILABLE),
      this.ledgerSummary.aggregateType(LedgerAccountType.USER_WITHDRAWAL_PENDING),
      this.commissions.find({}).select('amount').lean(),
    ]);
    const sum = (rows: any[], key: string) => rows.reduce((acc, r) => acc.plus(fromDecimal128(r[key])), new Decimal(0)).toFixed();
    const depositsToday = sum(depositsTodayRows as any[], 'amount');
    const withdrawalsToday = sum(withdrawalsTodayRows as any[], 'amount');
    const referralTotal = sum(referralTotalRows as any[], 'amount');
    let cycleSummary: any = null;
    if (cycle) {
      const tradeRows = await this.trades.find({ cycleId: cycle._id }).sort({ sequence: 1 }).lean();
      const closed = tradeRows.filter((t: any) => t.status === 'CLOSED');
      const pnl = closed.reduce((acc: any, t: any) => acc.plus(t.pnlRate ? fromDecimal128(t.pnlRate) : 0), new Decimal(0));
      cycleSummary = {
        id: cycle._id.toString(), sequence: cycle.sequence, status: cycle.status, startsAt: cycle.startsAt, endsAt: cycle.endsAt,
        expectedTrades: cycle.expectedTradeCount, closedTrades: closed.length, openTrades: tradeRows.filter((t:any)=>t.status==='OPEN').length,
        accumulatedPnlRate: pnl.toFixed(), yieldRate: cycle.yieldRate ? fromDecimal128(cycle.yieldRate).toFixed() : null,
      };
    }
    let wallet: any = { configured: false, address: this.config.get<string>('BSC_WITHDRAWAL_ADDRESS') ?? null, usdt: null, bnbWei: null, error: null };
    try {
      const b = await this.chain.balances();
      wallet = { configured: true, address: await this.chain.walletAddress(), usdt: b.usdt.toFixed(), bnbWei: b.bnbWei.toString(), error: null };
    } catch (e: any) { wallet.error = e?.message ?? String(e); }
    return {
      users: { total: usersTotal, active: activeUsers, suspended: suspendedUsers, activeInvestments },
      finance: { depositsTodayUsdt: depositsToday, withdrawalsTodayUsdt: withdrawalsToday, activePrincipalUsdt: activePrincipal.toFixed(), availableBalanceUsdt: availableBalance.toFixed(), withdrawalReservedUsdt: withdrawalReserved.toFixed(), referralCommissionsAllTimeUsdt: referralTotal },
      withdrawals: { pending: pendingWithdrawals, waitingLiquidity, waitingGas, securityHold },
      cycle: cycleSummary,
      wallet,
      services: { mongodb: this.connection.readyState === 1 ? 'OK' : 'DEGRADED', bscRpc: wallet.error ? 'DEGRADED' : 'OK', telegramConfigured: Boolean(this.config.get<string>('TELEGRAM_BOT_TOKEN')) },
      generatedAt: new Date(),
    };
  }
}
