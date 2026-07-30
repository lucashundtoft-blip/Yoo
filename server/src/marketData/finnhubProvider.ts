import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

const BASE_URL = 'https://finnhub.io/api/v1';

export class FinnhubProvider implements MarketDataProvider {
  readonly name = 'finnhub';

  constructor(private readonly apiKey: string) {}

  private async fetchJson(path: string, params: Record<string, string>): Promise<any> {
    const url = new URL(BASE_URL + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set('token', this.apiKey);
    const res = await fetch(url.toString());
    if (!res.ok) {
      throw new Error(`Finnhub request failed: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async search(query: string): Promise<SearchResult[]> {
    const data = await this.fetchJson('/search', { q: query });
    const results = (data?.result ?? []) as any[];
    return results
      .filter((r) => r.type === 'Common Stock' || !r.type)
      .slice(0, 15)
      .map((r) => ({ symbol: r.symbol, name: r.description }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const data = await this.fetchJson('/quote', { symbol });
    const price = data.c;
    const prevClose = data.pc;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose,
      open: data.o,
      high: data.h,
      low: data.l,
      change: price - prevClose,
      changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 24 * 60 * 60;
    const data = await this.fetchJson('/stock/candle', {
      symbol,
      resolution,
      from: String(from),
      to: String(to),
    });
    if (data.s !== 'ok' || !Array.isArray(data.t)) return [];
    const candles: Candle[] = [];
    for (let i = 0; i < data.t.length; i++) {
      candles.push({
        time: data.t[i],
        open: data.o[i],
        high: data.h[i],
        low: data.l[i],
        close: data.c[i],
        volume: data.v[i],
      });
    }
    return candles;
  }
}
