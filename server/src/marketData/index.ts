import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { FinnhubProvider } from './finnhubProvider.js';
import { FmpProvider } from './fmpProvider.js';
import { SimulatedProvider } from './simulatedProvider.js';

const simulated = new SimulatedProvider();

const finnhubKey = process.env.FINNHUB_API_KEY;
const fmpKey = process.env.FMP_API_KEY;

const candidateProviders: Array<MarketDataProvider | null> = [
  finnhubKey ? new FinnhubProvider(finnhubKey) : null,
  fmpKey ? new FmpProvider(fmpKey) : null,
];
const liveProviders: MarketDataProvider[] = candidateProviders.filter(
  (p): p is MarketDataProvider => p !== null,
);

/** Tries each live provider in order, falling back to simulated data if all
 * of them error out or return empty (no network, bad key, rate limit) so the
 * app keeps working 24/7. */
class FallbackProvider implements MarketDataProvider {
  readonly name =
    liveProviders.length > 0
      ? `${liveProviders.map((p) => p.name).join(' > ')} (with simulated fallback)`
      : 'simulated';

  async search(query: string): Promise<SearchResult[]> {
    for (const provider of liveProviders) {
      try {
        const results = await provider.search(query);
        if (results.length > 0) return results;
      } catch {
        // try next provider
      }
    }
    return simulated.search(query);
  }

  async getQuote(symbol: string): Promise<Quote> {
    for (const provider of liveProviders) {
      try {
        const quote = await provider.getQuote(symbol);
        if (quote.price) return quote;
      } catch {
        // try next provider
      }
    }
    return simulated.getQuote(symbol);
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    for (const provider of liveProviders) {
      try {
        const candles = await provider.getCandles(symbol, resolution, days);
        if (candles.length > 0) return candles;
      } catch {
        // try next provider
      }
    }
    return simulated.getCandles(symbol, resolution, days);
  }
}

export const marketData: MarketDataProvider = new FallbackProvider();
export type { Candle, Quote, Resolution, SearchResult, MarketDataProvider };
