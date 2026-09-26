import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { D } from '../common/money';
import { loadProductConfig } from '../config/product.config';
import { fromDecimal128, toDecimal128 } from '../database/decimal128';
import { CycleStatus, TradeExecutionMode, TradeSide, TradeStatus, TradingCycle, TradingCycleDocument, UnifiedTrade, UnifiedTradeDocument } from '../database/schemas';
import { MarketReferenceService } from '../market/market-reference.service';
import { chooseYieldRate, distributeTargetYield, impliedExitPrice, newPlanSeed, planTradeTimes } from './simulation.domain';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'LINKUSDT'];

@Injectable()
export class SimulatedTradingService {
  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
    private readonly market: MarketReferenceService,
  ) {}

  async planCycle(cycleId: Types.ObjectId) {
    const config = loadProductConfig();
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new Error('Cycle not found');
    if (cycle.status !== CycleStatus.RUNNING) throw new Error('Only running cycles can be planned');
    if (cycle.planSeed && cycle.yieldRate) return cycle;

    const seed = cycle.planSeed ?? newPlanSeed();
    const yieldRate = cycle.yieldRate
      ? fromDecimal128(cycle.yieldRate)
      : chooseYieldRate(seed, D(config.DAILY_YIELD_MIN_RATE), D(config.DAILY_YIELD_MAX_RATE));
    const pnls = distributeTargetYield(seed, yieldRate, config.TRADES_PER_CYCLE);
    const times = planTradeTimes(seed, cycle.endsAt.getTime() - cycle.startsAt.getTime(), config.TRADES_PER_CYCLE);

    for (let i = 0; i < config.TRADES_PER_CYCLE; i += 1) {
      const side = i % 2 === 0 ? TradeSide.LONG : TradeSide.SHORT;
      const symbol = SYMBOLS[(i + parseInt(seed.slice(i, i + 2), 16)) % SYMBOLS.length];
      await this.trades.updateOne(
        { cycleId: cycle._id, sequence: i + 1 },
        { $setOnInsert: {
          cycleId: cycle._id,
          sequence: i + 1,
          exchange: 'BINANCE',
          symbol,
          side,
          timeframe: '5m',
          status: TradeStatus.PLANNED,
          executionMode: TradeExecutionMode.SIMULATED,
          targetPnlRate: toDecimal128(pnls[i]),
          scheduledOpenAt: new Date(cycle.startsAt.getTime() + times[i].openOffsetMs),
          scheduledCloseAt: new Date(cycle.startsAt.getTime() + times[i].closeOffsetMs),
          strategyVersion: 'sim-target-v1',
        } },
        { upsert: true },
      );
    }

    cycle.planSeed = seed;
    cycle.yieldRate = toDecimal128(yieldRate);
    cycle.plannedAt = new Date();
    await cycle.save();
    return cycle;
  }

  async advanceCycle(cycleId: Types.ObjectId, now = new Date()) {
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle || cycle.status !== CycleStatus.RUNNING) return;
    if (!cycle.planSeed || !cycle.yieldRate) await this.planCycle(cycle._id);

    const toOpen = await this.trades.find({ cycleId, status: TradeStatus.PLANNED, scheduledOpenAt: { $lte: now } }).sort({ sequence: 1 });
    for (const trade of toOpen) await this.openSimulatedTrade(trade, now);

    const toClose = await this.trades.find({ cycleId, status: TradeStatus.OPEN, scheduledCloseAt: { $lte: now } }).sort({ sequence: 1 });
    for (const trade of toClose) await this.closeSimulatedTrade(trade, now);
  }

  private async openSimulatedTrade(trade: UnifiedTradeDocument, now: Date) {
    const ref = await this.market.getPrice(trade.symbol);
    trade.marketReferenceOpenPrice = toDecimal128(ref.price);
    trade.entryPrice = toDecimal128(ref.price);
    trade.openedAt = now;
    trade.entrySnapshot = { source: ref.source, observedAt: ref.observedAt.toISOString(), marketPrice: ref.price.toFixed() };
    trade.entrySnapshotHash = null;
    trade.status = TradeStatus.OPEN;
    await trade.save();
  }

  private async closeSimulatedTrade(trade: UnifiedTradeDocument, now: Date) {
    if (!trade.entryPrice) throw new Error('Simulated trade has no entry price');
    const ref = await this.market.getPrice(trade.symbol);
    const targetPnl = fromDecimal128(trade.targetPnlRate);
    const entry = D(trade.entryPrice.toString());
    const syntheticExit = impliedExitPrice(trade.side as 'LONG' | 'SHORT', entry, targetPnl);
    trade.marketReferenceClosePrice = toDecimal128(ref.price);
    trade.exitPrice = toDecimal128(syntheticExit);
    trade.closedAt = now;
    trade.pnlRate = toDecimal128(targetPnl);
    trade.exitSnapshot = {
      source: ref.source,
      observedAt: ref.observedAt.toISOString(),
      marketReferencePrice: ref.price.toFixed(),
      simulatedExitPrice: syntheticExit.toFixed(),
      disclosure: 'SIMULATED_TARGET_ALLOCATION',
    };
    trade.status = TradeStatus.CLOSED;
    await trade.save();
  }
}
