import { useEffect, useState } from 'react';
import { api, type FuturesBracketOrder, type FuturesContract, type FuturesPosition, type Quote } from '../api';
import { formatCurrency, formatSigned, formatBracketLabel } from '../format';
import { ProtectionControls, DEFAULT_PROTECTION, resolveProtection, protectionError, type ProtectionValue } from './ProtectionControls';

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
  const [protection, setProtection] = useState<ProtectionValue>(DEFAULT_PROTECTION);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [brackets, setBrackets] = useState<FuturesBracketOrder[]>([]);

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
  // Max contracts this side could reach, independent of what's currently
  // typed: close out any opposing position for free (margin-wise), then
  // spend the rest of available margin opening new ones.
  const closingAllQty = heldQty !== 0 && Math.sign(heldQty) !== Math.sign(side === 'BUY' ? 1 : -1) ? Math.abs(heldQty) : 0;
  const maxQty = closingAllQty + Math.floor((availableMargin + closingAllQty * contract.approxMargin) / contract.approxMargin);

  const price = quote?.price ?? 0;
  const direction = side === 'BUY' ? 'long' : 'short';
  const protectionMsg = protectionError(protection, price, direction);

  async function loadBrackets() {
    try {
      setBrackets(await api.getFuturesBrackets(contract.symbol));
    } catch {
      // non-critical; leave the list as-is
    }
  }

  useEffect(() => {
    loadBrackets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract.symbol]);

  async function submit() {
    setError(null);
    setSuccess(null);
    if (qty <= 0) {
      setError('Enter a quantity greater than zero');
      return;
    }
    if (protectionMsg) {
      setError(protectionMsg);
      return;
    }
    setSubmitting(true);
    try {
      const { takeProfitPrice, stopLossPrice, trailingStopPercent } = resolveProtection(protection, price, direction);
      const order = await api.placeFuturesOrder(contract.symbol, side, qty, takeProfitPrice, stopLossPrice, trailingStopPercent);
      setSuccess(
        `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol} @ ${formatCurrency(order.price)}` +
          (order.realizedPl !== 0 ? ` (realized ${formatSigned(order.realizedPl)})` : '')
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
      await api.cancelFuturesBracket(id);
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
        <label>Contracts</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="number"
            min="1"
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

      <ProtectionControls value={protection} onChange={setProtection} price={price} direction={direction} />
      {protectionMsg && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10, marginTop: -6 }}>{protectionMsg}</div>
      )}

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
        disabled={submitting || !quote || qty <= 0 || !canAfford || Boolean(protectionMsg)}
        onClick={submit}
      >
        {submitting ? 'Placing order...' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${contract.symbol}`}
      </button>
      {!canAfford && qty > 0 && (
        <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8 }}>
          Insufficient margin for this order size
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
                {b.side === 'BUY' ? 'Long' : 'Short'} {b.quantity} &middot; {formatBracketLabel(b)}
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
