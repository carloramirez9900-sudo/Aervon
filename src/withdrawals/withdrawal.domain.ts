import Decimal from 'decimal.js';
import { usdt } from '../common/money';

export interface WithdrawalRequestInput {
  amount: Decimal;
  availableBalance: Decimal;
  minimumWithdrawal: Decimal;
}

export function validateWithdrawal(input: WithdrawalRequestInput): Decimal {
  const amount = usdt(input.amount);
  if (amount.lt(input.minimumWithdrawal)) throw new Error('Withdrawal is below minimum');
  if (amount.gt(input.availableBalance)) throw new Error('Insufficient available balance');
  return amount;
}

export function canWithdrawPrincipal(completedCycles: number, minimumCycles: number, hasActiveCycle: boolean): boolean {
  return completedCycles >= minimumCycles && !hasActiveCycle;
}

export function hasSufficientWithdrawalLiquidity(walletUsdt: Decimal, withdrawalAmount: Decimal): boolean {
  return walletUsdt.gte(withdrawalAmount);
}

export function requiredGasWeiWithMargin(estimatedGasCostWei: bigint, marginBps: bigint): bigint {
  if (estimatedGasCostWei < 0n || marginBps < 0n) throw new Error('Gas values cannot be negative');
  return estimatedGasCostWei + ((estimatedGasCostWei * marginBps) / 10_000n);
}

export function hasSufficientGas(walletBnbWei: bigint, requiredWei: bigint): boolean {
  return walletBnbWei >= requiredWei;
}
