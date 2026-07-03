import type { Candle, MarketDataProvider, Quote, Resolution, SearchResult } from './types.js';
import { isUsMarketOpen } from './marketHours.js';

// Deterministic PRNG so a symbol's price history looks the same across requests
// within the same session, but each symbol gets its own distinct-looking path.
function hashString(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KNOWN_STOCKS: SearchResult[] = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.' },
  { symbol: 'TSLA', name: 'Tesla Inc.' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation' },
  { symbol: 'META', name: 'Meta Platforms Inc.' },
  { symbol: 'NFLX', name: 'Netflix Inc.' },
  { symbol: 'AMD', name: 'Advanced Micro Devices Inc.' },
  { symbol: 'INTC', name: 'Intel Corporation' },
  { symbol: 'BA', name: 'Boeing Company' },
  { symbol: 'DIS', name: 'Walt Disney Company' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.' },
  { symbol: 'V', name: 'Visa Inc.' },
  { symbol: 'WMT', name: 'Walmart Inc.' },
  { symbol: 'KO', name: 'Coca-Cola Company' },
  { symbol: 'PLTR', name: 'Palantir Technologies Inc.' },
  { symbol: 'COIN', name: 'Coinbase Global Inc.' },
  { symbol: 'SPY', name: 'SPDR S&P 500 ETF Trust' },
  { symbol: 'QQQ', name: 'Invesco QQQ Trust' },
];

function basePriceFor(symbol: string): number {
  const seed = hashString(symbol);
  const rand = mulberry32(seed)();
  return 20 + rand * 480; // $20 - $500
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Builds a deterministic-per-day daily candle series ending "today". */
function buildDailySeries(symbol: string, days: number): Candle[] {
  const seed = hashString(symbol);
  const rand = mulberry32(seed);
  let price = basePriceFor(symbol);
  const drift = (rand() - 0.48) * 0.0015; // slight per-day drift, symbol-specific
  const candles: Candle[] = [];
  const now = Date.now();
  const todayStart = Math.floor(now / DAY_MS) * DAY_MS;

  for (let i = days; i >= 0; i--) {
    const t = todayStart - i * DAY_MS;
    const volatility = 0.015 + rand() * 0.01;
    const open = price;
    const change = open * (drift + (rand() - 0.5) * volatility * 2);
    let close = Math.max(1, open + change);
    const high = Math.max(open, close) * (1 + rand() * 0.008);
    const low = Math.min(open, close) * (1 - rand() * 0.008);
    const volume = Math.round(1_000_000 + rand() * 9_000_000);
    candles.push({ time: Math.floor(t / 1000), open, high, low, close, volume });
    price = close;
  }
  return candles;
}

/** Extends today's price with a small live-looking tick based on current time. */
function liveTick(symbol: string, lastClose: number): number {
  const minuteBucket = Math.floor(Date.now() / (60 * 1000));
  const rand = mulberry32(hashString(symbol + ':' + minuteBucket));
  const wiggle = (rand() - 0.5) * 0.006; // +/-0.3% per minute bucket
  return Math.max(0.01, lastClose * (1 + wiggle));
}

export class SimulatedProvider implements MarketDataProvider {
  readonly name = 'simulated';

  async search(query: string): Promise<SearchResult[]> {
    const q = query.trim().toUpperCase();
    if (!q) return [];
    const matches = KNOWN_STOCKS.filter(
      (s) => s.symbol.includes(q) || s.name.toUpperCase().includes(q)
    );
    if (matches.length > 0) return matches.slice(0, 15);
    // Unknown symbol: still let the user "practice" on any ticker they type.
    if (/^[A-Z.]{1,6}$/.test(q)) {
      return [{ symbol: q, name: `${q} (simulated)` }];
    }
    return [];
  }

  async getQuote(symbol: string): Promise<Quote> {
    const series = buildDailySeries(symbol, 2);
    const prevClose = series[series.length - 2].close;
    const todayOpen = series[series.length - 1].open;
    const rawClose = series[series.length - 1].close;
    const price = liveTick(symbol, rawClose);
    const high = Math.max(series[series.length - 1].high, price);
    const low = Math.min(series[series.length - 1].low, price);
    const change = price - prevClose;
    return {
      symbol: symbol.toUpperCase(),
      price,
      prevClose,
      open: todayOpen,
      high,
      low,
      change,
      changePercent: (change / prevClose) * 100,
      marketOpen: isUsMarketOpen(),
      timestamp: Date.now(),
    };
  }

  async getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]> {
    const daily = buildDailySeries(symbol, days);
    if (resolution === 'D') return daily;

    // Synthesize intraday candles by subdividing each day for '5' or '60' resolutions.
    const stepMinutes = resolution === '5' ? 5 : 60;
    const perDay = Math.floor((6.5 * 60) / stepMinutes); // ~ trading session length
    const out: Candle[] = [];
    for (const day of daily) {
      const rand = mulberry32(hashString(symbol + ':' + day.time));
      let price = day.open;
      const range = day.high - day.low || day.open * 0.01;
      for (let i = 0; i < perDay; i++) {
        const t = day.time + i * stepMinutes * 60;
        const open = price;
        const close = Math.max(0.01, open + (rand() - 0.5) * range * 0.3);
        const high = Math.max(open, close) + rand() * range * 0.05;
        const low = Math.min(open, close) - rand() * range * 0.05;
        out.push({
          time: t,
          open,
          high,
          low: Math.max(0.01, low),
          close,
          volume: Math.round((day.volume / perDay) * (0.5 + rand())),
        });
        price = close;
      }
    }
    return out;
  }
}
