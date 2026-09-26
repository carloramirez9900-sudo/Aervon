import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import Decimal from 'decimal.js';
import { LedgerAccountType, LedgerDirection } from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';

@Injectable()
export class FundsService {
  constructor(private readonly ledger: LedgerService) {}

  async creditConfirmedDeposit(input: {
    userId: Types.ObjectId;
    amount: Decimal;
    txHash: string;
    network?: string;
  }) {
    if (input.amount.lte(0)) throw new Error('Deposit amount must be positive');
    return this.ledger.withTransaction(async (session) => {
      const treasury = await this.ledger.ensureAccount(null, LedgerAccountType.PLATFORM_TREASURY, session);
      const available = await this.ledger.ensureAccount(input.userId, LedgerAccountType.USER_AVAILABLE, session);
      return this.ledger.post({
        idempotencyKey: `deposit:${(input.network ?? 'BSC').toUpperCase()}:${input.txHash.toLowerCase()}`,
        eventType: 'DEPOSIT_CONFIRMED',
        referenceId: input.txHash,
        metadata: { network: (input.network ?? 'BSC').toUpperCase(), asset: 'USDT' },
        postings: [
          { accountId: treasury._id, side: LedgerDirection.DEBIT, amount: input.amount },
          { accountId: available._id, side: LedgerDirection.CREDIT, amount: input.amount },
        ],
      }, session);
    });
  }
}
