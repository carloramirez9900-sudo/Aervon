import Decimal from 'decimal.js';
import { usdt } from '../common/money';

export function calculateReferralCommission(baseProfit: Decimal, commissionRate: Decimal): Decimal {
  if (baseProfit.lt(0)) throw new Error('Referral commission cannot be calculated from a loss');
  if (commissionRate.lt(0) || commissionRate.gt(1)) throw new Error('Invalid referral commission rate');
  return usdt(baseProfit.mul(commissionRate));
}
