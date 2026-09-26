import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HDNodeWallet } from 'ethers';

/** The public API never receives a mnemonic or derives private keys. */
@Injectable()
export class WalletDerivationService {
  constructor(private readonly config: ConfigService) {}

  deriveAddress(index: number): string {
    const xpub = this.config.getOrThrow<string>('BSC_DEPOSIT_XPUB');
    if (!Number.isSafeInteger(index) || index < 0 || index >= 2 ** 31) {
      throw new Error('Invalid deposit derivation index');
    }
    return HDNodeWallet.fromExtendedKey(xpub).deriveChild(index).address.toLowerCase();
  }
}
