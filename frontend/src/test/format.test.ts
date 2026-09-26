import { describe, expect, it } from 'vitest';
import { formatPercentRate, formatUsdt } from '../lib/format';

describe('financial formatting', () => {
  it('formats backend rates as percentages', () => expect(formatPercentRate('0.011')).toBe('+1.10%'));
  it('formats losses without adding a positive sign', () => expect(formatPercentRate('-0.0025')).toBe('-0.25%'));
  it('formats USDT to two decimals by default', () => expect(formatUsdt('42.7')).toBe('42.70'));
});
