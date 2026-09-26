import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { randomUUID } from 'crypto';
import { Model } from 'mongoose';
import { fromDecimal128 } from '../database/decimal128';
import {
  Withdrawal,
  WithdrawalDocument,
  WithdrawalSignerLock,
  WithdrawalSignerLockDocument,
  WithdrawalStatus,
} from '../database/schemas';
import { WithdrawalChainService } from './withdrawal-chain.service';
import { hasSufficientGas, hasSufficientWithdrawalLiquidity } from './withdrawal.domain';
import { WithdrawalService } from './withdrawal.service';
import { OperationalSettingsService } from '../config/operational-settings.service';

const CLAIMABLE = [WithdrawalStatus.QUEUED, WithdrawalStatus.WAITING_LIQUIDITY, WithdrawalStatus.WAITING_GAS];
const SIGNER_LOCK_KEY = 'bsc-usdt-withdrawal-signer';

@Injectable()
export class WithdrawalWorkerService {
  private readonly logger = new Logger(WithdrawalWorkerService.name);
  private readonly owner = randomUUID();
  private running = false;

  constructor(
    @InjectModel(Withdrawal.name) private readonly withdrawals: Model<WithdrawalDocument>,
    @InjectModel(WithdrawalSignerLock.name) private readonly signerLocks: Model<WithdrawalSignerLockDocument>,
    private readonly chain: WithdrawalChainService,
    private readonly service: WithdrawalService,
    private readonly config: ConfigService,
    private readonly operationalSettings: OperationalSettingsService,
  ) {}

  @Cron('*/10 * * * * *')
  async tick() {
    if (this.running || process.env.NODE_ENV === 'test') return;
    if (await this.operationalSettings.isPaused('withdrawalsPaused')) return;
    this.running = true;
    try {
      await this.confirmBroadcasted();
      if (!(await this.acquireSignerLock())) return;
      try {
        await this.resumeSigned();
        const row = await this.claimNext();
        if (row) await this.process(row);
      } finally {
        await this.releaseSignerLock();
      }
    } catch (error: any) {
      this.logger.error(error?.stack ?? error?.message ?? String(error));
    } finally {
      this.running = false;
    }
  }

  private async acquireSignerLock(): Promise<boolean> {
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + 90_000);
    const updated = await this.signerLocks.findOneAndUpdate(
      { key: SIGNER_LOCK_KEY, $or: [{ leaseUntil: { $lt: now } }, { owner: this.owner }] },
      { $set: { owner: this.owner, leaseUntil } },
      { new: true },
    );
    if (updated) return true;
    try {
      await this.signerLocks.create({ key: SIGNER_LOCK_KEY, owner: this.owner, leaseUntil });
      return true;
    } catch (error: any) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  private async releaseSignerLock() {
    await this.signerLocks.updateOne({ key: SIGNER_LOCK_KEY, owner: this.owner }, { $set: { leaseUntil: new Date(0) } });
  }

  private async claimNext(): Promise<WithdrawalDocument | null> {
    const now = new Date();
    const lease = new Date(now.getTime() + 60_000);
    return this.withdrawals.findOneAndUpdate(
      {
        status: { $in: CLAIMABLE },
        $or: [{ processingLeaseUntil: null }, { processingLeaseUntil: { $lt: now } }],
      },
      { $set: { status: WithdrawalStatus.PROCESSING, processingLeaseUntil: lease }, $inc: { attempts: 1 } },
      { sort: { requestedAt: 1 }, new: true },
    ).select('+signedTransaction');
  }

  private async process(row: WithdrawalDocument) {
    const amount = fromDecimal128(row.amount);
    try {
      const balances = await this.chain.balances();
      if (!hasSufficientWithdrawalLiquidity(balances.usdt, amount)) {
        await this.setWaiting(row, WithdrawalStatus.WAITING_LIQUIDITY, 'Insufficient operational USDT liquidity');
        return;
      }

      const prepared = await this.chain.prepare(amount, row.destination);
      if (!hasSufficientGas(balances.bnbWei, prepared.requiredWeiWithMargin)) {
        await this.withdrawals.updateOne({ _id: row._id }, {
          $set: {
            status: WithdrawalStatus.WAITING_GAS,
            failureReason: 'Insufficient BNB for estimated gas',
            gasLimit: prepared.gasLimit.toString(),
            gasPriceWei: prepared.gasPriceWei.toString(),
            estimatedGasCostWei: prepared.estimatedCostWei.toString(),
            processingLeaseUntil: null,
          },
        });
        return;
      }

      await this.withdrawals.updateOne({ _id: row._id }, {
        $set: {
          status: WithdrawalStatus.SIGNED,
          txHash: prepared.txHash,
          nonce: prepared.nonce,
          signedTransaction: prepared.signedTransaction,
          gasLimit: prepared.gasLimit.toString(),
          gasPriceWei: prepared.gasPriceWei.toString(),
          estimatedGasCostWei: prepared.estimatedCostWei.toString(),
          failureReason: null,
          processingLeaseUntil: null,
        },
      });
      await this.broadcastPrepared(row._id.toHexString(), prepared.signedTransaction, prepared.txHash);
    } catch (error: any) {
      const message = error?.shortMessage ?? error?.message ?? 'Withdrawal processing error';
      await this.withdrawals.updateOne({ _id: row._id, status: WithdrawalStatus.PROCESSING }, {
        $set: { status: WithdrawalStatus.QUEUED, failureReason: message.slice(0, 500), processingLeaseUntil: null },
      });
    }
  }

