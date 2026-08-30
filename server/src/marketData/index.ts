import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { FinnhubProvider } from './finnhubProvider.js';
import { FmpProvider } from './fmpProvider.js';
import { SimulatedProvider } from './simulatedProvider.js';
import { AlphaVantageCommodityProvider, COMMODITY_SYMBOL_MAP } from './commodityProvider.js';
import { DatabentoProvider, DATABENTO_SYMBOL_MAP } from './databentoProvider.js';

const simulated = new SimulatedProvider();

const finnhubKey = process.env.FINNHUB_API_KEY;
const fmpKey = process.env.FMP_API_KEY;
const alphaVantageKey = process.env.ALPHA_VANTAGE_API_KEY;
const databentoKey = process.env.DATABENTO_API_KEY;

const candidateProviders: Array<MarketDataProvider | null> = [
  finnhubKey ? new FinnhubProvider(finnhubKey) : null,
  fmpKey ? new FmpProvider(fmpKey) : null,
];
const liveProviders: MarketDataProvider[] = candidateProviders.filter(
  (p): p is MarketDataProvider => p !== null,
);

const commodityProvider = alphaVantageKey ? new AlphaVantageCommodityProvider(alphaVantageKey) : null;
const databentoProvider = databentoKey ? new DatabentoProvider(databentoKey) : null;

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

/** Routes futures/commodity symbols to real data before falling through to
 * the regular stock provider chain (which ends in simulated data for
 * symbols none of them recognize):
 *
 * 1. Databento (MCL, MGC, SIL, MHG) -- real CME Globex continuous-contract
 *    data when DATABENTO_API_KEY is set. Takes priority over Alpha Vantage
 *    for MCL since it's the actual futures contract, not a spot-price proxy.
 * 2. Alpha Vantage commodities (CL, MCL, NG, HG, ZC, ZW) when
 *    ALPHA_VANTAGE_API_KEY is set.
 * 3. Simulated, for everything else (metals other than MGC/SIL, and every
 *    stock-index future -- no free-tier source exists for those). */
class RoutingProvider implements MarketDataProvider {
  readonly name = [databentoProvider?.name, commodityProvider?.name, stockProvider.name]
    .filter(Boolean)
    .join(' + ');

  private isDatabentoSymbol(symbol: string): boolean {
    return symbol.toUpperCase() in DATABENTO_SYMBOL_MAP;
  }

  private isCommoditySymbol(symbol: string): boolean {
    return symbol.toUpperCase() in COMMODITY_SYMBOL_MAP;
  }

  async search(query: string): Promise<SearchResult[]> {
    return stockProvider.search(query);
  }

  async getQuote(symbol: string): Promise<Quote> {
    if (databentoProvider && this.isDatabentoSymbol(symbol)) {
      try {
        const quote = await databentoProvider.getQuote(symbol);
        if (quote.price) return quote;
      } catch {
        // fall through
      }
    }
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
    if (databentoProvider && this.isDatabentoSymbol(symbol)) {
      try {
        const candles = await databentoProvider.getCandles(symbol, resolution, days);
        if (candles.length > 0) return candles;
      } catch {
        // fall through
      }
    }
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
export const hasFuturesData = databentoProvider !== null;
export type { Candle, Quote, Resolution, SearchResult, MarketDataProvider };
