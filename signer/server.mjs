/**
 * Run as a SEPARATE PRIVATE Railway service. Do not assign a public domain.
 * Only signs a bounded BEP-20 USDT transfer from a derived deposit address
 * to the immutable treasury address. It does not broadcast transactions.
 * A mnemonic in an environment variable remains a risk: use KMS/MPC for high-value custody.
 */
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { Contract, HDNodeWallet, JsonRpcProvider, Interface, getAddress, keccak256 } from 'ethers';
import { verifyAuth, validateSweep } from './validation.mjs';

const env = process.env;
const required = ['SIGNER_HD_MNEMONIC','SIGNER_SHARED_SECRET','SIGNER_MONGODB_URI','BSC_RPC_URL','BSC_USDT_CONTRACT','BSC_TREASURY_ADDRESS','BSC_DEPOSIT_XPUB'];
for (const key of required) if (!env[key]) throw new Error(`Isolated signer missing ${key}`);
if (Buffer.byteLength(env.SIGNER_SHARED_SECRET) < 32) throw new Error('SIGNER_SHARED_SECRET must contain at least 32 bytes');
const tokenAddress = getAddress(env.BSC_USDT_CONTRACT);
const treasury = getAddress(env.BSC_TREASURY_ADDRESS);
const provider = new JsonRpcProvider(env.BSC_RPC_URL, 56, { staticNetwork: true });
const parent = HDNodeWallet.fromPhrase(env.SIGNER_HD_MNEMONIC, '', "m/44'/60'/0'/0");
if (parent.neuter().extendedKey !== env.BSC_DEPOSIT_XPUB) throw new Error('Mnemonic does not match the configured XPUB');
const liveChainId = await provider.send('eth_chainId', []);
if (BigInt(liveChainId) !== 56n) throw new Error('RPC does not point to BNB Smart Chain');
const bytecode = await provider.getCode(tokenAddress);
if (bytecode === '0x') throw new Error('Configured token has no contract code');
const maxGasPrice = BigInt(env.SIGNER_MAX_GAS_PRICE_GWEI ?? '20') * 1_000_000_000n;
const iface = new Interface(['function transfer(address,uint256) returns (bool)','function balanceOf(address) view returns (uint256)']);
const transferToken = new Contract(tokenAddress, ['function balanceOf(address) view returns (uint256)'], provider);
await mongoose.connect(env.SIGNER_MONGODB_URI, { dbName: env.SIGNER_DB_NAME ?? 'aervon_signer', maxPoolSize: 3 });
const requestModel = mongoose.model('SweepSignature', new mongoose.Schema({
  requestId: { type: String, unique: true, required: true },
  digest: { type: String, required: true },
  status: { type: String, required: true },
  signedTransaction: String,
  txHash: String,
  startedAt: Date,
}, { timestamps: true, collection: 'sweep_signatures' }));

async function signSweep(input, digest) {
  const validated = validateSweep(input, treasury);
  if (validated.gasPrice > maxGasPrice) throw new Error('Gas price exceeds signer policy');
  const child = parent.deriveChild(input.derivationIndex);
  if (child.address.toLowerCase() !== validated.source) throw new Error('Derived wallet does not match source address');
  const current = BigInt(await transferToken.balanceOf(child.address));
  if (current < validated.amount) throw new Error('Insufficient confirmed token balance');
  const native = await provider.getBalance(child.address);
  if (native < validated.gasLimit * validated.gasPrice) throw new Error('Insufficient BNB for requested gas');
  const raw = await child.signTransaction({ chainId: 56, type: 0, nonce: input.nonce,
    to: tokenAddress, data: iface.encodeFunctionData('transfer', [treasury, validated.amount]),
    gasLimit: validated.gasLimit, gasPrice: validated.gasPrice, value: 0n });
  const result = { signedTransaction: raw, txHash: keccak256(raw).toLowerCase() };
  await requestModel.updateOne({ requestId: input.requestId, digest, status: 'PROCESSING' }, { $set: { ...result, status: 'SIGNED' } });
  return result;
}

const server = createServer(async (req, res) => {
  const send = (code, object) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(object)); };
  if (req.method !== 'POST' || !['/internal/sign-sweep', '/internal/recover-sweep'].includes(req.url)) return send(404, { error: 'Not found' });
  try {
    let raw = '';
    for await (const part of req) { raw += part; if (raw.length > 4096) return send(413, { error: 'Payload too large' }); }
    const timestamp = String(req.headers['x-signer-timestamp'] ?? '');
    if (!verifyAuth(env.SIGNER_SHARED_SECRET, timestamp, raw, String(req.headers['x-signer-signature'] ?? ''))) return send(401, { error: 'Unauthorized' });
    const input = JSON.parse(raw);
    if (req.url === '/internal/recover-sweep') {
      if (Object.keys(input).join(',') !== 'requestId' || !/^[0-9a-f-]{36}$/i.test(input.requestId)) return send(400, { error: 'Invalid request id' });
      const existing = await requestModel.findOne({ requestId: input.requestId });
      if (!existing || existing.status !== 'SIGNED') return send(409, { error: 'Signature not available; manual review required' });
      return send(200, { signedTransaction: existing.signedTransaction, txHash: existing.txHash });
    }
    validateSweep(input, treasury);
    const digest = createHash('sha256').update(raw).digest('hex');
    const existing = await requestModel.findOne({ requestId: input.requestId });
    if (existing) {
      if (existing.digest !== digest) return send(409, { error: 'Conflicting request id' });
      if (existing.status === 'SIGNED') return send(200, { signedTransaction: existing.signedTransaction, txHash: existing.txHash });
      // A failed process can only be retried after a human review. Never silently re-sign.
      return send(409, { error: 'Signing already started; check signer audit and reconcile' });
    }
    try {
      await requestModel.create({ requestId: input.requestId, digest, status: 'PROCESSING', startedAt: new Date() });
    } catch (e) { if (e?.code === 11000) return send(409, { error: 'Concurrent signing; retry once request is persisted' }); throw e; }
    const result = await signSweep(input, digest);
    return send(200, result);
  } catch (e) {
    // Never log the mnemonic, raw request or secret.
    console.error('Isolated signer request rejected:', e instanceof Error ? e.message : 'Unknown');
    return send(422, { error: 'Signing request rejected; inspect private signer logs' });
  }
});
server.requestTimeout = 10_000;
server.listen(Number(env.PORT ?? 3001), '0.0.0.0', () => console.log('Isolated signer listening on private interface'));
