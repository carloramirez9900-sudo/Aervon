import { createHash, randomBytes } from 'node:crypto';
import Decimal from 'decimal.js';
import { D, rate } from '../common/money';

export interface PlannedTradeSlice {
  sequence: number;
  pnlRate: Decimal;
  openOffsetMs: number;
  closeOffsetMs: number;
}

function unit(seed: string, label: string): number {
  const hex = createHash('sha256').update(`${seed}:${label}`).digest('hex').slice(0, 13);
  return parseInt(hex, 16) / 0x1fffffffffffff;
}

export function newPlanSeed(): string {
  return randomBytes(24).toString('hex');
}

export function chooseYieldRate(seed: string, min: Decimal, max: Decimal): Decimal {
  if (min.gt(max)) throw new Error('Invalid yield range');
  const u = D(unit(seed, 'yield'));
  return rate(min.plus(max.minus(min).mul(u)));
}

/**
 * Produces exactly 5 simulated PnL slices whose sum equals targetYieldRate.
 * Losses are included for visual/analytical variety, but this is not exchange execution.
 */
export function distributeTargetYield(seed: string, targetYieldRate: Decimal, count = 5): Decimal[] {
  if (count !== 5) throw new Error('This product requires exactly 5 trades per cycle');
  const lossCount = 1 + Math.floor(unit(seed, 'loss-count') * 2); // 1..2
  const order = Array.from({ length: count }, (_, i) => i)
    .sort((a, b) => unit(seed, `order-${a}`) - unit(seed, `order-${b}`));
  const lossIndexes = new Set(order.slice(0, lossCount));

  const raw: Decimal[] = [];
  for (let i = 0; i < count; i += 1) {
    if (lossIndexes.has(i)) {
      raw.push(D(-0.0015).minus(D(unit(seed, `loss-${i}`)).mul(0.003))); // -0.15% .. -0.45%
    } else {
      raw.push(D(0.0035).plus(D(unit(seed, `win-${i}`)).mul(0.014))); // +0.35% .. +1.75% before reconciliation
    }
  }

  const positive = raw.filter((_, i) => !lossIndexes.has(i)).reduce((a, b) => a.plus(b), D(0));
  const negativeAbs = raw.filter((_, i) => lossIndexes.has(i)).reduce((a, b) => a.plus(b.abs()), D(0));
  const requiredPositive = targetYieldRate.plus(negativeAbs);
  const scale = requiredPositive.div(positive);
  const result = raw.map((value, i) => rate(lossIndexes.has(i) ? value : value.mul(scale)));

  const current = result.reduce((a, b) => a.plus(b), D(0));
  const diff = rate(targetYieldRate.minus(current));
  const adjustable = result.findIndex((v, i) => !lossIndexes.has(i) && v.plus(diff).gt(0));
  if (adjustable < 0) throw new Error('Unable to reconcile simulated PnL distribution');
  result[adjustable] = rate(result[adjustable].plus(diff));

  const finalSum = result.reduce((a, b) => a.plus(b), D(0));
  if (!finalSum.eq(targetYieldRate)) throw new Error('Simulated PnL distribution failed reconciliation');
  return result;
}

export function planTradeTimes(seed: string, cycleMs: number, count = 5): Array<{ openOffsetMs: number; closeOffsetMs: number }> {
  const slotMs = cycleMs / count;
  return Array.from({ length: count }, (_, i) => {
    const slotStart = i * slotMs;
    const openJitter = slotMs * (0.08 + unit(seed, `open-${i}`) * 0.38);
    const maxDuration = Math.min(slotMs * 1.25, cycleMs - (slotStart + openJitter) - 60_000);
    const minDuration = Math.min(12 * 60_000, Math.max(60_000, maxDuration * 0.2));
    const duration = minDuration + unit(seed, `duration-${i}`) * Math.max(0, maxDuration - minDuration);
    return {
      openOffsetMs: Math.floor(slotStart + openJitter),
      closeOffsetMs: Math.floor(slotStart + openJitter + duration),
    };
  });
}

export function impliedExitPrice(side: 'LONG' | 'SHORT', entryPrice: Decimal, pnlRate: Decimal): Decimal {
  if (entryPrice.lte(0)) throw new Error('Entry price must be positive');
  if (side === 'LONG') return entryPrice.mul(D(1).plus(pnlRate));
  return entryPrice.mul(D(1).minus(pnlRate));
}
