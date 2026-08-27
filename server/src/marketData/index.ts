import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { FinnhubProvider } from './finnhubProvider.js';
import { FmpProvider } from './fmpProvider.js';
import { SimulatedProvider } from './simulatedProvider.js';
import { AlphaVantageCommodityProvider, COMMODITY_SYMBOL_MAP } from './commodityProvider.js';

const simulated = new SimulatedProvider();

const finnhubKey = process.env.FINNHUB_API_KEY;
const fmpKey = process.env.FMP_API_KEY;
const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;

const candidateProviders: Array<MarketDataProvider | null> = [
  finnhubKey ? new FinnhubProvider(finnhubKey) : null,
  fmpKey ? new FmpProvider(fmpKey) : null,
];
const liveProviders: MarketDataProvider[] = candidateProviders.filter(
  (p): p is MarketDataProvider => p !== null,
);

const commodityProvider = alphaVantageKey ? new AlphaVantageCommodityProvider(alphaVantageKey) : null;

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

const stockProvider = new FallbackProvider();

/** Routes known futures/commodity symbols (CL, MCL, NG, HG, ZC, ZW) to real
 * Alpha Vantage commodity data when a key is configured, before falling
 * through to the regular stock provider chain (which ends in simulated data
 * for symbols none of them recognize -- true for every other futures symbol,
 * since no free-tier source for metals or stock-index futures exists). */
class RoutingProvider implements MarketDataProvider {
  readonly name = commodityProvider
    ? `${commodityProvider.name} + ${stockProvider.name}`
    : stockProvider.name;

  private isCommoditySymbol(symbol: string): boolean {
    return symbol.toUpperCase() in COMMODITY_SYMBOL_MAP;
  }

  async search(query: string): Promise<SearchResult[]> {
    return stockProvider.search(query);
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (commodityProvider && this.isCommoditySymbol(symbol)) {
      try {
        const quote = await commodityProvider.getQuote(symbol);
        if (quote.price) return quote;
      } catch {
        // fall through to simulated via the stock chain
      }
    }
    return stockProvider.getQuote(symbol);
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    if (commodityProvider && this.isCommoditySymbol(symbol)) {
      try {
        const candles = await commodityProvider.getCandles(symbol, resolution, days);
        if (candles.length > 0) return candles;
      } catch {
        // fall through to simulated via the stock chain
      }
    }
    return stockProvider.getCandles(symbol, resolution, days);
  }
}

export const marketData: MarketDataProvider = new RoutingProvider();
export const hasCommodityData = commodityProvider !== null;
export type { Candle, Quote, Resolution, SearchResult, MarketDataProvider };
