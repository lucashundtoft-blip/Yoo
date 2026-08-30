import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

const BASE_URL = 'https://www.alphavantage.co/query';

/** App-facing futures symbols mapped to Alpha Vantage's free "Economic
 * Indicators" commodity functions. These are the only futures-adjacent
 * symbols with a real, free-tier data source we found -- metals (gold/
 * silver) and stock-index futures require a paid plan on every provider we
 * checked, so those stay on the simulated provider. */
export const COMMODITY_SYMBOL_MAP: Record<string, string> = {
  CL: 'WTI',
  MCL: 'WTI', // micro WTI tracks the same underlying price as the full-size contract
  NG: 'NATURAL_GAS',
  HG: 'COPPER',
  ZC: 'CORN',
  ZW: 'WHEAT',
};

interface SeriesPoint {
  date: string;
  value: number;
}

/** Alpha Vantage's free tier allows ~25 requests/day, and this data only
 * updates daily anyway, so cache aggressively instead of refetching on
 * every poll. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const seriesCache = new Map<string, { fetchedAt: number; points: SeriesPoint[] }>();

export class AlphaVantageCommodityProvider implements MarketDataProvider {
  readonly name = 'alpha-vantage-commodities';

  constructor(private readonly apiKey: string) {}

  private async getSeries(avFunction: string): Promise<SeriesPoint[]> {
    const cached = seriesCache.get(avFunction);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.points;

    const url = new URL(BASE_URL);
    url.searchParams.set('function', avFunction);
    url.searchParams.set('interval', 'daily');
    url.searchParams.set('apikey', this.apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const raw = (data?.data ?? []) as { date: string; value: string }[];
    const points = raw
      .filter((p) => p.value && p.value !== '.')
      .map((p) => ({ date: p.date, value: Number(p.value) }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    if (points.length > 0) seriesCache.set(avFunction, { fetchedAt: Date.now(), points });
    return points;
  }

  private resolveFunction(symbol: string): string {
    const avFunction = COMMODITY_SYMBOL_MAP[symbol.toUpperCase()];
    if (!avFunction) throw new Error(`No commodity mapping for symbol ${symbol}`);
    return avFunction;
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    return Object.keys(COMMODITY_SYMBOL_MAP)
      .filter((symbol) => symbol.includes(q))
      .map((symbol) => ({ symbol, name: COMMODITY_SYMBOL_MAP[symbol] }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const points = await this.getSeries(this.resolveFunction(symbol));
    const latest = points.at(-1);
    const prior = points.at(-2);
    const price = latest?.value ?? 0;
    const prevClose = prior?.value ?? price;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose,
      open: prevClose,
      high: Math.max(price, prevClose),
      low: Math.min(price, prevClose),
      change: price - prevClose,
      changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, _resolution: Resolution, days: number): Promise<Candle[]> {
    const points = await this.getSeries(this.resolveFunction(symbol));
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    // Alpha Vantage's commodity series is one print per day, not real OHLC --
    // approximate each day's bar as a flat candle at that print.
    return points
      .filter((p) => new Date(p.date).getTime() >= cutoff)
      .map((p) => ({
        time: Math.floor(new Date(p.date).getTime() / 1000),
        open: p.value,
        high: p.value,
        low: p.value,
        close: p.value,
        volume: 0,
      }));
  }
}
