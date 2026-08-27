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
    db.prepare('DELETE FROM bracket_orders').run();
  });
  tx();
}

export interface BracketOrder {
  id: number;
  symbol: string;
  quantity: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED';
  createdAt: string;
  filledAt: string | null;
  filledPrice: number | null;
  filledLeg: 'TP' | 'SL' | null;
}

/** Attaches a take-profit / stop-loss bracket to shares just bought. Doesn't
 * place a real order with a broker -- a background check (see checkBrackets)
 * polls quotes and sells automatically once either level is touched. */
export function createBracket(
  symbol: string,
  quantity: number,
  takeProfitPrice: number | null,
  stopLossPrice: number | null
): BracketOrder {
  symbol = symbol.toUpperCase();
  if (quantity <= 0) throw new TradingError('Quantity must be positive');
  if (takeProfitPrice == null && stopLossPrice == null) {
    throw new TradingError('Provide at least one of takeProfitPrice or stopLossPrice');
  }
  const createdAt = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO bracket_orders (symbol, quantity, take_profit_price, stop_loss_price, status, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?)`
    )
    .run(symbol, quantity, takeProfitPrice, stopLossPrice, createdAt);
  return {
    id: Number(info.lastInsertRowid),
    symbol,
    quantity,
    takeProfitPrice,
    stopLossPrice,
    status: 'ACTIVE',
    createdAt,
    filledAt: null,
    filledPrice: null,
    filledLeg: null,
  };
}

function rowToBracket(row: any): BracketOrder {
  return {
    id: row.id,
    symbol: row.symbol,
    quantity: row.quantity,
    takeProfitPrice: row.take_profit_price,
    stopLossPrice: row.stop_loss_price,
    status: row.status,
    createdAt: row.created_at,
    filledAt: row.filled_at,
    filledPrice: row.filled_price,
    filledLeg: row.filled_leg,
  };
}

export function getActiveBrackets(symbol?: string): BracketOrder[] {
  const rows = symbol
    ? db
        .prepare("SELECT * FROM bracket_orders WHERE status = 'ACTIVE' AND symbol = ? ORDER BY id DESC")
        .all(symbol.toUpperCase())
    : db.prepare("SELECT * FROM bracket_orders WHERE status = 'ACTIVE' ORDER BY id DESC").all();
  return rows.map(rowToBracket);
}

export function cancelBracket(id: number): void {
  const info = db
    .prepare("UPDATE bracket_orders SET status = 'CANCELLED' WHERE id = ? AND status = 'ACTIVE'")
    .run(id);
  if (info.changes === 0) throw new TradingError('No active bracket order with that id');
}

/** Checks every active bracket against a live price and sells if either the
 * take-profit or stop-loss level has been touched. Skips (rather than
 * throws) a bracket whose shares were already sold some other way. */
export async function checkBrackets(getPrice: (symbol: string) => Promise<number>): Promise<void> {
  for (const bracket of getActiveBrackets()) {
    let price: number;
    try {
      price = await getPrice(bracket.symbol);
    } catch {
      continue;
    }
    if (!price) continue;

    let leg: 'TP' | 'SL' | null = null;
    if (bracket.takeProfitPrice != null && price >= bracket.takeProfitPrice) leg = 'TP';
    else if (bracket.stopLossPrice != null && price <= bracket.stopLossPrice) leg = 'SL';
    if (!leg) continue;

    try {
      sell(bracket.symbol, bracket.quantity, price);
      db.prepare(
        "UPDATE bracket_orders SET status = 'FILLED', filled_at = ?, filled_price = ?, filled_leg = ? WHERE id = ?"
      ).run(new Date().toISOString(), price, leg, bracket.id);
    } catch (err) {
      if (err instanceof TradingError) {
        // Shares for this bracket are gone (sold manually, etc.) -- drop it.
        db.prepare("UPDATE bracket_orders SET status = 'CANCELLED' WHERE id = ?").run(bracket.id);
      }
    }
  }
}
