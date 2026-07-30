import { db } from './db.js';

export function getWatchlist(): string[] {
  const rows = db.prepare('SELECT symbol FROM watchlist ORDER BY added_at ASC').all() as {
    symbol: string;
  }[];
  return rows.map((r) => r.symbol);
}

export function addToWatchlist(symbol: string): void {
  symbol = symbol.toUpperCase();
  db.prepare(
    'INSERT OR IGNORE INTO watchlist (symbol, name, added_at) VALUES (?, NULL, ?)'
  ).run(symbol, new Date().toISOString());
}

export function removeFromWatchlist(symbol: string): void {
  db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol.toUpperCase());
}
