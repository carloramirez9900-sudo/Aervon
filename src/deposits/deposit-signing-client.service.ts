import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Interface, Transaction, getAddress } from 'ethers';

export type SweepSigningInput = { requestId: string; derivationIndex: number; sourceAddress: string;
  amountRaw: string; gasLimit: string; gasPriceWei: string; nonce: number };

const iface = new Interface(['function transfer(address,uint256) returns (bool)']);
@Injectable()
export class DepositSigningClientService {
  constructor(private readonly config: ConfigService) {}

  async recover(requestId: string, expected: { source: string; amountRaw: string }) {
    const result = await this.request('/internal/recover-sweep', { requestId });
    this.verifyBasic(result, expected.source, expected.amountRaw);
    return result;
  }

  async sign(input: SweepSigningInput): Promise<{signedTransaction: string; txHash: string}> {
    const result = await this.request('/internal/sign-sweep', input);
    this.verifyBasic(result, input.sourceAddress, input.amountRaw);
    const tx = Transaction.from(result.signedTransaction);
    if (tx.nonce !== input.nonce || tx.gasLimit !== BigInt(input.gasLimit) ||
        tx.gasPrice !== BigInt(input.gasPriceWei)) throw new Error('Signer changed nonce or gas');
    return result;
  }

  private verifyBasic(result: {signedTransaction:string;txHash:string}, sourceAddress: string, amountRaw:string) {
    const tx = Transaction.from(result.signedTransaction);
    const decoded = iface.decodeFunctionData('transfer', tx.data);
    const gasCeiling = BigInt(this.config.get('BSC_SIGNER_MAX_GAS_PRICE_GWEI') ?? '20') * 1_000_000_000n;
    if (tx.gasLimit > 200_000n || (tx.gasPrice ?? 0n) > gasCeiling || (tx.gasPrice ?? 0n) <= 0n) {
      throw new Error('Isolated signer gas policy violated');
    }
    if (tx.from !== getAddress(sourceAddress) || tx.to !== getAddress(this.config.getOrThrow<string>('BSC_USDT_CONTRACT')) ||
        tx.chainId !== 56n || tx.value !== 0n || tx.type !== 0 ||
        getAddress(decoded[0]) !== getAddress(this.config.getOrThrow<string>('BSC_TREASURY_ADDRESS')) ||
        decoded[1] !== BigInt(amountRaw) || tx.hash?.toLowerCase() !== result.txHash.toLowerCase()) {
      throw new Error('Isolated signer returned a transaction that violates sweep policy');
    }
  }

  private async request(path: string, input: object): Promise<{signedTransaction:string;txHash:string}> {
    const endpoint = this.config.getOrThrow<string>('BSC_SIGNER_INTERNAL_URL');
    const secret = this.config.getOrThrow<string>('BSC_SIGNER_SHARED_SECRET');
    const url = new URL(endpoint);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid internal signer URL');
    if (process.env.NODE_ENV === 'production' && !url.hostname.endsWith('.railway.internal')) {
      throw new Error('Signer must use a Railway PRIVATE service URL in production');
    }
    const body = JSON.stringify(input);
    const timestamp = Date.now().toString();
    const signature = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetch(`${endpoint.replace(/\/$/, '')}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-signer-timestamp': timestamp, 'x-signer-signature': signature },
      body, signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Isolated signer HTTP ${response.status}; verify private signer audit before retry`);
    return await response.json() as {signedTransaction: string; txHash: string};
  }
}
