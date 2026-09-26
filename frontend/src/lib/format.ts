import { getLanguage } from '../i18n';

export const toNumber = (value?: string | null) => Number(value ?? 0);

export function formatUsdt(value?: string | null, digits = 2) {
  const amount = toNumber(value);
  return new Intl.NumberFormat(getLanguage() === 'es' ? 'es-419' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}

export function formatPercentRate(value?: string | null, digits = 2) {
  const rate = toNumber(value) * 100;
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(digits)}%`;
}

export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(getLanguage() === 'es' ? 'es-419' : 'en-US', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

export function maskPhone(phone: string) {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 3)} •••• ${phone.slice(-4)}`;
}
