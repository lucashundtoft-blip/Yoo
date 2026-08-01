import { db } from './db.js';

export interface ChallengeRun {
  id: number;
  symbol: string;
  datasetLabel: string;
  bars: number;
  yourReturnPct: number;
  buyHoldReturnPct: number;
  alphaPct: number;
  tradeCount: number;
  score: number;
  createdAt: string;
}

export interface ChallengeRunInput {
  symbol: string;
  datasetLabel: string;
  bars: number;
  yourReturnPct: number;
  buyHoldReturnPct: number;
  alphaPct: number;
  tradeCount: number;
  score: number;
}

export interface ChallengeStats {
  totalRuns: number;
  wins: number;
  bestScore: number;
  bestAlphaPct: number;
}

interface ChallengeRunRow {
  id: number;
  symbol: string;
  dataset_label: string;
  bars: number;
  your_return_pct: number;
  buy_hold_return_pct: number;
  alpha_pct: number;
  trade_count: number;
  score: number;
  created_at: string;
}

function rowToRun(row: ChallengeRunRow): ChallengeRun {
  return {
    id: row.id,
    symbol: row.symbol,
    datasetLabel: row.dataset_label,
    bars: row.bars,
    yourReturnPct: row.your_return_pct,
    buyHoldReturnPct: row.buy_hold_return_pct,
    alphaPct: row.alpha_pct,
    tradeCount: row.trade_count,
    score: row.score,
    createdAt: row.created_at,
  };
}

export function recordChallengeRun(input: ChallengeRunInput): ChallengeRun {
  const createdAt = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO challenge_runs
        (symbol, dataset_label, bars, your_return_pct, buy_hold_return_pct, alpha_pct, trade_count, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.symbol.toUpperCase(),
      input.datasetLabel,
      input.bars,
      input.yourReturnPct,
      input.buyHoldReturnPct,
      input.alphaPct,
      input.tradeCount,
      input.score,
      createdAt
    );
  const row = db.prepare('SELECT * FROM challenge_runs WHERE id = ?').get(result.lastInsertRowid) as ChallengeRunRow;
  return rowToRun(row);
}

export function listChallengeRuns(limit = 20): ChallengeRun[] {
  const rows = db.prepare('SELECT * FROM challenge_runs ORDER BY id DESC LIMIT ?').all(limit) as ChallengeRunRow[];
  return rows.map(rowToRun);
}

export function getChallengeStats(): ChallengeStats {
  const row = db
    .prepare(
      `SELECT COUNT(*) as totalRuns,
              SUM(CASE WHEN alpha_pct > 0 THEN 1 ELSE 0 END) as wins,
              MAX(score) as bestScore,
              MAX(alpha_pct) as bestAlphaPct
       FROM challenge_runs`
    )
    .get() as { totalRuns: number; wins: number | null; bestScore: number | null; bestAlphaPct: number | null };
  return {
    totalRuns: row.totalRuns ?? 0,
    wins: row.wins ?? 0,
    bestScore: row.bestScore ?? 0,
    bestAlphaPct: row.bestAlphaPct ?? 0,
  };
}
