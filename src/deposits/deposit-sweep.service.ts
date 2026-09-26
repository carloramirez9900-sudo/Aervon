import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron } from '@nestjs/schedule';
import { randomUUID } from 'node:crypto';
import { Contract, Interface, JsonRpcProvider, Wallet, parseUnits, getAddress } from 'ethers';
import { Model, Types } from 'mongoose';
import { fromDecimal128 } from '../database/decimal128';
import { BlockchainDeposit, BlockchainDepositDocument, DepositAddress, DepositAddressDocument, DepositStatus } from '../database/schemas';
import { OperationalSettingsService } from '../config/operational-settings.service';
import { DepositSigningClientService } from './deposit-signing-client.service';

const ABI = ['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)','function transfer(address,uint256) returns (bool)','event Transfer(address indexed from,address indexed to,uint256 value)'];
const iface = new Interface(ABI);
const ELIGIBLE = [DepositStatus.SWEEP_PENDING, DepositStatus.SWEEP_FAILED];

@Injectable()
export class DepositSweepService {
  private readonly log = new Logger(DepositSweepService.name);
  private readonly owner = randomUUID();
  private provider?: JsonRpcProvider;
  private running = false;
  constructor(
    @InjectModel(BlockchainDeposit.name) private readonly deposits: Model<BlockchainDepositDocument>,
    @InjectModel(DepositAddress.name) private readonly addresses: Model<DepositAddressDocument>,
    private readonly config: ConfigService,
    private readonly signing: DepositSigningClientService,
    private readonly operationalSettings: OperationalSettingsService,
  ) {}
  private rpc() {
    if (!this.provider) this.provider = new JsonRpcProvider(this.config.getOrThrow<string>('BSC_RPC_URL'), 56);
    return this.provider;
  }

  @Cron('*/30 * * * * *')
  async sweep(): Promise<void> {
    if (this.running || process.env.NODE_ENV === 'test') return;
    if (await this.operationalSettings.isPaused('depositsPaused')) return;
    if (!this.config.get('BSC_SIGNER_INTERNAL_URL') || !this.config.get('BSC_SIGNER_SHARED_SECRET') ||
        !this.config.get('BSC_DEPOSIT_XPUB') || !this.config.get('BSC_GAS_WALLET_PRIVATE_KEY')) return;
    this.running = true;
    try {
      // Include unfinished batches even if all rows are SWEEP_PENDING, so a restart resumes a signed transaction.
      const pending = await this.deposits.distinct('depositAddressId', { status: { $in: ELIGIBLE } });
      for (const id of pending.slice(0, 20)) await this.processAddress(id);
    } finally { this.running = false; }
  }

  private async processAddress(id: Types.ObjectId): Promise<void> {
    const now = new Date();
    // MongoDB lease prevents competing sweep workers from signing concurrently for the same source address.
    let address = await this.addresses.findOneAndUpdate({
      _id: id,
      $or: [{ sweepLeaseUntil: null }, { sweepLeaseUntil: { $lt: now } }, { sweepOwner: this.owner }],
    }, { $set: { sweepOwner: this.owner, sweepLeaseUntil: new Date(now.getTime() + 240_000) } }, { new: true }).select('+sweepSignedTransaction');
    if (!address) return;
    try {
      const provider = this.rpc();
      if (address.sweepRequestId) {
        if (!address.sweepSignedTransaction || !address.sweepTxHash) {
          const batch = await this.deposits.find({ _id: { $in: address.sweepRowIds } });
          const token = new Contract(this.config.getOrThrow<string>('BSC_USDT_CONTRACT'), ABI, provider);
          const decimals = Number(await token.decimals());
          const rawAmount = batch.reduce((total, row) => total + parseUnits(fromDecimal128(row.amount).toFixed(decimals), decimals), 0n);
          if (batch.length !== address.sweepRowIds.length || rawAmount <= 0n) throw new Error('Incomplete persisted sweep batch; manual review required');
          // Recovery FETCHES the exact signed payload by requestId. It never signs a replacement.
          const signed = await this.signing.recover(address.sweepRequestId, {source: address.address, amountRaw: rawAmount.toString()});
          await this.addresses.updateOne({ _id: address._id, sweepOwner: this.owner, sweepRequestId: address.sweepRequestId },
            { $set: { sweepSignedTransaction: signed.signedTransaction, sweepTxHash: signed.txHash } });
          address = await this.addresses.findById(address._id).select('+sweepSignedTransaction') ?? address;
        }
        await this.reconcileBatch(address, provider);
        return;
      }
      const rows = await this.deposits.find({ depositAddressId: address._id, status: { $in: ELIGIBLE } }).sort({ blockNumber: 1, logIndex: 1 });
      if (!rows.length) return;
      const tokenAddress = getAddress(this.config.getOrThrow<string>('BSC_USDT_CONTRACT'));
      const treasury = getAddress(this.config.getOrThrow<string>('BSC_TREASURY_ADDRESS'));
      const token = new Contract(tokenAddress, ABI, provider);
      const decimals = Number(await token.decimals());
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error('Invalid USDT decimals');
      // Sweep only the amount associated with this immutable batch of credited deposits.
      // A later/unconfirmed deposit cannot be silently swept by this batch.
      const amountRaw = rows.reduce((sum, row) => sum + parseUnits(fromDecimal128(row.amount).toFixed(decimals), decimals), 0n);
      if (amountRaw <= 0n) throw new Error('Invalid eligible batch amount');
      const chainBalance: bigint = await token.balanceOf(address.address);
      if (chainBalance < amountRaw) {
        this.log.error(`Deposit wallet ${address.address} lacks recorded credited USDT; manual reconciliation required`);
        return; // Do not falsely mark deposits SWEPT when balance is zero.
      }
      const data = iface.encodeFunctionData('transfer', [treasury, amountRaw]);
      const estimate = await provider.estimateGas({ from: address.address, to: tokenAddress, data });
      const fee = await provider.getFeeData();
      if (!fee.gasPrice) throw new Error('BSC gas price unavailable');
      const gasPrice = fee.gasPrice;
      const gasLimit = estimate * 130n / 100n;
      const maxGasPrice = BigInt(this.config.get('BSC_SIGNER_MAX_GAS_PRICE_GWEI') ?? 20) * 1_000_000_000n;
      if (gasPrice > maxGasPrice || gasLimit > 200_000n) throw new Error('Gas exceeds isolated signer policy; retry later');
      const needed = gasLimit * gasPrice;
      const native = await provider.getBalance(address.address);
      if (native < needed) {
        const gasWallet = new Wallet(this.config.getOrThrow<string>('BSC_GAS_WALLET_PRIVATE_KEY'), provider);
        const gasTx = await gasWallet.sendTransaction({ to: address.address, value: needed - native });
        await gasTx.wait(1);
      }
      const requestId = randomUUID();
      const nonce = await provider.getTransactionCount(address.address, 'pending');
      // Persist intent BEFORE contacting the isolated signer. If the response is lost, block
      // automation and require reconciliation instead of risking a second payout.
      const claimed = await this.addresses.updateOne({ _id: address._id, sweepOwner: this.owner, sweepRequestId: null }, {
        $set: { sweepRequestId: requestId, sweepRowIds: rows.map(r => r._id), sweepSignedTransaction: null, sweepTxHash: null },
      });
      if (claimed.modifiedCount !== 1) throw new Error('Unable to persist signing intent');
      const signed = await this.signing.sign({ requestId, derivationIndex: address.derivationIndex,
        sourceAddress: address.address, amountRaw: amountRaw.toString(), gasLimit: gasLimit.toString(),
        gasPriceWei: gasPrice.toString(), nonce });
      const saved = await this.addresses.updateOne({ _id: address._id, sweepOwner: this.owner, sweepRequestId: requestId }, {
        $set: { sweepSignedTransaction: signed.signedTransaction, sweepTxHash: signed.txHash },
      });
      if (saved.modifiedCount !== 1) throw new Error('Lost sweep lease before durable signature persistence; manual review required');
      address = await this.addresses.findById(address._id).select('+sweepSignedTransaction');
      if (address) await this.reconcileBatch(address, provider);
    } catch (e: any) {
      // If an intent exists, never replace it automatically: signer might have signed already.
      this.log.error(`Sweep processing failed for ${address.address}: ${e?.message ?? e}`);
    } finally {
      await this.addresses.updateOne({ _id: id, sweepOwner: this.owner }, {
        $set: { sweepOwner: null, sweepLeaseUntil: null },
      });
    }
  }

