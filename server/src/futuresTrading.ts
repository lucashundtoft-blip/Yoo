import { db, STARTING_FUTURES_BALANCE } from './db.js';
import { getContract } from './futuresContracts.js';

export class FuturesTradingError extends Error {}

export interface FuturesPosition {
  symbol: string;
  quantity: number; // signed: positive = long, negative = short
  avgPrice: number;
}

export interface FuturesOrder {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  realizedPl: number;
  createdAt: string;
}

export function getFuturesCash(): number {
  const row = db.prepare('SELECT cash FROM futures_account WHERE id = 1').get() as { cash: number };
  return row.cash;
}

export function getFuturesPositions(): FuturesPosition[] {
  return db
    .prepare('SELECT symbol, quantity, avg_price as avgPrice FROM futures_positions WHERE quantity != 0')
    .all() as FuturesPosition[];
}

export function getFuturesPosition(symbol: string): FuturesPosition | undefined {
  return db
    .prepare('SELECT symbol, quantity, avg_price as avgPrice FROM futures_positions WHERE symbol = ?')
    .get(symbol.toUpperCase()) as FuturesPosition | undefined;
}

export function getFuturesOrders(): FuturesOrder[] {
  return db
    .prepare(
      'SELECT id, symbol, side, quantity, price, realized_pl as realizedPl, created_at as createdAt FROM futures_orders ORDER BY id DESC'
    )
    .all() as FuturesOrder[];
}

/** Total margin currently held against open positions, computed fresh from
 * the positions table rather than tracked as a running balance, so it can't
 * drift out of sync. */
export function getUsedMargin(): number {
  return getFuturesPositions().reduce((sum, p) => {
    const contract = getContract(p.symbol);
    if (!contract) return sum;
    return sum + Math.abs(p.quantity) * contract.approxMargin;
  }, 0);
}

export function getFuturesAccountSummary() {
  const cash = getFuturesCash();
  const usedMargin = getUsedMargin();
  return { cash, usedMargin, availableMargin: cash - usedMargin };
}

/** Places a futures order with long/short netting: buying against an
 * existing short covers it (realizing P&L) before any remainder opens a new
 * long, and selling against an existing long closes it before any remainder
 * opens a new short -- standard futures position netting. Only realized P&L
 * touches cash; opening/holding a position only reserves margin (computed
 * dynamically by getUsedMargin), it doesn't deduct notional value the way a
 * stock buy does. */
function placeOrder(symbol: string, side: 'BUY' | 'SELL', quantity: number, price: number): FuturesOrder {
  symbol = symbol.toUpperCase();
  if (quantity <= 0) throw new FuturesTradingError('Quantity must be positive');
  if (price <= 0) throw new FuturesTradingError('Invalid price');
  const contract = getContract(symbol);
  if (!contract) throw new FuturesTradingError(`${symbol} isn't a tradeable futures contract`);

  const signedQty = side === 'BUY' ? quantity : -quantity;
  const existing = getFuturesPosition(symbol);
  const existingQty = existing?.quantity ?? 0;
  const existingAvg = existing?.avgPrice ?? 0;

  let realizedPl = 0;
  let newQty: number;
  let newAvg: number;

  const closingExisting = existingQty !== 0 && Math.sign(existingQty) !== Math.sign(signedQty);
  const closedQty = closingExisting ? Math.min(quantity, Math.abs(existingQty)) : 0;
  const openedQty = quantity - closedQty;

  if (!closingExisting) {
    // Adding to flat, or adding to a position in the same direction.
    newQty = existingQty + signedQty;
    newAvg = existingQty === 0 ? price : (existingAvg * Math.abs(existingQty) + price * quantity) / Math.abs(newQty);
  } else {
    // Long closed by a sell: profit if price rose. Short closed by a buy:
    // profit if price fell. sign(existingQty) captures both in one formula.
    realizedPl = (price - existingAvg) * contract.multiplier * closedQty * Math.sign(existingQty);
    if (openedQty > 0) {
      // Fully closed and flipped to the opposite side with the remainder.
      newQty = signedQty > 0 ? openedQty : -openedQty;
      newAvg = price;
    } else {
      newQty = existingQty + signedQty;
      newAvg = existingAvg;
    }
  }

  // Margin check only applies to the portion that opens new exposure (adding
  // to/opening a position), not the portion that closes one -- and closing
  // part of a position frees its margin in this same trade, so that freed
  // amount counts toward what's available for the newly-opened portion
  // (e.g. flipping long 5 to short 3 needs margin for the net 3, not 3 on
  // top of the 5 that are simultaneously closing).
  if (openedQty > 0) {
    const { availableMargin } = getFuturesAccountSummary();
    const freedMargin = closedQty * contract.approxMargin;
    const marginNeeded = openedQty * contract.approxMargin;
    if (marginNeeded > availableMargin + freedMargin) {
      throw new FuturesTradingError(
        `Insufficient margin: need ~$${marginNeeded.toLocaleString()}, have $${(availableMargin + freedMargin).toLocaleString()} available`
      );
    }
  }

  const tx = db.transaction(() => {
    if (realizedPl !== 0) {
      db.prepare('UPDATE futures_account SET cash = cash + ? WHERE id = 1').run(realizedPl);
    }
    if (newQty === 0) {
      db.prepare('DELETE FROM futures_positions WHERE symbol = ?').run(symbol);
    } else if (existing) {
      db.prepare('UPDATE futures_positions SET quantity = ?, avg_price = ? WHERE symbol = ?').run(
        newQty,
        newAvg,
        symbol
      );
    } else {
      db.prepare('INSERT INTO futures_positions (symbol, quantity, avg_price) VALUES (?, ?, ?)').run(
        symbol,
        newQty,
        newAvg
      );
    }
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        'INSERT INTO futures_orders (symbol, side, quantity, price, realized_pl, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(symbol, side, quantity, price, realizedPl, createdAt);
    return { id: Number(info.lastInsertRowid), symbol, side, quantity, price, realizedPl, createdAt };
  });

  return tx();
}

export function buyFutures(symbol: string, quantity: number, price: number): FuturesOrder {
  return placeOrder(symbol, 'BUY', quantity, price);
}

export function sellFutures(symbol: string, quantity: number, price: number): FuturesOrder {
  return placeOrder(symbol, 'SELL', quantity, price);
}

export function resetFuturesAccount(): void {
  const tx = db.transaction(() => {
    db.prepare('UPDATE futures_account SET cash = ? WHERE id = 1').run(STARTING_FUTURES_BALANCE);
    db.prepare('DELETE FROM futures_positions').run();
    db.prepare('DELETE FROM futures_orders').run();
  });
  tx();
}
