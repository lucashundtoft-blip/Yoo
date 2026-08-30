import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, type Candle, type FuturesAccount, type FuturesContract, type Projection, type Quote } from '../api';
import { Chart, type HoverBar } from '../components/Chart';
import { FuturesOrderPanel } from '../components/FuturesOrderPanel';
import { FuturesSubNav } from '../components/FuturesSubNav';
import { aggregateByCount, aggregateByCalendarPeriod } from '../aggregateCandles';
import { formatCurrency, formatPercent, formatSigned, changeClass } from '../format';
import { SMA_COLORS } from '../sma';

// A top-down set: check the big trend on a high timeframe first (Monthly/
// Weekly), then narrow down to Daily/1H/15m for entry timing -- same
// contract, same chart, just zooming in. Weekly/Monthly and 15m aren't
// resolutions the server speaks natively, so they're rolled up client-side
// from the daily/5-min series it does provide.
interface RangeDef {
  label: string;
  days: number;
  resolution: 'D' | '60' | '5';
  approxCandles: number;
  aggregate?: (candles: Candle[]) => Candle[];
}

const RANGES: RangeDef[] = [
  { label: '15m', days: 2, resolution: '5', approxCandles: 52, aggregate: (c) => aggregateByCount(c, 3) },
  { label: '1H', days: 10, resolution: '60', approxCandles: 65 },
  { label: 'D', days: 180, resolution: 'D', approxCandles: 180 },
  { label: 'W', days: 730, resolution: 'D', approxCandles: 104, aggregate: (c) => aggregateByCalendarPeriod(c, 'week') },
  { label: 'M', days: 730, resolution: 'D', approxCandles: 24, aggregate: (c) => aggregateByCalendarPeriod(c, 'month') },
];

const SMA_PERIODS = [20, 50];

export function FuturesDetailPage() {
  const { symbol = '' } = useParams();
  const [contract, setContract] = useState<FuturesContract | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [showProjection, setShowProjection] = useState(false);
  const [smaPeriods, setSmaPeriods] = useState<number[]>([20, 50]);
  const [account, setAccount] = useState<FuturesAccount | null>(null);
  const [rangeIndex, setRangeIndex] = useState(2);
  const [error, setError] = useState<string | null>(null);
  const [hoverBar, setHoverBar] = useState<HoverBar | null>(null);

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
    const [rawCandles, proj] = await Promise.all([
      api.getCandles(symbol, range.resolution, range.days),
      api.getProjection(symbol, range.resolution, range.days, lookback, forecastPeriods),
    ]);
    setCandles(range.aggregate ? range.aggregate(rawCandles) : rawCandles);
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

  function toggleSma(period: number) {
    setSmaPeriods((prev) => (prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period].sort((a, b) => a - b)));
  }

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
  const livePl = position && quote ? (quote.price - position.avgPrice) * contract.multiplier * position.quantity : null;

  // TradingView-style readout: shows the hovered bar under the crosshair,
  // falling back to the most recent bar when the pointer isn't over the chart.
  const lastCandle = candles[candles.length - 1];
  const displayBar: HoverBar | null =
    hoverBar ??
    (lastCandle
      ? { time: lastCandle.time, open: lastCandle.open, high: lastCandle.high, low: lastCandle.low, close: lastCandle.close, volume: lastCandle.volume }
      : null);

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
        <div className="stat-row" style={{ marginTop: 10 }}>
          <div className="stat">
            <span className="label">Margin / Contract</span>
            <span className="value">{formatCurrency(contract.approxMargin, 0)}</span>
          </div>
          <div className="stat">
            <span className="label">Available Margin</span>
            <span className="value">{formatCurrency(account?.availableMargin ?? 0, 0)}</span>
          </div>
          {position && (
            <div className="stat">
              <span className="label">Position P&amp;L</span>
              <span className={`value ${changeClass(livePl ?? position.unrealizedPl)}`}>
                {formatSigned(livePl ?? position.unrealizedPl)}
              </span>
            </div>
          )}
        </div>
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
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {SMA_PERIODS.map((period) => (
                  <label key={period} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                    <input type="checkbox" checked={smaPeriods.includes(period)} onChange={() => toggleSma(period)} />
                    SMA {period}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={showProjection} onChange={(e) => setShowProjection(e.target.checked)} />
                  Trend projection
                </label>
              </div>
            </div>
            {displayBar && (
              <div
                style={{ display: 'flex', gap: 12, fontVariantNumeric: 'tabular-nums', fontSize: 13, marginBottom: 6, flexWrap: 'wrap' }}
                className={changeClass(displayBar.close - displayBar.open)}
              >
                <span>O <strong>{formatCurrency(displayBar.open)}</strong></span>
                <span>H <strong>{formatCurrency(displayBar.high)}</strong></span>
                <span>L <strong>{formatCurrency(displayBar.low)}</strong></span>
                <span>C <strong>{formatCurrency(displayBar.close)}</strong></span>
                <span style={{ color: 'var(--text-dim)' }}>Vol <strong>{displayBar.volume.toLocaleString()}</strong></span>
              </div>
            )}
            {(smaPeriods.length > 0 || (showProjection && projection)) && (
              <div className="legend">
                {smaPeriods.map((period) => (
                  <span key={period}>
                    <span className="legend-swatch" style={{ background: SMA_COLORS[period] ?? '#8b939d' }} />
                    SMA {period}
                  </span>
                ))}
                {showProjection && projection && (
                  <>
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
                  </>
                )}
              </div>
            )}
            <Chart
              candles={candles}
              projection={projection}
              showProjection={showProjection}
              smaPeriods={smaPeriods}
              onHoverBar={setHoverBar}
              positionLine={
                position
                  ? {
                      price: position.avgPrice,
                      title: `${position.quantity > 0 ? 'LONG' : 'SHORT'} ${Math.abs(position.quantity)} (${formatSigned(livePl ?? position.unrealizedPl)})`,
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
