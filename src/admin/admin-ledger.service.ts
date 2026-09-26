import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { fromDecimal128 } from '../database/decimal128';
import { LedgerAccount, LedgerAccountDocument, LedgerAccountType, LedgerDirection, LedgerEntry, LedgerEntryDocument } from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';

const CREDIT_NATURAL = new Set<LedgerAccountType>([
  LedgerAccountType.USER_AVAILABLE,
  LedgerAccountType.USER_ACTIVE_PRINCIPAL,
  LedgerAccountType.USER_PENDING_COMPOUND,
  LedgerAccountType.USER_WITHDRAWAL_PENDING,
]);

@Injectable()
export class AdminLedgerService {
  constructor(
    @InjectModel(LedgerAccount.name) private readonly accounts: Model<LedgerAccountDocument>,
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntryDocument>,
    private readonly ledger: LedgerService,
  ) {}

  async aggregateType(type: LedgerAccountType): Promise<Decimal> {
    const ids = await this.accounts.find({ type, currency: 'USDT' }).distinct('_id');
    if (!ids.length) return new Decimal(0);
    const rows = await this.entries.aggregate<{ _id: LedgerDirection; total: Types.Decimal128 }>([
      { $match: { accountId: { $in: ids } } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ]);
    let debit = new Decimal(0), credit = new Decimal(0);
    for (const row of rows) {
      if (row._id === LedgerDirection.DEBIT) debit = fromDecimal128(row.total);
      if (row._id === LedgerDirection.CREDIT) credit = fromDecimal128(row.total);
    }
    return CREDIT_NATURAL.has(type) ? credit.minus(debit) : debit.minus(credit);
  }

  async userBalances(userId: Types.ObjectId) {
    const types = [
      LedgerAccountType.USER_AVAILABLE,
      LedgerAccountType.USER_ACTIVE_PRINCIPAL,
      LedgerAccountType.USER_PENDING_COMPOUND,
      LedgerAccountType.USER_WITHDRAWAL_PENDING,
    ];
    const result: Record<string, string> = {};
    for (const type of types) result[type] = (await this.ledger.getUserBalance(userId, type)).toFixed();
    return result;
  }

  async adminAdjust(input: { userId: Types.ObjectId; amount: Decimal; direction: 'CREDIT' | 'DEBIT'; reason: string; idempotencyKey: string }) {
    if (!input.amount.isFinite() || input.amount.lte(0)) throw new BadRequestException('Adjustment amount must be positive');
    return this.ledger.withTransaction(async (session) => {
      const treasury = await this.ledger.ensureAccount(null, LedgerAccountType.PLATFORM_TREASURY, session);
      const available = await this.ledger.ensureAccount(input.userId, LedgerAccountType.USER_AVAILABLE, session);
      if (input.direction === 'DEBIT') {
        const balance = await this.ledger.getBalanceByAccount(available, session);
        if (balance.lt(input.amount)) throw new BadRequestException('Adjustment would make user available balance negative');
      }
      return this.ledger.post({
        idempotencyKey: input.idempotencyKey,
        eventType: 'ADMIN_ADJUSTMENT',
        referenceId: input.userId.toHexString(),
        metadata: { reason: input.reason, direction: input.direction },
        postings: input.direction === 'CREDIT'
          ? [
              { accountId: treasury._id, side: LedgerDirection.DEBIT, amount: input.amount },
              { accountId: available._id, side: LedgerDirection.CREDIT, amount: input.amount },
            ]
          : [
              { accountId: available._id, side: LedgerDirection.DEBIT, amount: input.amount },
              { accountId: treasury._id, side: LedgerDirection.CREDIT, amount: input.amount },
            ],
      }, session);
    });
  }
}
