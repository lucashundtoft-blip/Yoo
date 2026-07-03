import { db, STARTING_BALANCE } from './db.js';

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
}

export interface Order {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
}

export class TradingError extends Error {}

export function getCash(): number {
  const row = db.prepare('SELECT cash FROM account WHERE id = 1').get() as { cash: number };
  return row.cash;
}

export function getPositions(): Position[] {
  const rows = db
    .prepare('SELECT symbol, quantity, avg_cost as avgCost FROM positions WHERE quantity > 0')
    .all() as Position[];
  return rows;
}

export function getPosition(symbol: string): Position | undefined {
  return db
    .prepare('SELECT symbol, quantity, avg_cost as avgCost FROM positions WHERE symbol = ?')
    .get(symbol.toUpperCase()) as Position | undefined;
}

export function getOrders(): Order[] {
  return db
    .prepare(
      'SELECT id, symbol, side, quantity, price, total, created_at as createdAt FROM orders ORDER BY id DESC'
    )
    .all() as Order[];
}

export function buy(symbol: string, quantity: number, price: number): Order {
  symbol = symbol.toUpperCase();
  if (quantity <= 0) throw new TradingError('Quantity must be positive');
  if (price <= 0) throw new TradingError('Invalid price');
  const total = quantity * price;
  const cash = getCash();
  if (total > cash) throw new TradingError('Insufficient cash for this order');

  const tx = db.transaction(() => {
    db.prepare('UPDATE account SET cash = cash - ? WHERE id = 1').run(total);
    const existing = getPosition(symbol);
    if (existing) {
      const newQty = existing.quantity + quantity;
      const newAvgCost = (existing.avgCost * existing.quantity + total) / newQty;
      db.prepare('UPDATE positions SET quantity = ?, avg_cost = ? WHERE symbol = ?').run(
        newQty,
        newAvgCost,
        symbol
      );
    } else {
      db.prepare(
        'INSERT INTO positions (symbol, quantity, avg_cost) VALUES (?, ?, ?)'
      ).run(symbol, quantity, price);
    }
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO orders (symbol, side, quantity, price, total, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(symbol, 'BUY', quantity, price, total, createdAt);
    return { id: Number(info.lastInsertRowid), symbol, side: 'BUY' as const, quantity, price, total, createdAt };
  });

  return tx();
}

export function sell(symbol: string, quantity: number, price: number): Order {
  symbol = symbol.toUpperCase();
  if (quantity <= 0) throw new TradingError('Quantity must be positive');
  if (price <= 0) throw new TradingError('Invalid price');
  const existing = getPosition(symbol);
  if (!existing || existing.quantity < quantity) {
    throw new TradingError('Insufficient shares to sell');
  }
  const total = quantity * price;

  const tx = db.transaction(() => {
    db.prepare('UPDATE account SET cash = cash + ? WHERE id = 1').run(total);
    const newQty = existing.quantity - quantity;
    if (newQty <= 0) {
      db.prepare('DELETE FROM positions WHERE symbol = ?').run(symbol);
    } else {
      db.prepare('UPDATE positions SET quantity = ? WHERE symbol = ?').run(newQty, symbol);
    }
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO orders (symbol, side, quantity, price, total, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(symbol, 'SELL', quantity, price, total, createdAt);
    return { id: Number(info.lastInsertRowid), symbol, side: 'SELL' as const, quantity, price, total, createdAt };
  });

  return tx();
}

export function resetAccount(): void {
  const tx = db.transaction(() => {
    db.prepare('UPDATE account SET cash = ? WHERE id = 1').run(STARTING_BALANCE);
    db.prepare('DELETE FROM positions').run();
    db.prepare('DELETE FROM orders').run();
  });
  tx();
}
