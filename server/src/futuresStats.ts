import { FUTURES_CONTRACTS, type FuturesContract } from './futuresContracts.js';
import { marketData, type Candle } from './marketData/index.js';

export interface FuturesStat {
  symbol: string;
  name: string;
  group: string;
  tickSize: number;
  tickValue: number;
  multiplier: number;
  approxMargin: number;
  /** Average true range over the lookback window, in price points. Null when
   *  the provider couldn't return enough history for this contract. */
  atrPoints: number | null;
  /** What that average day is worth on one contract, in dollars. */
  atrDollars: number | null;
  /** How many ticks the contract travels in an average day -- the "how fast
   *  does this thing move" number, independent of what a tick is worth. */
  atrTicks: number | null;
  /** Average day's dollar range as a percentage of the margin it takes to
   *  hold one contract. High = a lot of movement per dollar tied up. */
  atrPercentOfMargin: number | null;
  /** Most recent close, for context on where the contract trades. */
  lastPrice: number | null;
}

const ATR_PERIOD = 14;
const LOOKBACK_DAYS = 40;
// Daily-bar ATR barely moves intraday, and this fans out one request per
// contract, so cache hard rather than hammering the upstream provider.
const CACHE_MS = 6 * 60 * 60 * 1000;

let cache: { at: number; stats: FuturesStat[] } | null = null;

/** Wilder's true range: the widest of today's range, or today's high/low
 *  measured against yesterday's close (which captures overnight gaps). */
function trueRange(candle: Candle, prevClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - prevClose),
    Math.abs(candle.low - prevClose)
  );
}

function averageTrueRange(candles: Candle[], period: number): number | null {
  if (candles.length < 2) return null;
  const ranges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    ranges.push(trueRange(candles[i], candles[i - 1].close));
  }
  const window = ranges.slice(-period);
  if (window.length === 0) return null;
  return window.reduce((sum, r) => sum + r, 0) / window.length;
}

async function statForContract(contract: FuturesContract): Promise<FuturesStat> {
  const base = {
    symbol: contract.symbol,
    name: contract.name,
    group: contract.group,
    tickSize: contract.tickSize,
    tickValue: contract.tickValue,
    multiplier: contract.multiplier,
    approxMargin: contract.approxMargin,
  };

  let candles: Candle[] = [];
  try {
    candles = await marketData.getCandles(contract.symbol, 'D', LOOKBACK_DAYS);
  } catch {
    // A single contract failing upstream shouldn't blank out the whole table.
    return { ...base, atrPoints: null, atrDollars: null, atrTicks: null, atrPercentOfMargin: null, lastPrice: null };
  }

  const atrPoints = averageTrueRange(candles, ATR_PERIOD);
  const lastPrice = candles.length > 0 ? candles[candles.length - 1].close : null;
  if (atrPoints === null) {
    return { ...base, atrPoints: null, atrDollars: null, atrTicks: null, atrPercentOfMargin: null, lastPrice };
  }

  const atrDollars = atrPoints * contract.multiplier;
  return {
    ...base,
    atrPoints,
    atrDollars,
    atrTicks: atrPoints / contract.tickSize,
    atrPercentOfMargin: (atrDollars / contract.approxMargin) * 100,
    lastPrice,
  };
}

export async function getFuturesStats(): Promise<FuturesStat[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.stats;
  const stats = await Promise.all(FUTURES_CONTRACTS.map(statForContract));
  cache = { at: Date.now(), stats };
  return stats;
}
