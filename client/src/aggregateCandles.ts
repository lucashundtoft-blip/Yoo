import type { Candle } from './api';

/** Groups every `groupSize` consecutive candles into one bar -- for rolling
 * finer bars (e.g. 5-min) into a coarser fixed-size bucket (e.g. 15-min). */
export function aggregateByCount(candles: Candle[], groupSize: number): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i += groupSize) {
    const group = candles.slice(i, i + groupSize);
    if (group.length === 0) continue;
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    });
  }
  return out;
}

function periodKey(unixSeconds: number, period: 'week' | 'month'): string {
  const d = new Date(unixSeconds * 1000);
  if (period === 'month') return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  // ISO-ish week bucket: days since epoch, floored to a 7-day block. Good
  // enough for chart bucketing -- doesn't need to align to real ISO weeks.
  const dayIndex = Math.floor(unixSeconds / 86400);
  const weekIndex = Math.floor((dayIndex + 3) / 7); // +3 shifts the epoch (a Thursday) so buckets land on Monday-ish boundaries
  return `w${weekIndex}`;
}

/** Rolls daily candles up into calendar-week or calendar-month bars, since
 * weeks/months don't have a fixed number of trading days like intraday
 * bucketing does. */
export function aggregateByCalendarPeriod(candles: Candle[], period: 'week' | 'month'): Candle[] {
  const out: Candle[] = [];
  let currentKey: string | null = null;
  let group: Candle[] = [];

  const flush = () => {
    if (group.length === 0) return;
    out.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, c) => sum + c.volume, 0),
    });
    group = [];
  };

  for (const candle of candles) {
    const key = periodKey(candle.time, period);
    if (key !== currentKey) {
      flush();
      currentKey = key;
    }
    group.push(candle);
  }
  flush();
  return out;
}
