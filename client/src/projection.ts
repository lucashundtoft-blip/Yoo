import type { Candle, Projection, ProjectionPoint } from './api';

export interface TrendChannel {
  upper: ProjectionPoint[];
  lower: ProjectionPoint[];
}

// A linear-regression channel: two lines parallel to the trendline (and its
// forecast), offset to just contain the highs/lows seen during the lookback
// window — the "trend lines on both sides" bracketing price action.
export function computeTrendChannel(candles: Candle[], projection: Projection): TrendChannel {
  const byTime = new Map(candles.map((c) => [c.time, c]));
  let maxAbove = 0;
  let maxBelow = 0;
  for (const p of projection.trendline) {
    const c = byTime.get(p.time);
    if (!c) continue;
    maxAbove = Math.max(maxAbove, c.high - p.value);
    maxBelow = Math.max(maxBelow, p.value - c.low);
  }
  const allPoints = [...projection.trendline, ...projection.forecast];
  return {
    upper: allPoints.map((p) => ({ time: p.time, value: p.value + maxAbove })),
    lower: allPoints.map((p) => ({ time: p.time, value: p.value - maxBelow })),
  };
}

/** Client-side mirror of the server's linear-regression trend projection,
 * used in replay mode where the projection must only see revealed candles. */
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
  const meanX = (n - 1) / 2;
  const meanY = window.reduce((sum, c) => sum + c.close, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (window[i].close - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const stepSeconds =
    window.length > 1 ? window[window.length - 1].time - window[window.length - 2].time : 86400;

  const trendline = window.map((c, i) => ({ time: c.time, value: intercept + slope * i }));

  const lastTime = window[window.length - 1].time;
  const forecast = [];
  for (let i = 1; i <= forecastPeriods; i++) {
    forecast.push({ time: lastTime + i * stepSeconds, value: intercept + slope * (n - 1 + i) });
  }

  const relativeSlope = meanY !== 0 ? slope / meanY : 0;
  const direction = relativeSlope > 0.0005 ? 'up' : relativeSlope < -0.0005 ? 'down' : 'flat';

  return { trendline, forecast, slopePerDay: slope, direction };
}
