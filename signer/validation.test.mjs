import test from 'node:test';
import assert from 'node:assert/strict';
import { authMac, verifyAuth, validateSweep } from './validation.mjs';
const treasury = '0x' + '1'.repeat(40);
const sample = {
  requestId: '123e4567-e89b-12d3-a456-426614174000', derivationIndex: 1,
  sourceAddress: '0x' + '2'.repeat(40), amountRaw: '5000000000000000000',
  gasLimit: '78000', gasPriceWei: '3000000000', nonce: 0,
};
test('HMAC accepts valid fresh request and rejects forged and stale requests', () => {
  const now = 1735000000000;
  const raw = JSON.stringify(sample);
  const secret = 'A'.repeat(40);
  const mac = authMac(secret, String(now), raw);
  assert.equal(verifyAuth(secret, String(now), raw, mac, now), true);
  assert.equal(verifyAuth(secret, String(now), raw + ' ', mac, now), false);
  assert.equal(verifyAuth(secret, String(now), raw, mac, now + 31000), false);
  assert.equal(verifyAuth(secret, String(now), raw, 'a'.repeat(64), now), false);
});
test('signer accepts only the strict sweep request schema', () => {
  assert.equal(validateSweep(sample, treasury).amount, 5000000000000000000n);
  assert.throws(() => validateSweep({ ...sample, to: treasury }, treasury), /Unexpected/);
  assert.throws(() => validateSweep({ ...sample, amountRaw: '0' }, treasury), /amount/);
  assert.throws(() => validateSweep({ ...sample, gasLimit: '200001' }, treasury), /gas/);
  assert.throws(() => validateSweep({ ...sample, derivationIndex: -1 }, treasury), /index/);
  assert.throws(() => validateSweep({ ...sample, sourceAddress: '0x123' }, treasury), /address/);
});
