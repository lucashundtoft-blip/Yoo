import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Candle, type Portfolio, type Projection, type Quote } from '../api';
import { Chart } from '../components/Chart';
import { OrderPanel } from '../components/OrderPanel';
import { formatCurrency, formatPercent, changeClass } from '../format';

const RANGES: { label: string; days: number; resolution: 'D' | '60' | '5'; approxCandles: number }[] = [
  { label: '1D', days: 1, resolution: '5', approxCandles: 78 },
  { label: '5D', days: 5, resolution: '60', approxCandles: 33 },
  { label: '1M', days: 30, resolution: 'D', approxCandles: 30 },
  { label: '6M', days: 180, resolution: 'D', approxCandles: 180 },
  { label: '1Y', days: 365, resolution: 'D', approxCandles: 365 },
];

export function StockDetailPage() {
  const { symbol = '' } = useParams();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [showProjection, setShowProjection] = useState(true);
  const [rangeIndex, setRangeIndex] = useState(3);
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = RANGES[rangeIndex];

  async function loadQuoteAndPortfolio() {
    try {
      const [q, p, watch] = await Promise.all([
        api.getQuote(symbol),
        api.getPortfolio(),
        api.getWatchlist(),
      ]);
      setQuote(q);
      setPortfolio(p);
      setInWatchlist(watch.includes(symbol.toUpperCase()));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load stock');
    }
  }

  async function loadChart() {
    const lookback = Math.min(90, Math.max(8, Math.round(range.approxCandles * 0.25)));
    const forecastPeriods = Math.max(3, Math.round(lookback / 3));
    const [c, proj] = await Promise.all([
      api.getCandles(symbol, range.resolution, range.days),
      api.getProjection(symbol, range.resolution, range.days, lookback, forecastPeriods),
    ]);
    setCandles(c);
    setProjection(proj);
  }

  useEffect(() => {
    loadQuoteAndPortfolio();
    const interval = setInterval(loadQuoteAndPortfolio, 8_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, rangeIndex]);

  async function toggleWatchlist() {
    if (inWatchlist) await api.removeFromWatchlist(symbol);
    else await api.addToWatchlist(symbol);
    setInWatchlist(!inWatchlist);
  }

  const position = portfolio?.positions.find((p) => p.symbol === symbol.toUpperCase());

  if (error) {
    return <div className="error-banner">{error}</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 28 }}>{symbol.toUpperCase()}</h1>
            <span className={`pill ${quote?.marketOpen ? 'open' : 'closed'}`}>
              {quote?.marketOpen ? 'Market Open' : 'Market Closed'}
            </span>
            <button className="btn btn-secondary" onClick={toggleWatchlist}>
              {inWatchlist ? '− Watchlist' : '+ Watchlist'}
            </button>
          </div>
          {quote && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 32, fontWeight: 700 }}>{formatCurrency(quote.price)}</span>
              <span className={changeClass(quote.change)} style={{ fontSize: 16, fontWeight: 600 }}>
                {formatCurrency(quote.change)} ({formatPercent(quote.changePercent)})
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div className="tabs">
                {RANGES.map((r, i) => (
                  <button key={r.label} className={i === rangeIndex ? 'active' : ''} onClick={() => setRangeIndex(i)}>
                    {r.label}
                  </button>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                <input
                  type="checkbox"
                  checked={showProjection}
                  onChange={(e) => setShowProjection(e.target.checked)}
                />
                Trend projection
              </label>
            </div>
            {showProjection && projection && (
              <div className="legend">
                <span>
                  <span className="legend-swatch" style={{ background: '#2f81f7' }} />
                  Trendline (fitted)
                </span>
                <span>
                  <span className="legend-swatch" style={{ background: '#e0a52c' }} />
                  Projected ({projection.direction})
                </span>
              </div>
            )}
            <Chart candles={candles} projection={projection} showProjection={showProjection} />
          </div>

          {quote && (
            <div className="card">
              <div className="stat-row">
                <div className="stat">
                  <span className="label">Open</span>
                  <span className="value">{formatCurrency(quote.open)}</span>
                </div>
                <div className="stat">
                  <span className="label">High</span>
                  <span className="value">{formatCurrency(quote.high)}</span>
                </div>
                <div className="stat">
                  <span className="label">Low</span>
                  <span className="value">{formatCurrency(quote.low)}</span>
                </div>
                <div className="stat">
                  <span className="label">Prev Close</span>
                  <span className="value">{formatCurrency(quote.prevClose)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <OrderPanel
          symbol={symbol}
          quote={quote}
          cash={portfolio?.cash ?? 0}
          ownedQuantity={position?.quantity ?? 0}
          onOrderPlaced={loadQuoteAndPortfolio}
        />
      </div>
    </div>
  );
}
