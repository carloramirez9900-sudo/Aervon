import Decimal from 'decimal.js';
import { distributeTargetYield, impliedExitPrice, planTradeTimes } from '../src/cycles/simulation.domain';

describe('simulated cycle rules', () => {
  it('reconciles 5 PnLs exactly to the target', () => {
    const target = new Decimal('0.0427');
    const values = distributeTargetYield('abc123', target, 5);
    expect(values).toHaveLength(5);
    expect(values.reduce((a, b) => a.plus(b), new Decimal(0)).eq(target)).toBe(true);
    expect(values.some(v => v.lt(0))).toBe(true);
    expect(values.some(v => v.gt(0))).toBe(true);
  });

  it('plans all trades inside the cycle', () => {
    const cycleMs = 24 * 60 * 60 * 1000;
    const times = planTradeTimes('abc123', cycleMs, 5);
    expect(times).toHaveLength(5);
    for (const t of times) {
      expect(t.openOffsetMs).toBeGreaterThanOrEqual(0);
      expect(t.closeOffsetMs).toBeGreaterThan(t.openOffsetMs);
      expect(t.closeOffsetMs).toBeLessThan(cycleMs);
    }
  });

  it('creates an implied exit consistent with target PnL', () => {
    expect(impliedExitPrice('LONG', new Decimal(100), new Decimal('0.01')).eq(101)).toBe(true);
    expect(impliedExitPrice('SHORT', new Decimal(100), new Decimal('0.01')).eq(99)).toBe(true);
  });
});
