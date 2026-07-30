import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const STARTING_BALANCE = 100_000;

export const db = new Database(path.join(dataDir, 'yoo.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS positions (
    symbol TEXT PRIMARY KEY,
    quantity REAL NOT NULL,
    avg_cost REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    symbol TEXT PRIMARY KEY,
    name TEXT,
    added_at TEXT NOT NULL
  );
`);

const existingAccount = db.prepare('SELECT id FROM account WHERE id = 1').get();
if (!existingAccount) {
  db.prepare('INSERT INTO account (id, cash) VALUES (1, ?)').run(STARTING_BALANCE);
}

const defaultWatchlist = ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN'];
const insertWatch = db.prepare(
  'INSERT OR IGNORE INTO watchlist (symbol, name, added_at) VALUES (?, NULL, ?)'
);
const watchCount = (db.prepare('SELECT COUNT(*) as c FROM watchlist').get() as { c: number }).c;
if (watchCount === 0) {
  const now = new Date().toISOString();
  for (const symbol of defaultWatchlist) insertWatch.run(symbol, now);
}
