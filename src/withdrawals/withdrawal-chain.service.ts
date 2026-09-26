import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interface, JsonRpcProvider, Wallet, getAddress, keccak256, parseUnits } from 'ethers';
import Decimal from 'decimal.js';
import { requiredGasWeiWithMargin } from './withdrawal.domain';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

@Injectable()
export class WithdrawalChainService {
  private readonly logger = new Logger(WithdrawalChainService.name);
  private provider?: JsonRpcProvider;
  private wallet?: Wallet;
  private tokenAddress?: string;
  private decimals?: number;
  private readonly iface = new Interface(ERC20_ABI);

  constructor(private readonly config: ConfigService) {}

  private client() {
    if (!this.provider) {
      const rpc = this.config.get<string>('BSC_RPC_URL');
      const key = this.config.get<string>('BSC_WITHDRAWAL_PRIVATE_KEY');
      const token = this.config.get<string>('BSC_USDT_CONTRACT');
      if (!rpc || !key || !token) throw new Error('BSC withdrawal configuration is incomplete');
      this.provider = new JsonRpcProvider(rpc, 56, { staticNetwork: true });
      this.wallet = new Wallet(key, this.provider);
      const expectedAddress = this.config.get<string>('BSC_WITHDRAWAL_ADDRESS');
      if (expectedAddress && getAddress(expectedAddress) !== this.wallet.address) throw new Error('BSC_WITHDRAWAL_ADDRESS does not match BSC_WITHDRAWAL_PRIVATE_KEY');
      this.tokenAddress = getAddress(token);
    }
    return { provider: this.provider, wallet: this.wallet!, tokenAddress: this.tokenAddress! };
  }

  async walletAddress(): Promise<string> {
    return this.client().wallet.address.toLowerCase();
  }

  async balances(): Promise<{ usdt: Decimal; bnbWei: bigint }> {
    const { provider, wallet, tokenAddress } = this.client();
    const decimals = await this.tokenDecimals();
    const balanceData = this.iface.encodeFunctionData('balanceOf', [wallet.address]);
    const [rawResult, bnbWei] = await Promise.all([
      provider.call({ to: tokenAddress, data: balanceData }),
      provider.getBalance(wallet.address),
    ]);
    const [rawToken] = this.iface.decodeFunctionResult('balanceOf', rawResult) as unknown as [bigint];
    return { usdt: new Decimal(rawToken.toString()).div(new Decimal(10).pow(decimals)), bnbWei };
  }

  async prepare(amount: Decimal, destination: string): Promise<{
    gasLimit: bigint;
    gasPriceWei: bigint;
    estimatedCostWei: bigint;
    requiredWeiWithMargin: bigint;
    nonce: number;
    txHash: string;
    signedTransaction: string;
  }> {
    const { provider, wallet, tokenAddress } = this.client();
    const decimals = await this.tokenDecimals();
    const rawAmount = parseUnits(amount.toFixed(decimals), decimals);
    const data = this.iface.encodeFunctionData('transfer', [getAddress(destination), rawAmount]);
    const gasLimit = BigInt(await provider.estimateGas({ from: wallet.address, to: tokenAddress, data }));
    const feeData = await provider.getFeeData();
    const feePrice = feeData.gasPrice ?? feeData.maxFeePerGas;
    if (!feePrice) throw new Error('Unable to determine BSC gas price');
    const gasPriceWei = BigInt(feePrice);
    const estimatedCostWei = gasLimit * gasPriceWei;
    const marginBps = BigInt(this.config.get<string>('BSC_WITHDRAWAL_GAS_MARGIN_BPS') ?? '1500');
    const requiredWeiWithMargin = requiredGasWeiWithMargin(estimatedCostWei, marginBps);
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    const signedTransaction = await wallet.signTransaction({
      to: tokenAddress,
      data,
      gasLimit,
      gasPrice: gasPriceWei,
      nonce,
      chainId: 56,
      type: 0,
      value: 0,
    });
    return { gasLimit, gasPriceWei, estimatedCostWei, requiredWeiWithMargin, nonce, txHash: keccak256(signedTransaction).toLowerCase(), signedTransaction };
  }

  async broadcastSigned(signedTransaction: string) {
    const tx = await this.client().provider.broadcastTransaction(signedTransaction);
    return { hash: tx.hash.toLowerCase() };
  }

  async receiptWithConfirmations(txHash: string) {
    const { provider } = this.client();
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) return { receipt: null, confirmations: 0 };
    const latest = await provider.getBlockNumber();
    return { receipt, confirmations: Math.max(0, latest - receipt.blockNumber + 1) };
  }

  private async tokenDecimals(): Promise<number> {
    if (this.decimals === undefined) {
      const { provider, tokenAddress } = this.client();
      const result = await provider.call({ to: tokenAddress, data: this.iface.encodeFunctionData('decimals') });
      const [value] = this.iface.decodeFunctionResult('decimals', result) as unknown as [bigint];
      this.decimals = Number(value);
      if (!Number.isInteger(this.decimals) || this.decimals < 0 || this.decimals > 36) throw new Error('Invalid token decimals');
      this.logger.log(`USDT token decimals=${this.decimals}`);
    }
    return this.decimals;
  }
}
