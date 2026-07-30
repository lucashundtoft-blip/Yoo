import type { Candle } from './api';

// Heikin-Ashi smooths price action into trend-following candles. Values are
// derived sequentially from the real OHLC, so they're display-only — actual
// trade execution, SMA/RSI, and the trend projection all stay on real candles.
export function toHeikinAshi(candles: Candle[]): Candle[] {
  const result: Candle[] = [];
  let prevOpen = 0;
  let prevClose = 0;

  candles.forEach((c, i) => {
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const haOpen = i === 0 ? (c.open + c.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);

    result.push({ ...c, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevOpen = haOpen;
    prevClose = haClose;
  });

  return result;
}
