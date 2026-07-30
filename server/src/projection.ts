import type { Candle } from './marketData/types.js';

export interface ProjectionPoint {
  time: number;
  value: number;
}

export interface Projection {
  trendline: ProjectionPoint[]; // fitted line over the lookback window
  forecast: ProjectionPoint[]; // projected extension into the future
  slopePerDay: number;
  direction: 'up' | 'down' | 'flat';
}

/**
 * Simple linear-regression trend projection: fits a least-squares line over
 * the closing prices of the lookback window, then extends it forward.
 * This is classic TA-style trend extrapolation, not a statistical forecast -
 * it shows "if the recent trend continues" rather than predicting reversals.
 */
export function computeProjection(
  candles: Candle[],
  options: { lookback?: number; forecastPeriods?: number } = {}
): Projection {
  const lookback = options.lookback ?? Math.min(30, candles.length);
  const forecastPeriods = options.forecastPeriods ?? Math.round(lookback / 3);
  const window = candles.slice(-lookback);

  if (window.length < 2) {
    return { trendline: [], forecast: [], slopePerDay: 0, direction: 'flat' };
  }

  const n = window.length;
  const xs = window.map((_, i) => i);
  const ys = window.map((c) => c.close);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const stepSeconds =
    window.length > 1 ? window[window.length - 1].time - window[window.length - 2].time : 86400;

  const trendline: ProjectionPoint[] = window.map((c, i) => ({
    time: c.time,
    value: intercept + slope * i,
  }));

  const lastTime = window[window.length - 1].time;
  const forecast: ProjectionPoint[] = [];
  for (let i = 1; i <= forecastPeriods; i++) {
    forecast.push({
      time: lastTime + i * stepSeconds,
      value: intercept + slope * (n - 1 + i),
    });
  }

  const relativeSlope = meanY !== 0 ? slope / meanY : 0;
  const direction = relativeSlope > 0.0005 ? 'up' : relativeSlope < -0.0005 ? 'down' : 'flat';

  return { trendline, forecast, slopePerDay: slope, direction };
}
