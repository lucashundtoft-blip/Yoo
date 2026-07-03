import { useState } from 'react';
import { api, type Quote } from '../api';
import { formatCurrency } from '../format';

interface OrderPanelProps {
  symbol: string;
  quote: Quote | null;
  cash: number;
  ownedQuantity: number;
  onOrderPlaced: () => void;
}

export function OrderPanel({ symbol, quote, cash, ownedQuantity, onOrderPlaced }: OrderPanelProps) {
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [quantity, setQuantity] = useState('1');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const qty = Number(quantity) || 0;
  const price = quote?.price ?? 0;
  const estimatedTotal = qty * price;
  const canAfford = side === 'BUY' ? estimatedTotal <= cash : qty <= ownedQuantity;

  async function submit() {
    setError(null);
    setSuccess(null);
    if (qty <= 0) {
      setError('Enter a quantity greater than zero');
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.placeOrder(symbol, side, qty);
      setSuccess(
        `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} share${order.quantity === 1 ? '' : 's'} of ${order.symbol} @ ${formatCurrency(order.price)}`
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
        <label>Quantity (shares)</label>
        <input
          type="number"
          min="0"
          step="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="form-row">
        <label>Market Price</label>
        <input value={quote ? formatCurrency(quote.price) : '—'} disabled />
      </div>

      <div className="stat" style={{ marginBottom: 14 }}>
        <span className="label">Estimated {side === 'BUY' ? 'Cost' : 'Proceeds'}</span>
        <span className="value">{formatCurrency(estimatedTotal)}</span>
      </div>

      {side === 'SELL' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          You own {ownedQuantity} share{ownedQuantity === 1 ? '' : 's'}
        </div>
      )}
      {side === 'BUY' && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 10 }}>
          Buying power: {formatCurrency(cash)}
        </div>
      )}

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
        {submitting
          ? 'Placing order...'
          : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`}
      </button>
      {!canAfford && qty > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
          {side === 'BUY' ? 'Not enough buying power' : 'Not enough shares to sell'}
        </div>
      )}
    </div>
  );
}