  private async resumeSigned() {
    const rows = await this.withdrawals.find({ status: WithdrawalStatus.SIGNED }).select('+signedTransaction').sort({ requestedAt: 1 }).limit(10);
    for (const row of rows) {
      if (!row.signedTransaction || !row.txHash) {
        // Do not release funds automatically here: if persistence is inconsistent we cannot prove
        // that an on-chain broadcast never happened. Preserve the reservation and require review.
        await this.withdrawals.updateOne(
          { _id: row._id, status: WithdrawalStatus.SIGNED },
          { $set: { status: WithdrawalStatus.SECURITY_HOLD, failureReason: 'Signed withdrawal payload is incomplete; manual reconciliation required', processingLeaseUntil: null } },
        );
        continue;
      }
      await this.broadcastPrepared(row._id.toHexString(), row.signedTransaction, row.txHash);
    }
  }

  private async broadcastPrepared(id: string, signedTransaction: string, expectedHash: string) {
    try {
      const sent = await this.chain.broadcastSigned(signedTransaction);
      if (sent.hash !== expectedHash.toLowerCase()) throw new Error('Broadcast hash does not match prepared transaction hash');
      await this.withdrawals.updateOne({ _id: id, status: { $in: [WithdrawalStatus.SIGNED, WithdrawalStatus.BROADCASTED] } }, {
        $set: { status: WithdrawalStatus.BROADCASTED, broadcastedAt: new Date(), failureReason: null },
      });
    } catch (error: any) {
      const message = error?.shortMessage ?? error?.message ?? String(error);
      // "already known" or nonce-related errors can mean the exact signed transaction is already in the mempool.
      // Keep it as BROADCASTED and let receipt reconciliation determine the final state.
      if (/already known|known transaction|nonce too low/i.test(message)) {
        await this.withdrawals.updateOne({ _id: id }, { $set: { status: WithdrawalStatus.BROADCASTED, broadcastedAt: new Date(), failureReason: null } });
        return;
      }
      await this.withdrawals.updateOne({ _id: id }, { $set: { status: WithdrawalStatus.SIGNED, failureReason: message.slice(0, 500) } });
    }
  }

  private async confirmBroadcasted() {
    const rows = await this.withdrawals.find({ status: { $in: [WithdrawalStatus.BROADCASTED, WithdrawalStatus.CONFIRMING] }, txHash: { $ne: null } }).sort({ broadcastedAt: 1 }).limit(25);
    for (const row of rows) {
      try {
        const result = await this.chain.receiptWithConfirmations(row.txHash!);
        const receipt = result.receipt;
        if (!receipt) {
          if (row.status !== WithdrawalStatus.CONFIRMING) await this.withdrawals.updateOne({ _id: row._id }, { $set: { status: WithdrawalStatus.CONFIRMING } });
          continue;
        }
        if (receipt.status === 1) {
          const required = Number(this.config.get<string>('BSC_WITHDRAWAL_CONFIRMATIONS') ?? this.config.get<string>('BSC_REQUIRED_CONFIRMATIONS') ?? '12');
          if (result.confirmations < required) {
            if (row.status !== WithdrawalStatus.CONFIRMING) await this.withdrawals.updateOne({ _id: row._id }, { $set: { status: WithdrawalStatus.CONFIRMING } });
            continue;
          }
          await this.service.finalizeConfirmed(row._id, row.txHash!, receipt.blockNumber);
        } else {
          await this.service.releaseReservation(row, 'On-chain transaction reverted');
        }
      } catch (error: any) {
        this.logger.warn(`Confirmation check failed for ${row._id}: ${error?.message ?? error}`);
      }
    }
  }

  private async setWaiting(row: WithdrawalDocument, status: WithdrawalStatus, reason: string) {
    await this.withdrawals.updateOne({ _id: row._id }, { $set: { status, failureReason: reason, processingLeaseUntil: null } });
  }
}
