import Decimal from 'decimal.js';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });

export const D = (value: Decimal.Value): Decimal => new Decimal(value);
export const zero = (): Decimal => D(0);
export const usdt = (value: Decimal.Value): Decimal => D(value).toDecimalPlaces(8, Decimal.ROUND_DOWN);
export const rate = (value: Decimal.Value): Decimal => D(value).toDecimalPlaces(8, Decimal.ROUND_DOWN);
