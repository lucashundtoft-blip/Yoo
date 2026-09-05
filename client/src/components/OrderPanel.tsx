import { useEffect, useState } from 'react';
import { api, type BracketOrder, type Quote } from '../api';
import { formatCurrency, formatBracketLabel } from '../format';
import { ProtectionControls, DEFAULT_PROTECTION, resolveProtection, protectionError, type ProtectionValue } from './ProtectionControls';

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
  const [protection, setProtection] = useState<ProtectionValue>(DEFAULT_PROTECTION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<BracketOrder[]>([]);

  const qty = Number(quantity) || 0;
  const price = quote?.price ?? 0;
  const estimatedTotal = qty * price;
  const canAfford = side === 'BUY' ? estimatedTotal <= cash : qty <= ownedQuantity;
  const maxQty = side === 'BUY' ? (price > 0 ? Math.floor(cash / price) : 0) : ownedQuantity;
  const protectionMsg = side === 'BUY' ? protectionError(protection, price, 'long') : null;

  async function loadBrackets() {
    try {
      setBrackets(await api.getBrackets(symbol));
    } catch {
      // non-critical; leave the list as-is
    }
  }

  useEffect(() => {
    loadBrackets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (qty <= 0) {
      setError('Enter a quantity greater than zero');
      return;
    }
    if (side === 'BUY' && protectionMsg) {
      setError(protectionMsg);
      return;
    }
    setSubmitting(true);
    try {
      const { takeProfitPrice, stopLossPrice, trailingStopPercent } =
        side === 'BUY' ? resolveProtection(protection, price, 'long') : { takeProfitPrice: null, stopLossPrice: null, trailingStopPercent: null };
      const order = await api.placeOrder(symbol, side, qty, takeProfitPrice, stopLossPrice, trailingStopPercent);
      setSuccess(
        `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} share${order.quantity === 1 ? '' : 's'} of ${order.symbol} @ ${formatCurrency(order.price)}`
      );
      setQuantity('1');
      setProtection(DEFAULT_PROTECTION);
      onOrderPlaced();
      loadBrackets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Order failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelBracket(id: number) {
    try {
      await api.cancelBracket(id);
      loadBrackets();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel');
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
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min="0"
            step="1"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setQuantity(String(Math.max(0, maxQty)))}>
            Max
          </button>
        </div>
      </div>

      <div className="form-row">
        <label>Market Price</label>
        <input value={quote ? formatCurrency(quote.price) : '—'} disabled />
      </div>

      {side === 'BUY' && (
        <ProtectionControls value={protection} onChange={setProtection} price={price} direction="long" />
      )}
      {side === 'BUY' && protectionMsg && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, marginTop: -6 }}>{protectionMsg}</div>
      )}

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
        disabled={submitting || !quote || qty <= 0 || !canAfford || Boolean(side === 'BUY' && protectionMsg)}
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

      {brackets.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 8 }}>Active TP/SL orders</div>
          {brackets.map((b) => (
            <div
              key={b.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: 13,
                padding: '6px 0',
              }}
            >
              <span>
                {b.quantity} sh &middot; {formatBracketLabel(b)}
              </span>
              <button className="btn btn-secondary" style={{ padding: '2px 10px' }} onClick={() => handleCancelBracket(b.id)}>
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
