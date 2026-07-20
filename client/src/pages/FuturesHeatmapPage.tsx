import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Quote } from '../api';
import { formatCurrency, formatPercent } from '../format';

interface FutureDef {
  symbol: string;
  name: string;
  group: string;
}

// A real futures feed isn't available (Finnhub's free tier is equities-only),
// so these prices come from the same deterministic simulated provider used
// for unrecognized stock tickers — clearly labeled below, not presented as live.
const FUTURES: FutureDef[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', group: 'Indices' },
  { symbol: 'NQ', name: 'E-mini Nasdaq 100', group: 'Indices' },
  { symbol: 'YM', name: 'E-mini Dow', group: 'Indices' },
  { symbol: 'RTY', name: 'E-mini Russell 2000', group: 'Indices' },
  { symbol: 'CL', name: 'Crude Oil', group: 'Energy' },
  { symbol: 'NG', name: 'Natural Gas', group: 'Energy' },
  { symbol: 'RB', name: 'RBOB Gasoline', group: 'Energy' },
  { symbol: 'GC', name: 'Gold', group: 'Metals' },
  { symbol: 'SI', name: 'Silver', group: 'Metals' },
  { symbol: 'HG', name: 'Copper', group: 'Metals' },
  { symbol: 'ZB', name: '30-Year T-Bond', group: 'Rates' },
  { symbol: 'ZN', name: '10-Year T-Note', group: 'Rates' },
  { symbol: 'ZC', name: 'Corn', group: 'Agriculture' },
  { symbol: 'ZS', name: 'Soybeans', group: 'Agriculture' },
  { symbol: 'ZW', name: 'Wheat', group: 'Agriculture' },
  { symbol: '6E', name: 'Euro FX', group: 'Currencies' },
  { symbol: '6J', name: 'Japanese Yen', group: 'Currencies' },
  { symbol: '6B', name: 'British Pound', group: 'Currencies' },
];

const GROUPS = ['Indices', 'Energy', 'Metals', 'Rates', 'Agriculture', 'Currencies'];

// Green/blue up-down pair (validated for CVD separation + contrast in prior
// work), intensity scaled by the size of the day's move.
function tileColor(changePercent: number): string {
  const intensity = Math.min(1, Math.abs(changePercent) / 3);
  const alpha = 0.18 + intensity * 0.62;
  return changePercent >= 0 ? `rgba(21, 128, 61, ${alpha})` : `rgba(47, 143, 255, ${alpha})`;
}

export function FuturesHeatmapPage() {
  const navigate = useNavigate();
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    const entries = await Promise.all(
      FUTURES.map(async (f) => {
        try {
          return [f.symbol, await api.getQuote(f.symbol)] as const;
        } catch {
          return null;
        }
      })
    );
    const map: Record<string, Quote> = {};
    for (const entry of entries) {
      if (entry) map[entry[0]] = entry[1];
    }
    setQuotes(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Futures Heat Map</h2>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
          Simulated prices — no live futures feed is configured, so tiles use the same deterministic
          practice data as an unrecognized stock ticker. For layout/practice only, not real market data.
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="empty-state">Loading…</div>
        </div>
      ) : (
        GROUPS.map((group) => {
          const items = FUTURES.filter((f) => f.group === group);
          return (
            <div key={group} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 13, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
                {group}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                {items.map((f) => {
                  const quote = quotes[f.symbol];
                  return (
                    <div
                      key={f.symbol}
                      onClick={() => navigate(`/replay/${f.symbol}`)}
                      style={{
                        background: quote ? tileColor(quote.changePercent) : 'var(--bg-elevated)',
                        border: '1px solid var(--border)',
                        borderRadius: 10,
                        padding: '12px 14px',
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{f.symbol}</div>
                      <div style={{ fontSize: 11, color: 'rgba(230,233,237,0.75)', marginBottom: 8 }}>{f.name}</div>
                      {quote ? (
                        <>
                          <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(quote.price)}</div>
                          <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                            {formatPercent(quote.changePercent)}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-dim)' }}>—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
