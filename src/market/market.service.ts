import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { toDecimal128 } from '../database/decimal128';
import {
  CycleStatus,
  TradeSide,
  TradeStatus,
  TradingCycle,
  TradingCycleDocument,
  UnifiedTrade,
  UnifiedTradeDocument,
} from '../database/schemas';
import { D } from '../common/money';
import { assertProspectiveTrade, calculatePaperTradePnlRate, MarketSnapshot, snapshotHash } from './market.domain';

@Injectable()
export class MarketTradeService {
  constructor(
    @InjectModel(TradingCycle.name) private readonly cycles: Model<TradingCycleDocument>,
    @InjectModel(UnifiedTrade.name) private readonly trades: Model<UnifiedTradeDocument>,
  ) {}

  async openTrade(input: {
    cycleId: Types.ObjectId;
    sequence: number;
    side: TradeSide;
    snapshot: MarketSnapshot;
    openedAt: Date;
    strategyVersion: string;
  }) {
    const cycle = await this.cycles.findById(input.cycleId);
    if (!cycle || cycle.status !== CycleStatus.RUNNING) throw new Error('Trade requires a running cycle');
    if (input.sequence < 1 || input.sequence > cycle.expectedTradeCount) throw new Error('Invalid trade sequence');
    if (input.snapshot.exchange.trim().length === 0 || input.snapshot.symbol.trim().length === 0) throw new Error('Invalid market snapshot');

    const observedAt = new Date(input.snapshot.observedAt);
    if (Number.isNaN(observedAt.getTime())) throw new Error('Invalid snapshot observedAt');
    assertProspectiveTrade(input.openedAt, observedAt);

    const entry = D(input.snapshot.close);
    if (entry.lte(0)) throw new Error('Entry price must be positive');

    return this.trades.findOneAndUpdate(
      { cycleId: input.cycleId, sequence: input.sequence },
      { $setOnInsert: {
        cycleId: input.cycleId,
        sequence: input.sequence,
        exchange: input.snapshot.exchange.toUpperCase(),
        symbol: input.snapshot.symbol.toUpperCase(),
        side: input.side,
        timeframe: input.snapshot.timeframe,
        status: TradeStatus.OPEN,
        entryPrice: toDecimal128(entry),
        openedAt: input.openedAt,
        entrySnapshot: input.snapshot,
        entrySnapshotHash: snapshotHash(input.snapshot),
        strategyVersion: input.strategyVersion,
      } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async closeTrade(input: {
    tradeId: Types.ObjectId;
    snapshot: MarketSnapshot;
    closedAt: Date;
  }) {
    const trade = await this.trades.findById(input.tradeId);
    if (!trade) throw new Error('Trade not found');
    if (trade.status === TradeStatus.CLOSED) return trade;
    if (trade.status !== TradeStatus.OPEN) throw new Error(`Trade cannot close from status ${trade.status}`);
    if (input.closedAt.getTime() < trade.openedAt.getTime()) throw new Error('Trade cannot close before it opened');
    if (input.snapshot.exchange.toUpperCase() !== trade.exchange || input.snapshot.symbol.toUpperCase() !== trade.symbol) {
      throw new Error('Exit snapshot must match the trade exchange and symbol');
    }

    const exit = D(input.snapshot.close);
    if (!trade.entryPrice) throw new Error('Trade has no entry price');
    const entry = D(trade.entryPrice.toString());
    const pnlRate = calculatePaperTradePnlRate(trade.side as 'LONG' | 'SHORT', entry, exit);

    trade.exitPrice = toDecimal128(exit);
    trade.closedAt = input.closedAt;
    trade.pnlRate = toDecimal128(pnlRate);
    trade.exitSnapshot = input.snapshot;
    trade.exitSnapshotHash = snapshotHash(input.snapshot);
    trade.status = TradeStatus.CLOSED;
    return trade.save();
  }
}
