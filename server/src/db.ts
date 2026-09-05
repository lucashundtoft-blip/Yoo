import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

export const STARTING_BALANCE = 100_000;
export const STARTING_FUTURES_BALANCE = 50_000;

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

  CREATE TABLE IF NOT EXISTS pattern_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('BULLISH_DIVERGENCE', 'BEARISH_DIVERGENCE')),
    price REAL NOT NULL,
    price_change_percent REAL NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bracket_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    quantity REAL NOT NULL,
    take_profit_price REAL,
    stop_loss_price REAL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FILLED', 'CANCELLED')),
    created_at TEXT NOT NULL,
    filled_at TEXT,
    filled_price REAL,
    filled_leg TEXT CHECK (filled_leg IN ('TP', 'SL'))
  );

  CREATE TABLE IF NOT EXISTS futures_account (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS futures_positions (
    symbol TEXT PRIMARY KEY,
    quantity REAL NOT NULL, -- signed: positive = long, negative = short
    avg_price REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS futures_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    quantity REAL NOT NULL,
    price REAL NOT NULL,
    realized_pl REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS futures_bracket_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')), -- side of the entry: BUY=long, SELL=short
    quantity REAL NOT NULL,
    take_profit_price REAL,
    stop_loss_price REAL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FILLED', 'CANCELLED')),
    created_at TEXT NOT NULL,
    filled_at TEXT,
    filled_price REAL,
    filled_leg TEXT CHECK (filled_leg IN ('TP', 'SL'))
  );

  CREATE TABLE IF NOT EXISTS alpaca_connection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    token_type TEXT NOT NULL,
    scope TEXT,
    connected_at TEXT NOT NULL
  );
`);

// Trailing-stop support was added after these tables shipped -- add the
// columns to any pre-existing database rather than requiring a fresh one.
function ensureColumn(table: string, column: string, ddl: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
for (const table of ['bracket_orders', 'futures_bracket_orders']) {
  ensureColumn(table, 'trail_percent', 'trail_percent REAL');
  ensureColumn(table, 'high_water_mark', 'high_water_mark REAL');
}

const existingFuturesAccount = db.prepare('SELECT id FROM futures_account WHERE id = 1').get();
if (!existingFuturesAccount) {
  db.prepare('INSERT INTO futures_account (id, cash) VALUES (1, ?)').run(STARTING_FUTURES_BALANCE);
}

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
