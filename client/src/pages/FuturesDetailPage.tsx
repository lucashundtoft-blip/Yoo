import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Candle, type FuturesAccount, type FuturesContract, type Projection, type Quote } from '../api';
import { Chart } from '../components/Chart';
import { FuturesOrderPanel } from '../components/FuturesOrderPanel';
import { FuturesSubNav } from '../components/FuturesSubNav';
import { formatCurrency, formatPercent, changeClass } from '../format';

const RANGES: { label: string; days: number; resolution: 'D' | '60' | '5'; approxCandles: number }[] = [
  { label: '1D', days: 1, resolution: '5', approxCandles: 78 },
  { label: '5D', days: 5, resolution: '60', approxCandles: 33 },
  { label: '1M', days: 30, resolution: 'D', approxCandles: 30 },
  { label: '6M', days: 180, resolution: 'D', approxCandles: 180 },
];

export function FuturesDetailPage() {
  const { symbol = '' } = useParams();
  const [contract, setContract] = useState<FuturesContract | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [showProjection, setShowProjection] = useState(false);
  const [account, setAccount] = useState<FuturesAccount | null>(null);
  const [rangeIndex, setRangeIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const range = RANGES[rangeIndex];

  async function loadContract() {
    const contracts = await api.getFuturesContracts();
    const match = contracts.find((c) => c.symbol === symbol.toUpperCase());
    if (!match) {
      setError(`${symbol.toUpperCase()} isn't a tradeable futures contract`);
      return;
    }
    setContract(match);
  }

  async function loadQuoteAndAccount() {
    try {
      const [q, a] = await Promise.all([api.getQuote(symbol), api.getFuturesAccount()]);
      setQuote(q);
      setAccount(a);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
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
    loadContract();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    loadQuoteAndAccount();
    const interval = setInterval(loadQuoteAndAccount, 8_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  useEffect(() => {
    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, rangeIndex]);

  if (error) {
    return (
      <div>
        <FuturesSubNav />
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  if (!contract) {
    return (
      <div>
        <FuturesSubNav />
        <div className="empty-state">Loading...</div>
      </div>
    );
  }

  const position = account?.positions.find((p) => p.symbol === contract.symbol);

  return (
    <div>
      <FuturesSubNav />

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>{contract.symbol}</h1>
          <span style={{ fontSize: 14, color: 'var(--text-dim)' }}>{contract.name}</span>
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

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
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
                <span>
                  <span className="legend-swatch" style={{ background: '#8b939d' }} />
                  Trend channel
                </span>
              </div>
            )}
            <Chart
              candles={candles}
              projection={projection}
              showProjection={showProjection}
              smaPeriods={[]}
              positionLine={
                position
                  ? {
                      price: position.avgPrice,
                      title: `${position.quantity > 0 ? 'LONG' : 'SHORT'} ${Math.abs(position.quantity)} @ ${position.avgPrice.toFixed(2)}`,
                    }
                  : null
              }
            />
          </div>
        </div>

        <FuturesOrderPanel
          contract={contract}
          quote={quote}
          availableMargin={account?.availableMargin ?? 0}
          position={position}
          onOrderPlaced={loadQuoteAndAccount}
        />
      </div>
    </div>
  );
}