  private async reconcileBatch(address: DepositAddressDocument, provider: JsonRpcProvider) {
    if (!address.sweepSignedTransaction || !address.sweepTxHash) return;
    const hash = address.sweepTxHash;
    const receipt = await provider.getTransactionReceipt(hash);
    if (receipt) {
      if (receipt.status !== 1) {
        this.log.error(`Sweep ${hash} reverted; manual review required`);
        return;
      }
      const confirmations = (await provider.getBlockNumber()) - receipt.blockNumber + 1;
      if (confirmations < Number(this.config.get('BSC_REQUIRED_CONFIRMATIONS') ?? 12)) return;
      const receiptBlock = await provider.getBlock(receipt.blockNumber);
      if (receiptBlock?.hash?.toLowerCase() !== receipt.blockHash.toLowerCase()) return;
      const rows = await this.deposits.find({ _id: { $in: address.sweepRowIds } });
      const decimals = Number(await new Contract(this.config.getOrThrow<string>('BSC_USDT_CONTRACT'), ABI, provider).decimals());
      const expected = rows.reduce((n, r) => n + parseUnits(fromDecimal128(r.amount).toFixed(decimals), decimals), 0n);
      if (rows.length !== address.sweepRowIds.length || expected <= 0n) throw new Error('Sweep batch ledger records do not match');
      const tokenAddress = getAddress(this.config.getOrThrow<string>('BSC_USDT_CONTRACT'));
      const treasury = getAddress(this.config.getOrThrow<string>('BSC_TREASURY_ADDRESS'));
      const matched = receipt.logs.some(log => {
        if (getAddress(log.address) !== tokenAddress) return false;
        try { const event = iface.parseLog(log); return event?.name === 'Transfer' &&
          getAddress(String(event.args.from)) === getAddress(address.address) &&
          getAddress(String(event.args.to)) === treasury && BigInt(event.args.value) === expected;
        } catch { return false; }
      });
      if (!matched) throw new Error('Successful receipt missing matching treasury USDT Transfer; manual review required');
      // Include only the durable batch IDs, never newer deposits from a concurrent scanner.
      await this.deposits.updateMany({ _id: { $in: address.sweepRowIds }, status: { $in: ELIGIBLE } }, {
        $set: { status: DepositStatus.SWEPT, sweepTxHash: hash.toLowerCase(), sweptAt: new Date(), lastError: null },
      });
      await this.addresses.updateOne({ _id: address._id, sweepOwner: this.owner, sweepRequestId: address.sweepRequestId }, {
        $set: { sweepRequestId: null, sweepRowIds: [], sweepSignedTransaction: null, sweepTxHash: null },
      });
      return;
    }
    // Re-broadcast only the SAME durable raw transaction after restart. Never sign a replacement automatically.
    const pending = await provider.getTransaction(hash);
    if (!pending) await provider.broadcastTransaction(address.sweepSignedTransaction);
  }
}
