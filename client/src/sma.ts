import type { Candle } from './api';

export interface SmaPoint {
  time: number;
  value: number;
}

// Plots from the first candle using a running average over whatever history
// is available, converging to the true N-period SMA once N candles have
// accumulated — matches how most charting tools draw an SMA rather than
// waiting for a full period of history before showing anything.
export function computeSMA(candles: Candle[], period: number): SmaPoint[] {
  if (period <= 0) return [];
  const result: SmaPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    const windowSize = Math.min(i + 1, period);
    result.push({ time: candles[i].time, value: sum / windowSize });
  }
  return result;
}

export const SMA_COLORS: Record<number, string> = {
  20: '#a855f7',
  50: '#f0883e',
  100: '#22d3ee',
  200: '#ec4899',
  400: '#eab308',
};
