import type { Candle } from './api';

export interface RsiPoint {
  time: number;
  value: number;
}

/** Standard Wilder-smoothed RSI. */
export function computeRSI(candles: Candle[], period = 14): RsiPoint[] {
  if (candles.length < period + 1) return [];

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const toRsi = (gain: number, loss: number) => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));

  const result: RsiPoint[] = [{ time: candles[period].time, value: toRsi(avgGain, avgLoss) }];

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result.push({ time: candles[i].time, value: toRsi(avgGain, avgLoss) });
  }

  return result;
}
