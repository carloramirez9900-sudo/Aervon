import { createHmac, timingSafeEqual } from 'node:crypto';

export const bodyString = (body) => JSON.stringify(body);
export function authMac(secret, timestamp, rawBody) {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}
export function verifyAuth(secret, timestamp, rawBody, provided, now = Date.now()) {
  if (!/^\d{13}$/.test(timestamp) || Math.abs(now - Number(timestamp)) > 30_000) return false;
  if (!/^[0-9a-f]{64}$/i.test(provided ?? '')) return false;
  return timingSafeEqual(Buffer.from(authMac(secret, timestamp, rawBody), 'hex'), Buffer.from(provided, 'hex'));
}
export function validateSweep(input, treasury) {
  const fields = ['requestId', 'derivationIndex', 'sourceAddress', 'amountRaw', 'gasLimit', 'gasPriceWei', 'nonce'];
  if (!input || Object.keys(input).sort().join(',') !== fields.sort().join(',')) throw new Error('Unexpected sweep request fields');
  if (!/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new Error('Invalid requestId');
  if (!Number.isSafeInteger(input.derivationIndex) || input.derivationIndex < 0 || input.derivationIndex >= 2 ** 31) throw new Error('Invalid index');
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.sourceAddress) || !/^0x[0-9a-fA-F]{40}$/.test(treasury)) throw new Error('Invalid address');
  const source = input.sourceAddress.toLowerCase();
  if (!/^\d+$/.test(input.amountRaw) || BigInt(input.amountRaw) <= 0n) throw new Error('Invalid amount');
  if (!/^\d+$/.test(input.gasLimit) || BigInt(input.gasLimit) > 200_000n || BigInt(input.gasLimit) < 21_000n) throw new Error('Invalid gas limit');
  if (!/^\d+$/.test(input.gasPriceWei) || BigInt(input.gasPriceWei) <= 0n) throw new Error('Invalid gas price');
  if (!Number.isSafeInteger(input.nonce) || input.nonce < 0) throw new Error('Invalid nonce');
  return { source, amount: BigInt(input.amountRaw), gasLimit: BigInt(input.gasLimit), gasPrice: BigInt(input.gasPriceWei) };
}
