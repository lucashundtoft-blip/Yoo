import { useEffect, useState } from 'react';
import { api, type FuturesBracketOrder, type FuturesContract, type FuturesPosition, type Quote } from '../api';
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
  const [useBracket, setUseBracket] = useState(false);
  const [takeProfitPrice, setTakeProfitPrice] = useState('');
  const [stopLossPrice, setStopLossPrice] = useState('');
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

  const tpValue = takeProfitPrice ? Number(takeProfitPrice) : null;
  const slValue = stopLossPrice ? Number(stopLossPrice) : null;
  const price = quote?.price ?? 0;
  // A BUY opens/adds to a long (TP above, SL below); a SELL opens/adds to a
  // short (the mirror image).
  const bracketInvalid =
    useBracket &&
    ((tpValue == null && slValue == null) ||
      (price > 0 &&
        (side === 'BUY'
          ? (tpValue != null && tpValue <= price) || (slValue != null && slValue >= price)
          : (tpValue != null && tpValue >= price) || (slValue != null && slValue <= price))));

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
    if (bracketInvalid) {
      setError(
        side === 'BUY'
          ? 'Take profit must be above and stop loss below the current price'
          : 'Take profit must be below and stop loss above the current price'
      );
      return;
    }
    setSubmitting(true);
    try {
      const order = await api.placeFuturesOrder(contract.symbol, side, qty, useBracket ? tpValue : null, useBracket ? slValue : null);
      setSuccess(
        `${order.side === 'BUY' ? 'Bought' : 'Sold'} ${order.quantity} ${order.symbol} @ ${formatCurrency(order.price)}` +
          (order.realizedPl !== 0 ? ` (realized ${formatSigned(order.realizedPl)})` : '')
      );
      setQuantity('1');
      setTakeProfitPrice('');
      setStopLossPrice('');
      setUseBracket(false);
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
        <input type="number" min="1" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </div>

      <div className="form-row">
        <label>Market Price</label>
        <input value={quote ? formatCurrency(quote.price) : '—'} disabled />
      </div>

      <div className="form-row">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={useBracket} onChange={(e) => setUseBracket(e.target.checked)} />
          Set take profit / stop loss
        </label>
      </div>

      {useBracket && (
        <>
          <div className="form-row">
            <label>Take Profit Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={takeProfitPrice}
              onChange={(e) => setTakeProfitPrice(e.target.value)}
            />
          </div>
          <div className="form-row">
            <label>Stop Loss Price</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(e.target.value)}
            />
          </div>
          {bracketInvalid && (
            <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>
              {side === 'BUY'
                ? 'Take profit must be above, and stop loss below, the current price. Set at least one.'
                : 'Take profit must be below, and stop loss above, the current price. Set at least one.'}
            </div>
          )}
        </>
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
        disabled={submitting || !quote || qty <= 0 || !canAfford || bracketInvalid}
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
                {b.side === 'BUY' ? 'Long' : 'Short'} {b.quantity} &middot;{' '}
                {b.takeProfitPrice != null && <>TP {formatCurrency(b.takeProfitPrice)}</>}
                {b.takeProfitPrice != null && b.stopLossPrice != null && ' / '}
                {b.stopLossPrice != null && <>SL {formatCurrency(b.stopLossPrice)}</>}
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
