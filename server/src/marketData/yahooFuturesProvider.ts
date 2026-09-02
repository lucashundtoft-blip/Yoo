import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

const BASE_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';

/** App symbol -> Yahoo Finance continuous futures ticker. This is a free,
 * no-signup, no-key data source -- the same undocumented endpoint the
 * popular `yfinance` Python library relies on. It isn't an official,
 * contracted API: Yahoo can rate-limit, change, or block it without notice,
 * and some of these tickers (particularly micros) are unverified since this
 * endpoint isn't reachable from the sandbox this was built in. Treat it as
 * a free best-effort source, not a guaranteed one. */
export const YAHOO_FUTURES_SYMBOL_MAP: Record<string, string> = {
  ES: 'ES=F',
  MES: 'MES=F',
  NQ: 'NQ=F',
  MNQ: 'MNQ=F',
  YM: 'YM=F',
  RTY: 'RTY=F',
  CL: 'CL=F',
  MCL: 'MCL=F',
  NG: 'NG=F',
  RB: 'RB=F',
  GC: 'GC=F',
  MGC: 'MGC=F',
  SI: 'SI=F',
  SIL: 'SIL=F',
  HG: 'HG=F',
  MHG: 'MHG=F',
  ZB: 'ZB=F',
  ZN: 'ZN=F',
  ZC: 'ZC=F',
  ZS: 'ZS=F',
  ZW: 'ZW=F',
  '6E': '6E=F',
  '6J': '6J=F',
  '6B': '6B=F',
};

const INTERVAL_MAP: Record<Resolution, string> = { '5': '5m', '60': '60m', D: '1d' };

// A few minutes of cache so the app's own polling (8s quote refresh, 15s
// bracket checks, 60s pattern checks) doesn't hammer an unofficial free
// endpoint into rate-limiting itself.
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { fetchedAt: number; candles: Candle[] }>();

export class YahooFuturesProvider implements MarketDataProvider {
  readonly name = 'yahoo-finance (unofficial, free)';

  private resolveSymbol(symbol: string): string {
    const yahooSymbol = YAHOO_FUTURES_SYMBOL_MAP[symbol.toUpperCase()];
    if (!yahooSymbol) throw new Error(`No Yahoo Finance mapping for symbol ${symbol}`);
    return yahooSymbol;
  }

  private async fetchChart(yahooSymbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    const key = `${yahooSymbol}:${resolution}:${days}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.candles;

    const period2 = Math.floor(Date.now() / 1000);
    const period1 = period2 - days * 24 * 60 * 60;
    const url = new URL(`${BASE_URL}/${encodeURIComponent(yahooSymbol)}`);
    url.searchParams.set('interval', INTERVAL_MAP[resolution]);
    url.searchParams.set('period1', String(period1));
    url.searchParams.set('period2', String(period2));

    const res = await fetch(url.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YooTrade/1.0)' },
    });
    if (!res.ok) throw new Error(`Yahoo Finance request failed: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) throw new Error(`No Yahoo Finance data for ${yahooSymbol}`);

    const timestamps: number[] = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const candles: Candle[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      const close = quote.close?.[i];
      if (open == null || high == null || low == null || close == null) continue;
      candles.push({ time: timestamps[i], open, high, low, close, volume: quote.volume?.[i] ?? 0 });
    }

    if (candles.length > 0) cache.set(key, { fetchedAt: Date.now(), candles });
    return candles;
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    return Object.keys(YAHOO_FUTURES_SYMBOL_MAP)
      .filter((s) => s.includes(q))
      .map((s) => ({ symbol: s, name: `${s} (Yahoo Finance)` }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const yahooSymbol = this.resolveSymbol(symbol);
    const candles = await this.fetchChart(yahooSymbol, 'D', 5);
    if (candles.length === 0) throw new Error(`No recent Yahoo Finance data for ${symbol}`);
    const latest = candles[candles.length - 1];
    const prior = candles.length > 1 ? candles[candles.length - 2] : latest;
    const price = latest.close;
    const prevClose = prior.close;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose,
      open: latest.open,
      high: latest.high,
      low: latest.low,
      change: price - prevClose,
      changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    const yahooSymbol = this.resolveSymbol(symbol);
    return this.fetchChart(yahooSymbol, resolution, days);
  }
}
