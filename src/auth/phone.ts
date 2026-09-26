import { parsePhoneNumberFromString } from 'libphonenumber-js';

export function normalizePhone(value: string): string {
  const compact = value.trim().replace(/[\s()-]/g, '');
  const parsed = parsePhoneNumberFromString(compact);
  if (!parsed || !parsed.isValid()) throw new Error('Invalid phone number');
  return parsed.number;
}
