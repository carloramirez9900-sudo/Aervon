import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { getAddress, isAddress } from 'ethers';
import { Model, Types } from 'mongoose';
import { fromDecimal128, toDecimal128 } from '../database/decimal128';
import { LedgerAccountType, LedgerDirection, Withdrawal, WithdrawalDocument, WithdrawalStatus } from '../database/schemas';
import { LedgerService } from '../ledger/ledger.service';
import { validateWithdrawal } from './withdrawal.domain';
import { OperationalSettingsService } from '../config/operational-settings.service';

@Injectable()
export class WithdrawalService {
  constructor(
    @InjectModel(Withdrawal.name) private readonly withdrawals: Model<WithdrawalDocument>,
    private readonly ledger: LedgerService,
    private readonly config: ConfigService,
    private readonly operationalSettings: OperationalSettingsService,
  ) {}

  async request(userId: Types.ObjectId, input: { amount: string; destination: string; idempotencyKey?: string }) {
    if (await this.operationalSettings.isPaused('withdrawalsPaused')) throw new BadRequestException('Withdrawals are temporarily paused');
    const destination = input.destination?.trim();
    if (!destination || !isAddress(destination)) throw new BadRequestException('Invalid BEP-20 destination address');
    const normalizedDestination = getAddress(destination).toLowerCase();
    const treasury = this.config.get<string>('BSC_TREASURY_ADDRESS')?.toLowerCase();
    const hotWallet = this.config.get<string>('BSC_WITHDRAWAL_ADDRESS')?.toLowerCase();
    if (normalizedDestination === treasury || normalizedDestination === hotWallet) {
      throw new BadRequestException('Destination cannot be a platform wallet');
    }
    let amount: Decimal;
    try { amount = new Decimal(input.amount ?? '0'); } catch { throw new BadRequestException('Invalid withdrawal amount'); }
    if (!amount.isFinite() || amount.lte(0)) throw new BadRequestException('Invalid withdrawal amount');
    const min = new Decimal(this.config.get<string>('MIN_WITHDRAWAL_USDT') ?? '10');

    const existing = input.idempotencyKey ? await this.withdrawals.findOne({ userId, idempotencyKey: input.idempotencyKey }) : null;
    if (existing) return this.toPublic(existing);

    return this.ledger.withTransaction(async (session) => {
      const availableAccount = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_AVAILABLE, session);
      const pendingAccount = await this.ledger.ensureAccount(userId, LedgerAccountType.USER_WITHDRAWAL_PENDING, session);
      const available = await this.ledger.getBalanceByAccount(availableAccount, session);
      const validated = validateWithdrawal({ amount, availableBalance: available, minimumWithdrawal: min });

      const idempotencyKey = input.idempotencyKey?.trim() || `withdrawal:${userId.toHexString()}:${new Types.ObjectId().toHexString()}`;
      let row: WithdrawalDocument;
      try {
        [row] = await this.withdrawals.create([{
          userId,
          amount: toDecimal128(validated),
          destination: normalizedDestination,
          network: 'BSC',
          asset: 'USDT',
          status: WithdrawalStatus.RESERVED,
          idempotencyKey,
          requestedAt: new Date(),
          reservedAt: new Date(),
        }], { session });
      } catch (error: any) {
        if (error?.code === 11000) {
          const found = await this.withdrawals.findOne({ userId, idempotencyKey }).session(session);
          if (found) return this.toPublic(found);
        }
        throw error;
      }

      await this.ledger.transfer({
        idempotencyKey: `withdrawal-reserve:${row._id.toHexString()}`,
        eventType: 'WITHDRAWAL_RESERVED',
        fromAccount: availableAccount,
        toAccount: pendingAccount,
        amount: validated,
        referenceId: row._id.toHexString(),
        metadata: { destination: normalizedDestination, network: 'BSC', asset: 'USDT' },
      }, session);

      row.status = WithdrawalStatus.QUEUED;
      await row.save({ session });
      return this.toPublic(row);
    });
  }

  async list(userId: Types.ObjectId) {
    const rows = await this.withdrawals.find({ userId }).sort({ requestedAt: -1 }).limit(100);
    return rows.map((row) => this.toPublic(row));
  }

  async get(userId: Types.ObjectId, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const row = await this.withdrawals.findOne({ _id: new Types.ObjectId(id), userId });
    if (!row) throw new NotFoundException();
    return this.toPublic(row);
  }

  async releaseReservation(row: WithdrawalDocument, reason: string): Promise<void> {
    await this.ledger.withTransaction(async (session) => {
      const current = await this.withdrawals.findById(row._id).session(session);
      if (!current || [WithdrawalStatus.CONFIRMED, WithdrawalStatus.CANCELLED].includes(current.status)) return;
      const pending = await this.ledger.ensureAccount(current.userId, LedgerAccountType.USER_WITHDRAWAL_PENDING, session);
      const available = await this.ledger.ensureAccount(current.userId, LedgerAccountType.USER_AVAILABLE, session);
      await this.ledger.transfer({
        idempotencyKey: `withdrawal-release:${current._id.toHexString()}`,
        eventType: 'WITHDRAWAL_RELEASED',
        fromAccount: pending,
        toAccount: available,
        amount: fromDecimal128(current.amount),
        referenceId: current._id.toHexString(),
        metadata: { reason },
      }, session);
      current.status = WithdrawalStatus.FAILED;
      current.failureReason = reason;
      current.processingLeaseUntil = null;
      await current.save({ session });
    });
  }

  async finalizeConfirmed(rowId: Types.ObjectId, txHash: string, blockNumber: number): Promise<void> {
    await this.ledger.withTransaction(async (session) => {
      const row = await this.withdrawals.findById(rowId).session(session);
      if (!row || row.status === WithdrawalStatus.CONFIRMED) return;
      const pending = await this.ledger.ensureAccount(row.userId, LedgerAccountType.USER_WITHDRAWAL_PENDING, session);
      const treasury = await this.ledger.ensureAccount(null, LedgerAccountType.PLATFORM_TREASURY, session);
      const amount = fromDecimal128(row.amount);
      await this.ledger.post({
        idempotencyKey: `withdrawal-confirm:${row._id.toHexString()}`,
        eventType: 'WITHDRAWAL_CONFIRMED',
        referenceId: row._id.toHexString(),
        metadata: { txHash, blockNumber, network: 'BSC', asset: 'USDT' },
        postings: [
          { accountId: pending._id, side: LedgerDirection.DEBIT, amount },
          { accountId: treasury._id, side: LedgerDirection.CREDIT, amount },
        ],
      }, session);
      row.status = WithdrawalStatus.CONFIRMED;
      row.txHash = txHash.toLowerCase();
      row.blockNumber = blockNumber;
      row.confirmedAt = new Date();
      row.processingLeaseUntil = null;
      await row.save({ session });
    });
  }

  toPublic(row: WithdrawalDocument) {
    return {
      id: row._id.toHexString(),
      amount: fromDecimal128(row.amount).toFixed(),
      network: row.network,
      asset: row.asset,
      destination: row.destination,
      status: row.status,
      txHash: row.txHash,
      failureReason: row.failureReason,
      requestedAt: row.requestedAt,
      broadcastedAt: row.broadcastedAt,
      confirmedAt: row.confirmedAt,
    };
  }
}
