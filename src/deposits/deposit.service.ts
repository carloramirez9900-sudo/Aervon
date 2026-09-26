import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Model, Types } from 'mongoose';
import { fromDecimal128 } from '../database/decimal128';
import { BlockchainDeposit, BlockchainDepositDocument, DepositAddress, DepositAddressDocument, DepositStatus, WalletIndexCounter, WalletIndexCounterDocument } from '../database/schemas';
import { FundsService } from '../funds/funds.service';
import { WalletDerivationService } from './wallet-derivation.service';

@Injectable()
export class DepositService {
  constructor(
    @InjectModel(DepositAddress.name) private readonly addresses: Model<DepositAddressDocument>,
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(WalletIndexCounter.name) private readonly counters: Model<WalletIndexCounterDocument>,
    private readonly funds: FundsService,
    private readonly wallets: WalletDerivationService,
    private readonly config: ConfigService,
  ) {}

  async getOrCreateAddress(userId: Types.ObjectId) {
    const existing = await this.addresses.findOne({ userId });
    if (existing) return this.publicAddress(existing);
    const counter = await this.counters.findOneAndUpdate({ key: 'bsc-deposit' }, { $inc: { seq: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    const derivationIndex = counter.seq;
    try {
      const created = await this.addresses.create({ userId, derivationIndex, address: this.wallets.deriveAddress(derivationIndex), network: 'BSC', active: true });
      return this.publicAddress(created);
    } catch (e: any) {
      if (e?.code === 11000) {
        const found = await this.addresses.findOne({ userId });
        if (found) return this.publicAddress(found);
      }
      throw e;
    }
  }

  async listForUser(userId: Types.ObjectId) {
    const rows = await this.deposits.find({ userId }).sort({ createdAt: -1 }).limit(100);
    return rows.map(x => ({ id: x._id, txHash: x.txHash, amount: fromDecimal128(x.amount).toFixed(), status: x.status, blockNumber: x.blockNumber, creditedAt: x.creditedAt, sweptAt: x.sweptAt }));
  }

  async creditEligibleForUser(userId: Types.ObjectId): Promise<void> {
    const rows = await this.deposits.find({ userId, status: { $in: [DepositStatus.CONFIRMED, DepositStatus.BELOW_MINIMUM] } }).sort({ blockNumber: 1, logIndex: 1 });
    if (!rows.length) return;
    const total = rows.reduce((s, r) => s.plus(fromDecimal128(r.amount)), new Decimal(0));
    const min = new Decimal(this.config.get<string>('MIN_DEPOSIT_USDT') ?? '5');
    if (total.lt(min)) {
      await this.deposits.updateMany({ _id: { $in: rows.map(r => r._id) } }, { $set: { status: DepositStatus.BELOW_MINIMUM } });
      return;
    }
    for (const row of rows) {
      const amount = fromDecimal128(row.amount);
      await this.funds.creditConfirmedDeposit({ userId, amount, txHash: `${row.txHash}:${row.logIndex}`, network: 'BSC' });
      await this.deposits.updateOne({ _id: row._id, status: { $in: [DepositStatus.CONFIRMED, DepositStatus.BELOW_MINIMUM] } }, { $set: { status: DepositStatus.SWEEP_PENDING, creditedAt: new Date() } });
    }
  }

  private publicAddress(row: DepositAddressDocument) { return { address: row.address, network: 'BSC', asset: 'USDT', minDeposit: this.config.get<string>('MIN_DEPOSIT_USDT') ?? '5' }; }
}
