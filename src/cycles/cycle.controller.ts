import { Controller, Get, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { AuthService } from '../auth/auth.service';
import { CycleParticipation, CycleParticipationDocument, CycleStatus, TradingCycle, TradingCycleDocument, UnifiedTrade, UnifiedTradeDocument } from '../database/schemas';

@Controller('trading')
export class CycleController {
  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    @InjectModel(CycleParticipation.name) private readonly participations: Model<CycleParticipationDocument>,
    private readonly auth: AuthService,
  ) {}

  private async userId(authorization?: string) {
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
    if (!token) throw new UnauthorizedException();
    const payload = await this.auth.authenticateAccessToken(token);
    return new Types.ObjectId(payload.sub);
  }

  @Get('current')
  async current(@Headers('authorization') authorization?: string) {
    const userId = await this.userId(authorization);
    const cycle = await this.cycles.findOne({ status: { $in: [CycleStatus.RUNNING, CycleStatus.SCHEDULED] } }).sort({ startsAt: -1 });
    if (!cycle) return { cycle: null };

    const participation = await this.participations.findOne({ userId, cycleId: cycle._id });
    const principal = participation ? new Decimal(participation.principal.toString()) : null;
    const trades = await this.trades.find({ cycleId: cycle._id }).sort({ sequence: 1 });
    const closed = trades.filter(t => t.status === 'CLOSED');
    const accumulatedPnlRate = closed.reduce((sum, trade) => sum.plus(trade.pnlRate?.toString() ?? '0'), new Decimal(0));
    const accumulatedPnlUsdt = principal ? principal.mul(accumulatedPnlRate) : null;

    return {
      cycle: {
        id: cycle._id.toHexString(), sequence: cycle.sequence, startsAt: cycle.startsAt, endsAt: cycle.endsAt, status: cycle.status,
        yieldRate: cycle.status === CycleStatus.COMPLETED ? cycle.yieldRate?.toString() ?? null : null,
        accumulatedPnlRate: accumulatedPnlRate.toFixed(8),
        accumulatedPnlUsdt: accumulatedPnlUsdt?.toFixed(8) ?? null,
        expectedTradeCount: cycle.expectedTradeCount,
      },
      participation: participation ? {
        principal: participation.principal.toString(),
        status: participation.status,
        profit: participation.profit?.toString() ?? null,
      } : null,
      summary: {
        planned: trades.filter(t => t.status === 'PLANNED').length,
        open: trades.filter(t => t.status === 'OPEN').length,
        closed: closed.length,
      },
      trades: trades.map(t => this.serializeTrade(t, principal)),
      disclosure: 'Trading activity shown by this endpoint is simulated and is not an exchange order execution.',
    };
  }

  @Get('history')
  async history(@Headers('authorization') authorization?: string, @Query('limit') limitValue?: string) {
    const userId = await this.userId(authorization);
    const limit = Math.min(100, Math.max(1, Number(limitValue ?? 50)));

    const participations = await this.participations.find({ userId }).select('cycleId principal');
    if (participations.length === 0) return { items: [], disclosure: 'SIMULATED_EXECUTION' };

    const principalByCycle = new Map(
      participations.map(p => [p.cycleId.toHexString(), new Decimal(p.principal.toString())]),
    );
    const cycleIds = participations.map(p => p.cycleId);
    const trades = await this.trades.find({ cycleId: { $in: cycleIds }, status: 'CLOSED' }).sort({ closedAt: -1 }).limit(limit);

    return {
      items: trades.map(t => this.serializeTrade(t, principalByCycle.get(t.cycleId.toHexString()) ?? null)),
      disclosure: 'SIMULATED_EXECUTION',
    };
  }

  private serializeTrade(t: UnifiedTradeDocument, principal: Decimal | null = null) {
    const pnlRate = t.pnlRate ? new Decimal(t.pnlRate.toString()) : null;
    const pnlUsdt = principal && pnlRate ? principal.mul(pnlRate) : null;
    return {
      id: t._id.toHexString(), cycleId: t.cycleId.toHexString(), sequence: t.sequence, symbol: t.symbol, side: t.side, timeframe: t.timeframe,
      status: t.status, executionMode: t.executionMode,
      scheduledOpenAt: t.scheduledOpenAt, scheduledCloseAt: t.scheduledCloseAt,
      openedAt: t.openedAt, closedAt: t.closedAt,
      entryPrice: t.entryPrice?.toString() ?? null, exitPrice: t.exitPrice?.toString() ?? null,
      pnlRate: pnlRate?.toFixed(8) ?? null,
      pnlUsdt: pnlUsdt?.toFixed(8) ?? null,
      principalAtCycle: principal?.toFixed(8) ?? null,
      marketReferenceOpenPrice: t.marketReferenceOpenPrice?.toString() ?? null,
      marketReferenceClosePrice: t.marketReferenceClosePrice?.toString() ?? null,
    };
  }
}
