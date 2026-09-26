import Decimal from 'decimal.js';
import { usdt } from '../common/money';

export interface ActivationInput {
  availableBalance: Decimal;
  requestedPrincipal: Decimal;
  minimumDeposit: Decimal;
}

export function validateActivation(input: ActivationInput): Decimal {
  const principal = usdt(input.requestedPrincipal);
  if (principal.lt(input.minimumDeposit)) throw new Error('Principal is below minimum deposit');
  if (principal.gt(input.availableBalance)) throw new Error('Insufficient available balance');
  return principal;
}

export function calculateNextPrincipal(activePrincipal: Decimal, pendingCompound: Decimal): Decimal {
  if (pendingCompound.lt(0)) throw new Error('Pending compound cannot be negative');
  return usdt(activePrincipal.plus(pendingCompound));
}
