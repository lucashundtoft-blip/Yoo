import type { Candle } from './api';

export interface SmaPoint {
  time: number;
  value: number;
}

export function computeSMA(candles: Candle[], period: number): SmaPoint[] {
  if (period <= 0 || candles.length < period) return [];
  const result: SmaPoint[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].close;
    if (i >= period) sum -= candles[i - period].close;
    if (i >= period - 1) result.push({ time: candles[i].time, value: sum / period });
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
