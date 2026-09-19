import type { Candle } from './api';

export interface MacdPoint {
  time: number;
  macd: number;
  signal: number;
  histogram: number;
}

function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

/**
 * Standard MACD(12,26,9): fast EMA minus slow EMA, with a 9-period EMA of
 * that difference as the signal line. Every value at index i is derived
 * only from candles[0..i] -- same backward-only recursion as computeEMA --
 * so it recalculates cleanly off whatever prefix of history is visible.
 */
export function computeMACD(candles: Candle[], fast = 12, slow = 26, signalPeriod = 9): MacdPoint[] {
  if (candles.length === 0) return [];
  const closes = candles.map((c) => c.close);
  const fastEma = emaSeries(closes, fast);
  const slowEma = emaSeries(closes, slow);
  const macdLine = fastEma.map((v, i) => v - slowEma[i]);
  const signalLine = emaSeries(macdLine, signalPeriod);
  return candles.map((c, i) => ({
    time: c.time,
    macd: macdLine[i],
    signal: signalLine[i],
    histogram: macdLine[i] - signalLine[i],
  }));
}
