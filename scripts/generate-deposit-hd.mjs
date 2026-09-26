// Execute OFFLINE locally, on a secure machine. Never run this in Railway build logs.
import { HDNodeWallet } from 'ethers';
const wallet = HDNodeWallet.createRandom();
const parent = HDNodeWallet.fromPhrase(wallet.mnemonic.phrase, '', "m/44'/60'/0'/0");
console.log('WRITE THE FOLLOWING MNEMONIC IN A SECURE OFFLINE BACKUP. NEVER COMMIT OR SHARE IT.');
console.log('Signer-only mnemonic:', wallet.mnemonic.phrase);
console.log('Main API xpub:', parent.neuter().extendedKey);
console.log('Verification address index 1:', parent.deriveChild(1).address);
