import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

const BASE_URL = 'https://hist.databento.com/v0';
const DATASET = 'GLBX.MDP3'; // CME Globex MDP 3.0 -- covers CME futures, incl. these micros

/** App symbol -> Databento continuous front-month contract symbol.
 * These are the four symbols the pattern-alert watcher tracks (see
 * patternWatcher.ts); this is the Historical API used as a near-real-time
 * feed via short-TTL polling, not Databento's low-latency Live gateway
 * (which needs a persistent binary connection -- a bigger architectural
 * change than this polling-based provider chain is built for today). */
export const DATABENTO_SYMBOL_MAP: Record<string, string> = {
  MCL: 'MCL.c.0',
  MGC: 'MGC.c.0',
  SIL: 'SIL.c.0',
  MHG: 'MHG.c.0',
};

const SCHEMA_CACHE_TTL_MS: Record<string, number> = {
  'ohlcv-1m': 20_000,
  'ohlcv-1h': 5 * 60_000,
  'ohlcv-1d': 30 * 60_000,
};

interface DatabentoRecord {
  ts_event: string | number;
  open: number | string;
  high: number | string;
  low: number | string;
  close: number | string;
  volume: number | string;
}

function toCandle(r: DatabentoRecord): Candle {
  const tsNanos = typeof r.ts_event === 'string' ? BigInt(r.ts_event) : BigInt(Math.round(r.ts_event));
  return {
    time: Number(tsNanos / 1_000_000_000n),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
  };
}

function aggregate(candles: Candle[], groupSize: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    if (group.length === 0) continue;
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return out;
}

/** Per-(symbol, schema) cache, ignoring the exact start/end requested, so the
 * app's own polling (an 8s quote refresh on the stock page, a 15s bracket
 * checker, a 60s pattern watcher) doesn't turn into a Databento API call on
 * every single tick -- billed data volume adds up fast otherwise. */
const cache = new Map<string, { fetchedAt: number; candles: Candle[] }>();

export class DatabentoProvider implements MarketDataProvider {
  readonly name = 'databento';

  constructor(private readonly apiKey: string) {}

  private authHeader(): string {
    return 'Basic ' + Buffer.from(`${this.apiKey}:`).toString('base64');
  }

  private resolveSymbol(symbol: string): string {
    const dbSymbol = DATABENTO_SYMBOL_MAP[symbol.toUpperCase()];
    if (!dbSymbol) throw new Error(`No Databento mapping for symbol ${symbol}`);
    return dbSymbol;
  }

  private async fetchRange(dbSymbol: string, schema: string, start: Date, end: Date): Promise<Candle[]> {
    const url = new URL(`${BASE_URL}/timeseries.get_range`);
    url.searchParams.set('dataset', DATASET);
    url.searchParams.set('symbols', dbSymbol);
    url.searchParams.set('schema', schema);
    url.searchParams.set('stype_in', 'continuous');
    url.searchParams.set('start', start.toISOString());
    url.searchParams.set('end', end.toISOString());
    url.searchParams.set('encoding', 'json');
    url.searchParams.set('limit', '500');

    const res = await fetch(url.toString(), { headers: { Authorization: this.authHeader() } });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Databento request failed: ${res.status} ${res.statusText} ${body.slice(0, 200)}`);
    }
    // encoding=json returns newline-delimited JSON, not a single JSON array.
    const text = await res.text();
    const candles: Candle[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        candles.push(toCandle(JSON.parse(trimmed)));
      } catch {
        // skip a malformed/partial line rather than failing the whole fetch
      }
    }
    return candles.sort((a, b) => a.time - b.time);
  }

  private async fetchRangeCached(dbSymbol: string, schema: string, start: Date, end: Date): Promise<Candle[]> {
    const key = `${dbSymbol}:${schema}`;
    const ttl = SCHEMA_CACHE_TTL_MS[schema] ?? 30_000;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < ttl) return cached.candles;
    const candles = await this.fetchRange(dbSymbol, schema, start, end);
    if (candles.length > 0) cache.set(key, { fetchedAt: Date.now(), candles });
    return candles;
  }

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    return Object.keys(DATABENTO_SYMBOL_MAP)
      .filter((s) => s.includes(q))
      .map((s) => ({ symbol: s, name: `${s} (Databento, CME Globex)` }));
  }

  async getQuote(symbol: string): Promise<Quote> {
    const dbSymbol = this.resolveSymbol(symbol);
    const end = new Date();
    const start = new Date(end.getTime() - 3 * 60 * 60 * 1000); // recent window, not full session
    const candles = await this.fetchRangeCached(dbSymbol, 'ohlcv-1m', start, end);
    if (candles.length === 0) throw new Error(`No recent Databento data for ${symbol}`);
    const latest = candles[candles.length - 1];
    const prior = candles.length > 1 ? candles[candles.length - 2] : latest;
    const price = latest.close;
    const prevClose = prior.close;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose,
      open: candles[0].open,
      high: Math.max(...candles.map((c) => c.high)),
      low: Math.min(...candles.map((c) => c.low)),
      change: price - prevClose,
      changePercent: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    const dbSymbol = this.resolveSymbol(symbol);
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);

    if (resolution === 'D') return this.fetchRangeCached(dbSymbol, 'ohlcv-1d', start, end);
    if (resolution === '60') return this.fetchRangeCached(dbSymbol, 'ohlcv-1h', start, end);

    // Databento's finest OHLCV schema is 1-minute; aggregate into 5-minute
    // bars ourselves for a '5' resolution request.
    const oneMin = await this.fetchRangeCached(dbSymbol, 'ohlcv-1m', start, end);
    return aggregate(oneMin, 5);
  }
}
