import { D } from '../src/common/money';
import { calculateCycleProfit, nextCycleStart } from '../src/cycles/cycle.domain';
import { calculateNextPrincipal } from '../src/investments/investment.domain';
import { assertBalanced } from '../src/ledger/ledger.domain';
import { calculatePaperTradePnlRate } from '../src/market/market.domain';
import { calculateReferralCommission } from '../src/referrals/referral.domain';
import { canWithdrawPrincipal, hasSufficientGas, hasSufficientWithdrawalLiquidity, requiredGasWeiWithMargin, validateWithdrawal } from '../src/withdrawals/withdrawal.domain';

describe('agreed product rules', () => {
  test('cycle profit uses one global yield rate and unlocks principal after 10 completed cycles', () => {
    const rules = { tradesPerCycle: 5, minYieldRate: D('0.035'), maxYieldRate: D('0.05'), minimumPrincipalCycles: 10 };
    const result = calculateCycleProfit({ principal: D('1000'), yieldRate: D('0.042'), completedPrincipalCyclesBefore: 9 }, rules);
    expect(result.profit.toString()).toBe('42');
    expect(result.completedPrincipalCycles).toBe(10);
    expect(result.principalWithdrawalEligible).toBe(true);
  });

  test('activation joins next UTC daily cycle', () => {
    expect(nextCycleStart(new Date('2026-09-22T18:34:00Z')).toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });

  test('compound is applied to next-cycle principal', () => {
    expect(calculateNextPrincipal(D('1000'), D('42')).toString()).toBe('1042');
  });

  test('direct referral commission is 3% of referred user profit', () => {
    expect(calculateReferralCommission(D('40'), D('0.03')).toString()).toBe('1.2');
  });

  test('withdrawal minimum is 10 USDT', () => {
    expect(validateWithdrawal({ amount: D('10'), availableBalance: D('25'), minimumWithdrawal: D('10') }).toString()).toBe('10');
    expect(() => validateWithdrawal({ amount: D('9.99'), availableBalance: D('25'), minimumWithdrawal: D('10') })).toThrow();
  });

  test('principal cannot be withdrawn until 10 cycles and no active cycle remains', () => {
    expect(canWithdrawPrincipal(9, 10, false)).toBe(false);
    expect(canWithdrawPrincipal(10, 10, true)).toBe(false);
    expect(canWithdrawPrincipal(10, 10, false)).toBe(true);
  });

  test('withdrawal worker only needs enough USDT and BNB for the concrete withdrawal', () => {
    expect(hasSufficientWithdrawalLiquidity(D('100'), D('100'))).toBe(true);
    expect(hasSufficientWithdrawalLiquidity(D('99.99'), D('100'))).toBe(false);
    expect(requiredGasWeiWithMargin(1000n, 1500n)).toBe(1150n);
    expect(hasSufficientGas(1150n, 1150n)).toBe(true);
    expect(hasSufficientGas(1149n, 1150n)).toBe(false);
  });

  test('paper trade pnl is calculated from actual entry and exit rather than forced to yield', () => {
    expect(calculatePaperTradePnlRate('LONG', '100', '101').toString()).toBe('0.01');
    expect(calculatePaperTradePnlRate('SHORT', '100', '99').toString()).toBe('0.01');
  });

  test('double-entry postings must balance', () => {
    expect(() => assertBalanced([
      { accountId: 'a', side: 'DEBIT', amount: D('100') },
      { accountId: 'b', side: 'CREDIT', amount: D('100') },
    ])).not.toThrow();
    expect(() => assertBalanced([
      { accountId: 'a', side: 'DEBIT', amount: D('100') },
      { accountId: 'b', side: 'CREDIT', amount: D('99') },
    ])).toThrow();
  });
});

import { assertProspectiveTrade } from '../src/market/market.domain';

describe('market audit timing', () => {
  test('entry snapshot must be observed at trade-open time', () => {
    const openedAt = new Date('2026-09-22T12:00:00.000Z');
    expect(() => assertProspectiveTrade(openedAt, new Date('2026-09-22T12:00:10.000Z'))).not.toThrow();
    expect(() => assertProspectiveTrade(openedAt, new Date('2026-09-22T12:01:00.000Z'))).toThrow();
  });
});
