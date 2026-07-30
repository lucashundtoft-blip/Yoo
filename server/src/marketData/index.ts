import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { FinnhubProvider } from './finnhubProvider.js';
import { SimulatedProvider } from './simulatedProvider.js';

const simulated = new SimulatedProvider();
const apiKey = process.env.FINNHUB_API_KEY;
const live = apiKey ? new FinnhubProvider(apiKey) : null;

/** Falls back to simulated data per-call if the live provider errors out
 * (no network, bad key, rate limit) so the app keeps working 24/7. */
class FallbackProvider implements MarketDataProvider {
  readonly name = live ? 'finnhub (with simulated fallback)' : 'simulated';

  async search(query: string): Promise<SearchResult[]> {
    if (!live) return simulated.search(query);
    try {
      return await live.search(query);
    } catch {
      return simulated.search(query);
    }
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (!live) return simulated.getQuote(symbol);
    try {
      const quote = await live.getQuote(symbol);
      if (!quote.price) return simulated.getQuote(symbol);
      return quote;
    } catch {
      return simulated.getQuote(symbol);
    }
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    if (!live) return simulated.getCandles(symbol, resolution, days);
    try {
      const candles = await live.getCandles(symbol, resolution, days);
      if (candles.length === 0) return simulated.getCandles(symbol, resolution, days);
      return candles;
    } catch {
      return simulated.getCandles(symbol, resolution, days);
    }
  }
}

export const marketData: MarketDataProvider = new FallbackProvider();
export type { Candle, Quote, Resolution, SearchResult, MarketDataProvider };
