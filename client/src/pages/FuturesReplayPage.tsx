import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Candle, type FuturesContract } from '../api';
import { Chart, type HoverBar, type TradeMarker, type PositionLine } from '../components/Chart';
import { FuturesSubNav } from '../components/FuturesSubNav';
import { formatCurrency, formatSigned, formatPercent, changeClass } from '../format';
import { EMA_COLORS, computeEMA } from '../sma';

const DATASETS: { label: string; short: string; days: number; resolution: 'D' | '60' | '5' }[] = [
  { label: '1 day (5-min bars)', short: '1D', days: 1, resolution: '5' },
  { label: '5 days (hourly bars)', short: '5D', days: 5, resolution: '60' },
  { label: '6 months (daily bars)', short: '6M', days: 180, resolution: 'D' },
  { label: '1 year (daily bars)', short: '1Y', days: 365, resolution: 'D' },
];

const SPEEDS = [1, 2, 5, 10];
const WARMUP = 20;
const SESSION_MARGIN = 50_000;
// Fixed EMA(5,20,200) overlay, always on -- matches the rest of the app's futures charts.
const EMA_PERIODS = [5, 20, 200];

interface ReplayTrade {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time: number;
}

export function FuturesReplayPage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<FuturesContract[]>([]);
  const [datasetIndex, setDatasetIndex] = useState(2);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(WARMUP);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverBar, setHoverBar] = useState<HoverBar | null>(null);

  // Sandboxed practice account for this replay session only -- separate
  // from the real futures paper account, same as the stock replay page.
  const [qty, setQty] = useState(0); // signed: positive = long, negative = short
  const [avgPrice, setAvgPrice] = useState(0);
  const [realizedPL, setRealizedPL] = useState(0);
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [orderQty, setOrderQty] = useState('1');

  const activeSymbol = (urlSymbol ?? 'MES').toUpperCase();
  const contract = contracts.find((c) => c.symbol === activeSymbol) ?? null;
  const dataset = DATASETS[datasetIndex];
  // Base bar interval is slower than the stock replay's -- futures contracts
  // print fast, so 1x here is deliberately closer to a readable, real-feeling
  // pace instead of blurring past in under a second.
  const BASE_INTERVAL_MS = 2200;
  const tickAnimationMs = Math.min(350, (BASE_INTERVAL_MS / speed) * 0.35);

  const visible = useMemo(() => allCandles.slice(0, cursor), [allCandles, cursor]);
  const current = visible[visible.length - 1] ?? null;
  const prevBar = visible[visible.length - 2] ?? null;
  const price = current?.close ?? 0;
  const tickChange = current && prevBar ? current.close - prevBar.close : 0;
  const tickChangePercent = current && prevBar && prevBar.close ? (tickChange / prevBar.close) * 100 : 0;
  const finished = allCandles.length > 0 && cursor >= allCandles.length;

  const displayBar: HoverBar | null =
    hoverBar ??
    (current
      ? { time: current.time, open: current.open, high: current.high, low: current.low, close: current.close, volume: current.volume }
      : null);

  const tradeMarkers: TradeMarker[] = useMemo(
    () => [...trades].sort((a, b) => a.time - b.time).map((t) => ({ time: t.time, side: t.side })),
    [trades]
  );
  const unrealizedPL = contract && qty !== 0 ? (price - avgPrice) * contract.multiplier * qty : 0;
  const positionLine: PositionLine | null =
    qty !== 0
      ? { price: avgPrice, title: `POS: ${qty > 0 ? '+' : ''}${qty} (${formatSigned(unrealizedPL)})` }
      : null;

  const marginUsed = contract ? Math.abs(qty) * contract.approxMargin : 0;
  const availableMargin = SESSION_MARGIN - marginUsed;
  const totalPL = realizedPL + unrealizedPL;

  function resetSession() {
    setQty(0);
    setAvgPrice(0);
    setRealizedPL(0);
    setTrades([]);
    setCursor(WARMUP);
    setPlaying(false);
    setHoverBar(null);
  }

  async function loadContracts() {
    const list = await api.getFuturesContracts();
    setContracts(list);
    if (!list.find((c) => c.symbol === activeSymbol) && list.length > 0) {
      navigate(`/futures-replay/${list[0].symbol}`, { replace: true });
    }
  }

  async function loadChart() {
    if (!contract) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const candles = await api.getCandles(contract.symbol, dataset.resolution, dataset.days);
      if (candles.length < WARMUP + 5) {
        setError('Not enough historical data for this contract/range.');
        setAllCandles([]);
      } else {
        setAllCandles(candles);
        resetSession();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContracts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadChart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.symbol, datasetIndex]);

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
    }, BASE_INTERVAL_MS / speed);
    return () => clearInterval(interval);
  }, [playing, speed, allCandles.length]);

  function trade(side: 'BUY' | 'SELL') {
    if (!contract || !current) return;
    const n = Math.floor(Number(orderQty));
    if (!Number.isFinite(n) || n <= 0) return;
    const delta = side === 'BUY' ? n : -n;
    const newQty = qty + delta;

    // Netting: same direction as the existing position adds to it (weighted
    // avg price); opposite direction closes it first (realizing P&L) and any
    // leftover opens a position the other way -- same long/short mechanics
    // as the real futures account, just tracked locally for this session.
    if (qty === 0 || Math.sign(qty) === Math.sign(delta)) {
      const openedQty = Math.abs(delta);
      const marginNeeded = openedQty * contract.approxMargin;
      if (marginNeeded > availableMargin) return;
      setAvgPrice((avgPrice * Math.abs(qty) + price * openedQty) / (Math.abs(qty) + openedQty));
      setQty(newQty);
    } else {
      const closedQty = Math.min(Math.abs(delta), Math.abs(qty));
      const pl = (price - avgPrice) * contract.multiplier * closedQty * Math.sign(qty);
      setRealizedPL((prev) => prev + pl);
      setQty(newQty);
      if (Math.sign(newQty) !== Math.sign(qty)) setAvgPrice(price);
      else if (newQty === 0) setAvgPrice(0);
    }
    setTrades((prev) => [{ side, quantity: n, price, time: current.time }, ...prev]);
  }

  const orderQtyNum = Math.floor(Number(orderQty)) || 0;
  const canTrade = contract && current && orderQtyNum > 0 && orderQtyNum * contract.approxMargin <= availableMargin;

  function formatTime(t: number) {
    const d = new Date(t * 1000);
    return dataset.resolution === 'D' ? d.toLocaleDateString() : d.toLocaleString();
  }

  if (error) {
    return (
      <div>
        <FuturesSubNav />
        <div className="error-banner">{error}</div>
      </div>
    );
  }

  return (
    <div>
      <FuturesSubNav />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Futures Replay — {contract?.symbol ?? activeSymbol}</h2>
          {current && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 800 }}>{formatCurrency(price)}</span>
              <span className={changeClass(tickChange)} style={{ fontSize: 18, fontWeight: 700 }}>
                {formatSigned(tickChange)} ({formatPercent(tickChangePercent)})
              </span>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Practice on past futures price action, bar by bar, with a fresh {formatCurrency(SESSION_MARGIN, 0)} practice margin account per session.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: 320 }}>
          {contracts.map((c) => (
            <button
              key={c.symbol}
              className="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700 }}
              onClick={() => navigate(`/futures-replay/${c.symbol}`)}
              disabled={c.symbol === activeSymbol}
            >
              {c.symbol}
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="tabs">
              {DATASETS.map((d, i) => (
                <button key={d.label} title={d.label} className={i === datasetIndex ? 'active' : ''} onClick={() => setDatasetIndex(i)}>
                  {d.short}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: 'var(--text-dim)', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <span>
                Bar {Math.max(0, cursor)} / {allCandles.length}
                {current ? ` — ${formatTime(current.time)}` : ''}
                {finished ? ' — replay finished' : ''}
                {loading ? ' — loading…' : ''}
              </span>
              {displayBar && (
                <span
                  style={{ display: 'flex', gap: 12, fontVariantNumeric: 'tabular-nums' }}
                  className={changeClass(displayBar.close - displayBar.open)}
                >
                  <span>O <strong>{formatCurrency(displayBar.open)}</strong></span>
                  <span>H <strong>{formatCurrency(displayBar.high)}</strong></span>
                  <span>L <strong>{formatCurrency(displayBar.low)}</strong></span>
                  <span>C <strong>{formatCurrency(displayBar.close)}</strong></span>
                  <span style={{ color: 'var(--text-dim)' }}>Vol <strong>{displayBar.volume.toLocaleString()}</strong></span>
                </span>
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

            <div style={{ fontSize: 13, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
              <span style={{ color: 'var(--text-dim)' }}>EMA(5,20,200)</span>{' '}
              {EMA_PERIODS.map((period, i) => {
                const series = computeEMA(visible, period);
                const latestValue = series[series.length - 1]?.value;
                return (
                  <span key={period} style={{ color: EMA_COLORS[period], marginLeft: i === 0 ? 8 : 12 }}>
                    EMA{period}:{latestValue != null ? formatCurrency(latestValue) : '--'}
                  </span>
                );
              })}
            </div>

            <Chart
              candles={visible}
              showProjection={false}
              smaPeriods={[]}
              emaPeriods={EMA_PERIODS}
              onHoverBar={setHoverBar}
              tickAnimationMs={tickAnimationMs}
              tradeMarkers={tradeMarkers}
              positionLine={positionLine}
            />
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="stat" style={{ marginBottom: 12 }}>
              <span className="label">Session P&amp;L</span>
              <span className={`value ${changeClass(totalPL)}`}>
                {formatSigned(totalPL)} ({formatPercent((totalPL / SESSION_MARGIN) * 100)})
              </span>
            </div>
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div className="stat">
                <span className="label">Available Margin</span>
                <span className="value" style={{ fontSize: 16 }}>{formatCurrency(availableMargin, 0)}</span>
              </div>
              <div className="stat">
                <span className="label">Position</span>
                <span className="value" style={{ fontSize: 16 }}>
                  {qty !== 0 ? `${qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(qty)} @ ${formatCurrency(avgPrice)}` : '—'}
                </span>
              </div>
              <div className="stat">
                <span className="label">Unrealized</span>
                <span className={`value ${changeClass(unrealizedPL)}`} style={{ fontSize: 16 }}>
                  {qty !== 0 ? formatSigned(unrealizedPL) : '—'}
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
              <label>Quantity (contracts)</label>
              <input type="number" min="0" step="1" value={orderQty} onChange={(e) => setOrderQty(e.target.value)} />
            </div>
            <div className="order-actions">
              <button className="btn btn-buy" style={{ flex: 1 }} disabled={!canTrade} onClick={() => trade('BUY')}>
                Buy @ {current ? formatCurrency(price) : '—'}
              </button>
              <button className="btn btn-sell" style={{ flex: 1 }} disabled={!canTrade} onClick={() => trade('SELL')}>
                Sell (short OK)
              </button>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 10 }}>
              Replay trades use this session's practice margin account only — your real futures paper account is untouched. Selling without an existing long position opens a short.
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
