import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { IChartApi } from 'lightweight-charts';
import { api, type Candle } from '../api';
import { Chart } from '../components/Chart';
import { RsiChart } from '../components/RsiChart';
import { computeProjection } from '../projection';
import { formatCurrency, formatSigned, formatPercent, changeClass } from '../format';
import { SMA_COLORS } from '../sma';

const DATASETS: { label: string; days: number; resolution: 'D' | '60' | '5' }[] = [
  { label: '1 day (5-min bars)', days: 1, resolution: '5' },
  { label: '5 days (hourly bars)', days: 5, resolution: '60' },
  { label: '6 months (daily bars)', days: 180, resolution: 'D' },
  { label: '1 year (daily bars)', days: 365, resolution: 'D' },
];

const SPEEDS = [1, 2, 5, 10];
const WARMUP = 20; // candles visible before replay starts
const SESSION_CASH = 100_000;
const AVAILABLE_SMA_PERIODS = [20, 50, 200, 400];

interface ReplayTrade {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time: number;
}

export function ReplayPage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const [symbolInput, setSymbolInput] = useState(urlSymbol ?? 'AAPL');
  const [datasetIndex, setDatasetIndex] = useState(2);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(WARMUP);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [smaPeriods, setSmaPeriods] = useState<number[]>([20]);
  const [showProjection, setShowProjection] = useState(true);
  const [showRsi, setShowRsi] = useState(false);
  const [heikinAshi, setHeikinAshi] = useState(false);
  const [mainChartApi, setMainChartApi] = useState<IChartApi | null>(null);

  // Sandboxed practice account for this replay session only.
  const [cash, setCash] = useState(SESSION_CASH);
  const [qty, setQty] = useState(0);
  const [avgCost, setAvgCost] = useState(0);
  const [realizedPL, setRealizedPL] = useState(0);
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [orderQty, setOrderQty] = useState('10');

  const activeSymbol = (urlSymbol ?? 'AAPL').toUpperCase();
  const dataset = DATASETS[datasetIndex];

  const visible = useMemo(() => allCandles.slice(0, cursor), [allCandles, cursor]);
  const current = visible[visible.length - 1] ?? null;
  const prevBar = visible[visible.length - 2] ?? null;
  const price = current?.close ?? 0;
  const tickChange = current && prevBar ? current.close - prevBar.close : 0;
  const tickChangePercent = current && prevBar && prevBar.close ? (tickChange / prevBar.close) * 100 : 0;
  const finished = allCandles.length > 0 && cursor >= allCandles.length;

  const projection = useMemo(() => {
    if (!showProjection || visible.length < 4) return null;
    const lookback = Math.min(90, Math.max(8, Math.round(visible.length * 0.25)));
    return computeProjection(visible, { lookback, forecastPeriods: Math.max(3, Math.round(lookback / 3)) });
  }, [visible, showProjection]);

  function resetSession() {
    setCash(SESSION_CASH);
    setQty(0);
    setAvgCost(0);
    setRealizedPL(0);
    setTrades([]);
    setCursor(WARMUP);
    setPlaying(false);
  }

  async function load(symbolToLoad: string) {
    const s = symbolToLoad.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const candles = await api.getCandles(s, dataset.resolution, dataset.days);
      if (candles.length < WARMUP + 5) {
        setError('Not enough historical data for this symbol/range.');
        setAllCandles([]);
      } else {
        setAllCandles(candles);
        resetSession();
        if (s !== activeSymbol) navigate(`/replay/${s}`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(activeSymbol);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, datasetIndex]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCursor((c) => {
        if (c >= allCandles.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [playing, speed, allCandles.length]);

  function trade(side: 'BUY' | 'SELL') {
    const n = Math.floor(Number(orderQty));
    if (!current || !Number.isFinite(n) || n <= 0) return;
    const total = n * price;
    if (side === 'BUY') {
      if (total > cash) return;
      const newQty = qty + n;
      setAvgCost((avgCost * qty + total) / newQty);
      setQty(newQty);
      setCash(cash - total);
    } else {
      if (n > qty) return;
      setRealizedPL(realizedPL + (price - avgCost) * n);
      setQty(qty - n);
      setCash(cash + total);
      if (qty - n === 0) setAvgCost(0);
    }
    setTrades([{ side, quantity: n, price, time: current.time }, ...trades]);
  }

  const marketValue = qty * price;
  const unrealizedPL = qty > 0 ? (price - avgCost) * qty : 0;
  const totalValue = cash + marketValue;
  const sessionPL = totalValue - SESSION_CASH;

  const orderQtyNum = Math.floor(Number(orderQty)) || 0;
  const canBuy = current && orderQtyNum > 0 && orderQtyNum * price <= cash;
  const canSell = current && orderQtyNum > 0 && orderQtyNum <= qty;

  function formatTime(t: number) {
    const d = new Date(t * 1000);
    return dataset.resolution === 'D' ? d.toLocaleDateString() : d.toLocaleString();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Market Replay — {activeSymbol}</h2>
          {current && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 800 }}>{formatCurrency(price)}</span>
              <span className={changeClass(tickChange)} style={{ fontSize: 18, fontWeight: 700 }}>
                {formatSigned(tickChange)} ({formatPercent(tickChangePercent)})
              </span>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Practice on past price action, bar by bar, with a fresh {formatCurrency(SESSION_CASH, 0)} practice account per session.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            className="search-input"
            style={{ width: 110 }}
            value={symbolInput}
            onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(`/replay/${symbolInput.trim().toUpperCase()}`);
            }}
            placeholder="Symbol"
          />
          <select
            className="search-input"
            style={{ width: 190 }}
            value={datasetIndex}
            onChange={(e) => setDatasetIndex(Number(e.target.value))}
          >
            {DATASETS.map((d, i) => (
              <option key={d.label} value={i}>
                {d.label}
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/replay/${symbolInput.trim().toUpperCase()}`)}
            disabled={loading}
          >
            {loading ? 'Loading…' : 'Load'}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-secondary" onClick={() => setPlaying(!playing)} disabled={finished || !allCandles.length}>
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCursor((c) => Math.min(c + 1, allCandles.length))}
                  disabled={finished || !allCandles.length}
                >
                  Step ›
                </button>
                <button className="btn btn-secondary" onClick={resetSession} disabled={!allCandles.length}>
                  ↺ Restart
                </button>
                <div className="tabs" style={{ marginBottom: 0 }}>
                  {SPEEDS.map((s) => (
                    <button key={s} className={s === speed ? 'active' : ''} onClick={() => setSpeed(s)}>
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14 }}>
                {AVAILABLE_SMA_PERIODS.map((period) => (
                  <label key={period} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                    <input
                      type="checkbox"
                      checked={smaPeriods.includes(period)}
                      onChange={() =>
                        setSmaPeriods((prev) =>
                          prev.includes(period) ? prev.filter((p) => p !== period) : [...prev, period].sort((a, b) => a - b)
                        )
                      }
                    />
                    SMA {period}
                  </label>
                ))}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={showProjection} onChange={(e) => setShowProjection(e.target.checked)} />
                  Trend projection
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={showRsi} onChange={(e) => setShowRsi(e.target.checked)} />
                  RSI (14)
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-dim)' }}>
                  <input type="checkbox" checked={heikinAshi} onChange={(e) => setHeikinAshi(e.target.checked)} />
                  Heikin-Ashi
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text-dim)', marginBottom: 8 }}>
              <span>
                Bar {Math.max(0, cursor)} / {allCandles.length}
                {current ? ` — ${formatTime(current.time)}` : ''}
                {finished ? ' — replay finished' : ''}
              </span>
              {current && (
                <span style={{ fontWeight: 700, color: 'var(--text)' }}>{formatCurrency(price)}</span>
              )}
            </div>
            <input
              type="range"
              min={WARMUP}
              max={allCandles.length}
              value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 8 }}
            />

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
                  </>
                )}
              </div>
            )}
            <Chart
              candles={visible}
              projection={projection}
              showProjection={showProjection}
              smaPeriods={smaPeriods}
              heikinAshi={heikinAshi}
              onChartApi={setMainChartApi}
            />
          </div>

          {showRsi && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="legend">
                <span>
                  <span className="legend-swatch" style={{ background: '#e0a52c' }} />
                  RSI (14)
                </span>
              </div>
              <RsiChart candles={visible} mainChart={mainChartApi} />
            </div>
          )}
        </div>

        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="stat" style={{ marginBottom: 12 }}>
              <span className="label">Session P&amp;L</span>
              <span className={`value ${changeClass(sessionPL)}`}>
                {formatSigned(sessionPL)} ({formatPercent((sessionPL / SESSION_CASH) * 100)})
              </span>
            </div>
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div className="stat">
                <span className="label">Cash</span>
                <span className="value" style={{ fontSize: 16 }}>{formatCurrency(cash)}</span>
              </div>
              <div className="stat">
                <span className="label">Position</span>
                <span className="value" style={{ fontSize: 16 }}>
                  {qty > 0 ? `${qty} @ ${formatCurrency(avgCost)}` : '—'}
                </span>
              </div>
              <div className="stat">
                <span className="label">Unrealized</span>
                <span className={`value ${changeClass(unrealizedPL)}`} style={{ fontSize: 16 }}>
                  {qty > 0 ? formatSigned(unrealizedPL) : '—'}
                </span>
              </div>
              <div className="stat">
                <span className="label">Realized</span>
                <span className={`value ${changeClass(realizedPL)}`} style={{ fontSize: 16 }}>
                  {formatSigned(realizedPL)}
                </span>
              </div>
            </div>

            <div className="form-row">
              <label>Quantity (shares)</label>
              <input type="number" min="0" step="1" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-buy" style={{ flex: 1 }} disabled={!canBuy} onClick={() => trade('BUY')}>
                Buy @ {current ? formatCurrency(price) : '—'}
              </button>
              <button className="btn btn-sell" style={{ flex: 1 }} disabled={!canSell} onClick={() => trade('SELL')}>
                Sell
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
              Replay trades use this session's practice account only — your real paper portfolio is untouched.
            </div>
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Session Trades
            </h3>
            {trades.length === 0 ? (
              <div className="empty-state" style={{ padding: '16px 0' }}>No trades yet — press Play and take a position.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {trades.map((t, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td style={{ fontSize: 12 }}>{formatTime(t.time)}</td>
                      <td className={t.side === 'BUY' ? 'up' : 'down'}>{t.side}</td>
                      <td className="num">{t.quantity}</td>
                      <td className="num">{formatCurrency(t.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
