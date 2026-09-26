import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Contract, Interface, JsonRpcProvider, id, zeroPadValue } from 'ethers';
import Decimal from 'decimal.js';
import { Model } from 'mongoose';
import { BlockchainDeposit, BlockchainDepositDocument, ChainCursor, ChainCursorDocument, DepositAddress, DepositAddressDocument, DepositStatus } from '../database/schemas';
import { toDecimal128 } from '../database/decimal128';
import { DepositService } from './deposit.service';
import { OperationalSettingsService } from '../config/operational-settings.service';

const ERC20_ABI = ['event Transfer(address indexed from,address indexed to,uint256 value)', 'function decimals() view returns (uint8)'];
@Injectable()
export class DepositMonitorService {
  private readonly log = new Logger(DepositMonitorService.name);
  private provider?: JsonRpcProvider;
  constructor(
    @InjectModel(DepositAddress.name) private readonly addresses: Model<DepositAddressDocument>,
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(ChainCursor.name) private readonly cursors: Model<ChainCursorDocument>,
    private readonly config: ConfigService,
    private readonly depositService: DepositService,
    private readonly operationalSettings: OperationalSettingsService,
  ) {}
  private rpc() { if (!this.provider) this.provider = new JsonRpcProvider(this.config.getOrThrow<string>('BSC_RPC_URL'), 56); return this.provider; }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async scan(): Promise<void> {
    if (await this.operationalSettings.isPaused('depositsPaused')) return;
    const token = this.config.get<string>('BSC_USDT_CONTRACT'); if (!token) return;
    const active = await this.addresses.find({ active: true }).select('address userId').lean(); if (!active.length) return;
    const provider = this.rpc(); const latest = await provider.getBlockNumber();
    let cursor = await this.cursors.findOne({ key: 'bsc-usdt-deposits' });
    if (!cursor) {
      const configured = Number(this.config.get<string>('BSC_DEPOSIT_START_BLOCK') ?? 0);
      cursor = await this.cursors.create({ key: 'bsc-usdt-deposits', lastScannedBlock: configured > 0 ? configured - 1 : Math.max(0, latest - 5) });
    }
    if (cursor.lastScannedBlock >= latest) return;
    const fromBlock = cursor.lastScannedBlock + 1; const toBlock = Math.min(latest, fromBlock + 1999);
    const iface = new Interface(ERC20_ABI); const transferTopic = id('Transfer(address,address,uint256)');
    const map = new Map(active.map(a => [a.address.toLowerCase(), a]));
    for (let i=0;i<active.length;i+=50) {
      const batch = active.slice(i,i+50);
      const topics = [transferTopic, null, batch.map(a => zeroPadValue(a.address, 32))] as any;
      const logs = await provider.getLogs({ address: token, fromBlock, toBlock, topics });
      const decimals = Number(await new Contract(token, ERC20_ABI, provider).decimals());
      for (const l of logs) {
        const parsed = iface.parseLog(l); if (!parsed) continue;
        const to = String(parsed.args.to).toLowerCase(); const target = map.get(to); if (!target) continue;
        const amount = new Decimal(parsed.args.value.toString()).div(new Decimal(10).pow(decimals));
        await this.deposits.updateOne({ txHash: l.transactionHash.toLowerCase(), logIndex: l.index }, { $setOnInsert: { userId: target.userId, depositAddressId: target._id, toAddress: to, fromAddress: String(parsed.args.from).toLowerCase(), txHash: l.transactionHash.toLowerCase(), logIndex: l.index, blockNumber: l.blockNumber, blockHash: l.blockHash.toLowerCase(), amount: toDecimal128(amount), asset: 'USDT', network: 'BSC', status: DepositStatus.CONFIRMING } }, { upsert: true });
      }
    }
    cursor.lastScannedBlock = toBlock; await cursor.save();
  }

  @Cron(CronExpression.EVERY_10_SECONDS)
  async confirm(): Promise<void> {
    if (await this.operationalSettings.isPaused('depositsPaused')) return;
    const required = Number(this.config.get<string>('BSC_REQUIRED_CONFIRMATIONS') ?? 12); const latest = await this.rpc().getBlockNumber();
    const rows = await this.deposits.find({ status: DepositStatus.CONFIRMING, blockNumber: { $lte: latest - required + 1 } }).limit(200);
    for (const row of rows) {
      const receipt = await this.rpc().getTransactionReceipt(row.txHash);
      if (!receipt || receipt.blockHash.toLowerCase() !== row.blockHash) { row.status = DepositStatus.REORGED; await row.save(); continue; }
      row.status = DepositStatus.CONFIRMED; row.confirmedAt = new Date(); await row.save(); await this.depositService.creditEligibleForUser(row.userId);
    }
  }
}
