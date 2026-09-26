import { normalizePhone } from '../src/auth/phone';
import { randomToken, sha256 } from '../src/auth/auth.crypto';

describe('authentication rules', () => {
  it('normalizes a valid Mexican number to E.164', () => {
    expect(normalizePhone('+52 55 1234 5678')).toBe('+525512345678');
  });

  it('rejects an invalid phone', () => {
    expect(() => normalizePhone('123')).toThrow();
  });

  it('creates non-plaintext challenge material', () => {
    const token = randomToken();
    expect(token.length).toBeGreaterThan(20);
    expect(sha256(token)).not.toBe(token);
    expect(sha256(token)).toHaveLength(64);
  });
});
