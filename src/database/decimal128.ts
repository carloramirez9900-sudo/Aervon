import Decimal from 'decimal.js';
import { Types } from 'mongoose';

export function toDecimal128(value: Decimal.Value): Types.Decimal128 {
  return Types.Decimal128.fromString(new Decimal(value).toFixed());
}

export function fromDecimal128(value: Types.Decimal128): Decimal {
  return new Decimal(value.toString());
}
