import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { D, zero } from '../common/money';
import { fromDecimal128, toDecimal128 } from '../database/decimal128';
import {
  LedgerAccount,
  LedgerAccountDocument,
  LedgerAccountType,
  LedgerDirection,
  LedgerEntry,
  LedgerEntryDocument,
  LedgerTransaction,
  LedgerTransactionDocument,
} from '../database/schemas';
import { assertBalanced, LedgerPosting } from './ledger.domain';

const CREDIT_NATURAL = new Set<LedgerAccountType>([
  LedgerAccountType.USER_AVAILABLE,
  LedgerAccountType.USER_ACTIVE_PRINCIPAL,
  LedgerAccountType.USER_PENDING_COMPOUND,
  LedgerAccountType.USER_WITHDRAWAL_PENDING,
]);

export interface AccountPosting {
  accountId: Types.ObjectId;
  side: LedgerDirection;
  amount: Decimal;
}

@Injectable()
export class LedgerService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(LedgerAccount.name) private readonly accounts: Model<LedgerAccountDocument>,
    @InjectModel(LedgerTransaction.name) private readonly transactions: Model<LedgerTransactionDocument>,
    @InjectModel(LedgerEntry.name) private readonly entries: Model<LedgerEntryDocument>,
  ) {}

  async withTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const session = await this.connection.startSession();
    try {
      let result!: T;
      await session.withTransaction(async () => {
        result = await work(session);
      }, {
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });
      return result;
    } finally {
      await session.endSession();
    }
  }

  async ensureAccount(
    userId: Types.ObjectId | null,
    type: LedgerAccountType,
    session?: ClientSession,
  ): Promise<LedgerAccountDocument> {
    const existing = await this.accounts.findOne({ userId, type, currency: 'USDT' }).session(session ?? null);
    if (existing) return existing;

    try {
      const [created] = await this.accounts.create([{ userId, type, currency: 'USDT' }], { session });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        const found = await this.accounts.findOne({ userId, type, currency: 'USDT' }).session(session ?? null);
        if (found) return found;
      }
      throw error;
    }
  }

  async post(
    input: {
      idempotencyKey: string;
      eventType: string;
      referenceId?: string | null;
      metadata?: Record<string, unknown> | null;
      postings: AccountPosting[];
    },
    session: ClientSession,
  ): Promise<LedgerTransactionDocument> {
    const existing = await this.transactions.findOne({ idempotencyKey: input.idempotencyKey }).session(session);
    if (existing) return existing;

    const domainPostings: LedgerPosting[] = input.postings.map((posting) => ({
      accountId: posting.accountId.toHexString(),
      side: posting.side,
      amount: posting.amount,
    }));
    assertBalanced(domainPostings);

    const [transaction] = await this.transactions.create([{
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      referenceId: input.referenceId ?? null,
      metadata: input.metadata ?? null,
    }], { session });

    await this.entries.insertMany(input.postings.map((posting) => ({
      transactionId: transaction._id,
      accountId: posting.accountId,
      direction: posting.side,
      amount: toDecimal128(posting.amount),
    })), { session });

    return transaction;
  }

  async transfer(
    input: {
      idempotencyKey: string;
      eventType: string;
      fromAccount: LedgerAccountDocument;
      toAccount: LedgerAccountDocument;
      amount: Decimal;
      referenceId?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    session: ClientSession,
  ): Promise<LedgerTransactionDocument> {
    return this.post({
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      referenceId: input.referenceId,
      metadata: input.metadata,
      postings: [
        { accountId: input.fromAccount._id, side: this.decreaseSide(input.fromAccount.type), amount: input.amount },
        { accountId: input.toAccount._id, side: this.increaseSide(input.toAccount.type), amount: input.amount },
      ],
    }, session);
  }

  async getBalanceByAccount(account: LedgerAccountDocument, session?: ClientSession): Promise<Decimal> {
    const rows = await this.entries.aggregate<{
      _id: LedgerDirection;
      total: Types.Decimal128;
    }>([
      { $match: { accountId: account._id } },
      { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ]).session(session ?? null);

    let debit = zero();
    let credit = zero();
    for (const row of rows) {
      if (row._id === LedgerDirection.DEBIT) debit = fromDecimal128(row.total);
      if (row._id === LedgerDirection.CREDIT) credit = fromDecimal128(row.total);
    }
    return CREDIT_NATURAL.has(account.type) ? credit.minus(debit) : debit.minus(credit);
  }

  async getUserBalance(userId: Types.ObjectId, type: LedgerAccountType, session?: ClientSession): Promise<Decimal> {
    const account = await this.ensureAccount(userId, type, session);
    return this.getBalanceByAccount(account, session);
  }

  private increaseSide(type: LedgerAccountType): LedgerDirection {
    return CREDIT_NATURAL.has(type) ? LedgerDirection.CREDIT : LedgerDirection.DEBIT;
  }

  private decreaseSide(type: LedgerAccountType): LedgerDirection {
    return CREDIT_NATURAL.has(type) ? LedgerDirection.DEBIT : LedgerDirection.CREDIT;
  }
}
