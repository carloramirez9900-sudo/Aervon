import { createHash } from 'node:crypto';
import Decimal from 'decimal.js';
import { D, rate } from '../common/money';

export interface MarketSnapshot {
  exchange: string;
  symbol: string;
  timeframe: string;
  observedAt: string;
  candleOpenTime: string;
  candleCloseTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export function snapshotHash(snapshot: MarketSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export function calculatePaperTradePnlRate(side: 'LONG' | 'SHORT', entry: Decimal.Value, exit: Decimal.Value): Decimal {
  const e = D(entry);
  const x = D(exit);
  if (e.lte(0) || x.lte(0)) throw new Error('Prices must be positive');
  const raw = side === 'LONG' ? x.minus(e).div(e) : e.minus(x).div(e);
  return rate(raw);
}

/**
 * Market trades are paper/representative trades captured prospectively from real market data.
 * They must never be retroactively fabricated to match the product yield credited by the ledger.
 */
export function assertProspectiveTrade(openedAt: Date, snapshotObservedAt: Date): void {
  const deltaMs = Math.abs(snapshotObservedAt.getTime() - openedAt.getTime());
  if (deltaMs > 15_000) {
    throw new Error('Entry snapshot must be observed within 15 seconds of the trade open timestamp');
  }
}
