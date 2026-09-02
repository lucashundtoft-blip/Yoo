import type { Candle } from './types.js';

/** Price Volume Trend: a running cumulative total that adds volume weighted
 * by each bar's percent price change. Its absolute value is meaningless --
 * only its slope relative to price's slope over the same window matters. */
export function computePvt(candles: Candle[]): number[] {
  const pvt: number[] = new Array(candles.length).fill(0);
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1].close;
    const pctChange = prevClose ? (candles[i].close - prevClose) / prevClose : 0;
    pvt[i] = pvt[i - 1] + candles[i].volume * pctChange;
  }
  return pvt;
}
