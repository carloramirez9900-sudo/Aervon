import { z } from 'zod';

const envSchema = z.object({
  MIN_DEPOSIT_USDT: z.coerce.number().positive().default(5),
  MIN_WITHDRAWAL_USDT: z.coerce.number().positive().default(10),
  MIN_PRINCIPAL_CYCLES: z.coerce.number().int().positive().default(10),
  TRADES_PER_CYCLE: z.coerce.number().int().refine((value) => value === 5, 'TRADES_PER_CYCLE must be exactly 5').default(5),
  CYCLE_HOURS: z.coerce.number().int().positive().default(24),
  REFERRAL_COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.03),
  DAILY_YIELD_MIN_RATE: z.coerce.number().min(0).max(1).default(0.035),
  DAILY_YIELD_MAX_RATE: z.coerce.number().min(0).max(1).default(0.05),
});

export type ProductConfig = z.infer<typeof envSchema>;

export function loadProductConfig(env: NodeJS.ProcessEnv = process.env): ProductConfig {
  const parsed = envSchema.parse(env);
  if (parsed.DAILY_YIELD_MIN_RATE > parsed.DAILY_YIELD_MAX_RATE) {
    throw new Error('DAILY_YIELD_MIN_RATE cannot exceed DAILY_YIELD_MAX_RATE');
  }
  return parsed;
}
