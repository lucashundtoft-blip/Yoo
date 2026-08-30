import { useState } from 'react';
import { api, type FuturesContract, type FuturesPosition, type Quote } from '../api';
import { formatCurrency, formatSigned } from '../format';

interface FuturesOrderPanelProps {
  contract: FuturesContract;
  quote: Quote | null;
  availableMargin: number;
  position: FuturesPosition | undefined;
  onOrderPlaced: () => void;
}

export function FuturesOrderPanel({ contract, quote, availableMargin, position, onOrderPlaced }: FuturesOrderPanelProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const qty = Math.max(0, Math.round(Number(quantity) || 0));
  const heldQty = position?.quantity ?? 0;
  // Only the portion that would open new exposure needs fresh margin --
  // closing an opposite position frees margin rather than consuming it.
  const signedOrderQty = side === 'BUY' ? qty : -qty;
  const closing = heldQty !== 0 && Math.sign(heldQty) !== Math.sign(signedOrderQty);
  const closedQty = closing ? Math.min(qty, Math.abs(heldQty)) : 0;
  const openedQty = qty - closedQty;
  const marginNeeded = openedQty * contract.approxMargin;
  const freedMargin = closedQty * contract.approxMargin;
  const canAfford = marginNeeded <= availableMargin + freedMargin;

  async function submit() {
    setError(null);
    setSuccess(null);
    if (qty <= 0) {
      setError('Enter a quantity greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.placeFuturesOrder(contract.symbol, side, qty);
      setSuccess(
        `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol} @ ${formatCurrency(order.price)}` +
          (order.realizedPl !== 0 ? ` (realized ${formatSigned(order.realizedPl)})` : '')
      );
      setQuantity('1');
      onOrderPlaced();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="tabs">
        <button className={side === 'BUY' ? 'active' : ''} onClick={() => setSide('BUY')}>
          Buy
        </button>
        <button className={side === 'SELL' ? 'active' : ''} onClick={() => setSide('SELL')}>
          Sell
        </button>
      </div>

      <div className="form-row">
        <label>Contracts</label>
        <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Market Price</label>
        <input value={quote ? formatCurrency(quote.price) : '—'} disabled />
      </div>

      <div className="stat-row" style={{ marginBottom: 14 }}>
        <div className="stat">
          <span className="label">Tick Value</span>
          <span className="value">{formatCurrency(contract.tickValue)}</span>
        </div>
        <div className="stat">
          <span className="label">Margin / Contract</span>
          <span className="value">{formatCurrency(contract.approxMargin, 0)}</span>
        </div>
      </div>

      {openedQty > 0 && (
        <div className="stat" style={{ marginBottom: 14 }}>
          <span className="label">Margin Required{closedQty > 0 ? ' (net of closing)' : ''}</span>
          <span className="value">{formatCurrency(marginNeeded, 0)}</span>
        </div>
      )}

      {position && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Current position: {heldQty > 0 ? 'Long' : 'Short'} {Math.abs(heldQty)} @ {formatCurrency(position.avgPrice)}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
        Available margin: {formatCurrency(availableMargin, 0)}
      </div>

      {error && <div className="error-banner">{error}</div>}
      {success && (
        <div className="error-banner" style={{ background: 'rgba(23,201,100,0.12)', color: 'var(--green)' }}>
          {success}
        </div>
      )}

      <button
        className={`btn ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
        style={{ width: '100%' }}
        disabled={submitting || !quote || qty <= 0 || !canAfford}
        onClick={submit}
      >
        {submitting ? 'Placing order...' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${contract.symbol}`}
      </button>
      {!canAfford && qty > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
          Insufficient margin for this order size
        </div>
      )}
    </div>
  );
}
