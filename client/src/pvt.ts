import type { Candle } from './api';

export interface PvtPoint {
  time: number;
  value: number;
}

/** Price Volume Trend: a running cumulative total that adds volume weighted
 * by each bar's percent price change. Its absolute value is meaningless --
 * only its slope relative to price's slope over the same window matters
 * (this is the exact indicator behind the pattern-alert watcher's
 * divergence detection). */
export function computePVT(candles: Candle[]): PvtPoint[] {
  const points: PvtPoint[] = [];
  let pvt = 0;
  for (let i = 0; i < candles.length; i++) {
    if (i > 0) {
      const prevClose = candles[i - 1].close;
      const pctChange = prevClose ? (candles[i].close - prevClose) / prevClose : 0;
      pvt += candles[i].volume * pctChange;
    }
    points.push({ time: candles[i].time, value: pvt });
  }
  return points;
}

/** An EMA of the PVT line itself, smoothing it into a "Signal" line --
 * matches Webull's "Price Volume Trend (EMA,120)" panel, where crossovers
 * between PVT and its signal line are read the same way an EMA crossover on
 * price would be. */
export function computePVTSignal(pvt: PvtPoint[], period: number): PvtPoint[] {
  if (pvt.length === 0) return [];
  const k = 2 / (period + 1);
  const signal: PvtPoint[] = [{ time: pvt[0].time, value: pvt[0].value }];
  for (let i = 1; i < pvt.length; i++) {
    const prev = signal[i - 1].value;
    signal.push({ time: pvt[i].time, value: pvt[i].value * k + prev * (1 - k) });
  }
  return signal;
}
