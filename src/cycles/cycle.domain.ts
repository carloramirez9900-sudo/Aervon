import Decimal from 'decimal.js';
import { D, rate, usdt } from '../common/money';

export interface CycleRules {
  tradesPerCycle: number;
  minYieldRate: Decimal;
  maxYieldRate: Decimal;
  minimumPrincipalCycles: number;
}

export interface CompletedCycleInput {
  principal: Decimal;
  yieldRate: Decimal;
  completedPrincipalCyclesBefore: number;
}

export function validateYieldRate(value: Decimal, rules: CycleRules): void {
  if (value.lt(rules.minYieldRate) || value.gt(rules.maxYieldRate)) {
    throw new Error(`Yield rate ${value.toString()} is outside configured range`);
  }
}

export function calculateCycleProfit(input: CompletedCycleInput, rules: CycleRules) {
  validateYieldRate(input.yieldRate, rules);
  const profit = usdt(input.principal.mul(input.yieldRate));
  const completedPrincipalCycles = input.completedPrincipalCyclesBefore + 1;
  return {
    profit,
    yieldRate: rate(input.yieldRate),
    completedPrincipalCycles,
    principalWithdrawalEligible: completedPrincipalCycles >= rules.minimumPrincipalCycles,
  };
}

export function nextCycleStart(activatedAt: Date, cycleHours = 24): Date {
  if (cycleHours !== 24) {
    return new Date(activatedAt.getTime() + cycleHours * 60 * 60 * 1000);
  }
  const next = new Date(activatedAt);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}

export function cycleWindow(startsAt: Date, hours = 24) {
  return { startsAt, endsAt: new Date(startsAt.getTime() + hours * 60 * 60 * 1000) };
}
