import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

const BASE_URL = 'https://financialmodelingprep.com/api/v3';

const INTRADAY_INTERVAL: Record<'5' | '60', string> = {
  '5': '5min',
  '60': '1hour',
};

export class FmpProvider implements MarketDataProvider {
  readonly name = 'fmp';

  constructor(private readonly apiKey: string) {}

  private async fetchJson(path: string, params: Record<string, string> = {}): Promise<any> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('apikey', this.apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`FMP request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson('/search', { query, limit: '15' });
    const results = (Array.isArray(data) ? data : []) as any[];
    return results.map((r) => ({ symbol: r.symbol, name: r.name }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.fetchJson(`/quote/${encodeURIComponent(symbol)}`);
    const q = Array.isArray(data) ? data[0] : null;
    if (!q) {
      return {
        symbol: symbol.toUpperCase(),
        price: 0,
        prevClose: 0,
        open: 0,
        high: 0,
        low: 0,
        change: 0,
        changePercent: 0,
        marketOpen: isUsMarketOpen(),
        timestamp: Date.now(),
      };
    }
    return {
      symbol: symbol.toUpperCase(),
      price: q.price,
      prevClose: q.previousClose,
      open: q.open,
      high: q.dayHigh,
      low: q.dayLow,
      change: q.change,
      changePercent: q.changesPercentage,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    if (resolution === 'D') {
      const data = await this.fetchJson(`/historical-price-full/${encodeURIComponent(symbol)}`, {
        timeseries: String(days),
      });
      const historical = (data?.historical ?? []) as any[];
      return historical
        .map((h) => ({
          time: Math.floor(new Date(h.date).getTime() / 1000),
          open: h.open,
          high: h.high,
          low: h.low,
          close: h.close,
          volume: h.volume,
        }))
        .sort((a, b) => a.time - b.time);
    }

    const interval = INTRADAY_INTERVAL[resolution];
    const data = await this.fetchJson(`/historical-chart/${interval}/${encodeURIComponent(symbol)}`);
    const bars = (Array.isArray(data) ? data : []) as any[];
    const cutoff = Date.now() / 1000 - days * 24 * 60 * 60;
    return bars
      .map((b) => ({
        time: Math.floor(new Date(b.date).getTime() / 1000),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }))
      .filter((c) => c.time >= cutoff)
      .sort((a, b) => a.time - b.time);
  }
}
