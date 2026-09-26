import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import { D } from '../common/money';

export interface MarketReference {
  exchange: 'BINANCE';
  symbol: string;
  price: Decimal;
  observedAt: Date;
  source: 'PUBLIC_TICKER';
}

@Injectable()
export class MarketReferenceService {
  private readonly baseUrl = process.env.MARKET_REFERENCE_BASE_URL ?? 'https://api.binance.com';

  async getPrice(symbol: string): Promise<MarketReference> {
    const normalized = symbol.toUpperCase();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(`${this.baseUrl}/api/v3/ticker/price?symbol=${encodeURIComponent(normalized)}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Market reference HTTP ${response.status}`);
      const body = await response.json() as { symbol?: string; price?: string };
      const price = D(body.price ?? '0');
      if (price.lte(0)) throw new Error('Invalid market reference price');
      return { exchange: 'BINANCE', symbol: normalized, price, observedAt: new Date(), source: 'PUBLIC_TICKER' };
    } finally {
      clearTimeout(timer);
    }
  }
}
