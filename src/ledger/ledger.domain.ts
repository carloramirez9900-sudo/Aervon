import Decimal from 'decimal.js';
import { D, zero } from '../common/money';

export type LedgerSide = 'DEBIT' | 'CREDIT';

export interface LedgerPosting {
  accountId: string;
  side: LedgerSide;
  amount: Decimal;
}

export class UnbalancedLedgerTransactionError extends Error {}

export function assertBalanced(postings: LedgerPosting[]): void {
  const debit = postings
    .filter((p) => p.side === 'DEBIT')
    .reduce((sum, p) => sum.plus(p.amount), zero());
  const credit = postings
    .filter((p) => p.side === 'CREDIT')
    .reduce((sum, p) => sum.plus(p.amount), zero());

  if (!debit.eq(credit)) {
    throw new UnbalancedLedgerTransactionError(`Ledger transaction is unbalanced: debit=${debit.toString()} credit=${credit.toString()}`);
  }
  if (postings.some((p) => D(p.amount).lte(0))) {
    throw new Error('Ledger postings must be positive amounts');
  }
}
