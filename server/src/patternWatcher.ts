import { db } from './db.js';
import { marketData } from './marketData/index.js';
import { computePvt } from './marketData/pvt.js';
import type { Candle } from './marketData/types.js';

/** Symbols this watcher scans. Currently all run on whatever provider
 * marketData resolves them to -- real data if one is wired up for a symbol,
 * simulated placeholder data otherwise (true for all four today, since no
 * free intraday futures feed exists for any of them). */
export const WATCHED_SYMBOLS = ['MCL', 'MGC', 'SIL', 'MHG'];

const LOOKBACK_BARS = 12; // ~1 hour of 5-min bars
const MIN_PRICE_MOVE_PCT = 0.4; // ignore moves smaller than this over the window
const FLAT_PVT_THRESHOLD = 0.25; // pvt slope must clear this fraction of its own recent volatility to count as "confirming"
const MIN_GAP_BETWEEN_ALERTS_MS = 30 * 60 * 1000; // don't re-alert the same symbol/kind within this window

export interface PatternAlert {
  id: number;
  symbol: string;
  kind: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE';
  price: number;
  priceChangePercent: number;
  createdAt: string;
}

function rowToAlert(row: any): PatternAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    kind: row.kind,
    price: row.price,
    priceChangePercent: row.price_change_percent,
    createdAt: row.created_at,
  };
}

export function getRecentAlerts(limit = 50): PatternAlert[] {
  return db
    .prepare('SELECT * FROM pattern_alerts ORDER BY id DESC LIMIT ?')
    .all(limit)
    .map(rowToAlert);
}

function recordAlert(symbol: string, kind: PatternAlert['kind'], price: number, priceChangePercent: number) {
  const recent = db
    .prepare(
      "SELECT created_at FROM pattern_alerts WHERE symbol = ? AND kind = ? ORDER BY id DESC LIMIT 1"
    )
    .get(symbol, kind) as { created_at: string } | undefined;
  if (recent && Date.now() - new Date(recent.created_at).getTime() < MIN_GAP_BETWEEN_ALERTS_MS) {
    return; // already alerted on this symbol/kind recently, don't spam
  }
  db.prepare(
    'INSERT INTO pattern_alerts (symbol, kind, price, price_change_percent, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(symbol, kind, price, priceChangePercent, new Date().toISOString());
}

/** Detects the price-vs-PVT divergence pattern over the last LOOKBACK_BARS
 * bars: a meaningful price move that the volume-weighted PVT line doesn't
 * confirm (flat or opposite-signed), the same shape we use to read charts by
 * hand -- see the PVT divergence panels shown earlier in this session. */
function detectDivergence(candles: Candle[]): { kind: PatternAlert['kind']; priceChangePercent: number } | null {
  if (candles.length < LOOKBACK_BARS + 1) return null;
  const window = candles.slice(-LOOKBACK_BARS - 1);
  const pvt = computePvt(window);

  const priceStart = window[0].close;
  const priceEnd = window[window.length - 1].close;
  const priceChangePercent = priceStart ? ((priceEnd - priceStart) / priceStart) * 100 : 0;
  if (Math.abs(priceChangePercent) < MIN_PRICE_MOVE_PCT) return null;

  const pvtDeltas: number[] = [];
  for (let i = 1; i < pvt.length; i++) pvtDeltas.push(pvt[i] - pvt[i - 1]);
  const pvtSlope = pvt[pvt.length - 1] - pvt[0];
  const avgAbsDelta = pvtDeltas.reduce((sum, d) => sum + Math.abs(d), 0) / pvtDeltas.length || 1;
  const normalizedPvtSlope = pvtSlope / (avgAbsDelta * pvtDeltas.length || 1);

  const priceDirection = priceChangePercent > 0 ? 1 : -1;
  const pvtDirection = Math.abs(normalizedPvtSlope) < FLAT_PVT_THRESHOLD ? 0 : Math.sign(normalizedPvtSlope);

  if (pvtDirection === priceDirection) return null; // confirmed move, not a divergence

  return {
    kind: priceDirection < 0 ? 'BULLISH_DIVERGENCE' : 'BEARISH_DIVERGENCE',
    priceChangePercent,
  };
}

export async function checkPatterns(symbols: string[] = WATCHED_SYMBOLS): Promise<void> {
  for (const symbol of symbols) {
    try {
      const candles = await marketData.getCandles(symbol, '5', 1);
      const result = detectDivergence(candles);
      if (!result) continue;
      const price = candles[candles.length - 1].close;
      recordAlert(symbol, result.kind, price, result.priceChangePercent);
    } catch (err) {
      console.error(`Pattern check failed for ${symbol}:`, err);
    }
  }
}
