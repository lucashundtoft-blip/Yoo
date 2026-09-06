import { formatCurrency } from '../format';

interface OrderBookBarProps {
  price: number;
  tickSize: number;
}

// No real Level 1/2 feed is wired up (Yahoo's free endpoint only gives OHLCV
// candles, not live depth), so bid/ask size here is a deterministic,
// clearly-labeled stand-in seeded from the price itself -- just enough to
// match Webull's bid/ask bar visually without pretending it's real depth.
function pseudoSize(seed: number): number {
  return 1 + (Math.round(seed * 100) % 20);
}

export function OrderBookBar({ price, tickSize }: OrderBookBarProps) {
  const bidPrice = price - tickSize;
  const askPrice = price + tickSize;
  const bidSize = pseudoSize(bidPrice);
  const askSize = pseudoSize(askPrice * 1.7);
  const total = bidSize + askSize;
  const bidPct = (bidSize / total) * 100;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Order Book
        </h3>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Illustrative — no live depth feed</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${bidPct}% ${100 - bidPct}%`,
          alignItems: 'center',
          borderRadius: 6,
          overflow: 'hidden',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: 700,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(21, 128, 61, 0.25)' }}>
          <span style={{ color: '#4ade80' }}>Bid</span>
          <span>{bidSize}</span>
          <span style={{ color: '#4ade80' }}>{formatCurrency(bidPrice)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: 'rgba(47, 143, 255, 0.2)' }}>
          <span style={{ color: '#2f8fff' }}>{formatCurrency(askPrice)}</span>
          <span>{askSize}</span>
          <span style={{ color: '#2f8fff' }}>Ask</span>
        </div>
      </div>
    </div>
  );
}
