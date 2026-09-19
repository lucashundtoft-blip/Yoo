import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, type Candle, type FuturesContract, type ReplayDataset } from '../api';
import { Chart, type HoverBar, type TradeMarker, type PositionLine } from '../components/Chart';
import { FuturesSubNav } from '../components/FuturesSubNav';
import { formatCurrency, formatSigned, formatPercent, changeClass } from '../format';
import { EMA_COLORS, computeEMA } from '../sma';
import { useTapePlayer } from '../tapePlayer';

const DATASETS: { label: string; short: string; days: number; resolution: 'D' | '60' | '5' }[] = [
  { label: '1 day (5-min bars)', short: '1D', days: 1, resolution: '5' },
  { label: '5 days (hourly bars)', short: '5D', days: 5, resolution: '60' },
  { label: '6 months (daily bars)', short: '6M', days: 180, resolution: 'D' },
  { label: '1 year (daily bars)', short: '1Y', days: 365, resolution: 'D' },
];

const SPEEDS = [1, 2, 5, 10];
const WARMUP = 20;
const SESSION_MARGIN = 50_000;
// Fixed EMA(8,50) overlay, always on.
const EMA_PERIODS = [8, 50];

interface ReplayTrade {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time: number;
}

// Front-month contract symbols (e.g. "MESZ6") carry a CME month code letter
// + year digit(s) suffix on top of the base product code -- strip it to
// look the contract spec (tick size, margin, multiplier) up in FUTURES_CONTRACTS.
const CME_MONTH_CODES = 'FGHJKMNQUVXZ';
function baseContractSymbol(symbol: string): string {
  const match = symbol.match(new RegExp(`^(.+?)[${CME_MONTH_CODES}]\\d{1,2}$`));
  return match ? match[1] : symbol;
}

export function FuturesReplayPage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<FuturesContract[]>([]);
  const [datasetIndex, setDatasetIndex] = useState(2);
  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  // Futures contracts print fast, so 1x here is deliberately closer to a
  // readable, real-feeling pace instead of blurring past in under a second.
  const tape = useTapePlayer(allCandles, { warmup: WARMUP, baseIntervalMs: 2200, initialSpeed: 1 });
  const { cursor, setCursor, playing, setPlaying, speed, setSpeed, visible, current, prevBar, finished, step } = tape;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoverBar, setHoverBar] = useState<HoverBar | null>(null);
  const [fileDatasets, setFileDatasets] = useState<ReplayDataset[]>([]);
  const [fileDataset, setFileDataset] = useState<string | null>(null);
  // Real Webull data loads automatically whenever it exists for the active
  // contract -- this only becomes true when the user explicitly asks for
  // the simulated/API feed instead (via the "Simulated" dropdown option).
  const [useSimulated, setUseSimulated] = useState(false);

  // Sandboxed practice account for this replay session only -- separate
  // from the real futures paper account, same as the stock replay page.
  const [qty, setQty] = useState(0); // signed: positive = long, negative = short
  const [avgPrice, setAvgPrice] = useState(0);
  const [realizedPL, setRealizedPL] = useState(0);
  const [trades, setTrades] = useState<ReplayTrade[]>([]);
  const [orderQty, setOrderQty] = useState('1');

  const activeSymbol = (urlSymbol ?? 'MES').toUpperCase();
  // Only offer data files whose symbol maps to a known futures contract --
  // stock replay CSVs (AAPL, TSLA, ...) live in the same directory but don't belong here.
  const futuresFileDatasets = fileDatasets.filter((d) =>
    contracts.some((c) => c.symbol === baseContractSymbol(d.symbol))
  );
  const activeFileDataset = futuresFileDatasets.find((d) => d.file === fileDataset) ?? null;
  const urlContract = contracts.find((c) => c.symbol === activeSymbol) ?? null;
  const contract = fileDataset
    ? contracts.find((c) => c.symbol === baseContractSymbol(activeFileDataset?.symbol ?? '')) ?? null
    : urlContract;
  // Prefer the finest real-data resolution available for this contract.
  const preferredFileForSymbol = (symbol: string): ReplayDataset | null => {
    const matches = futuresFileDatasets.filter((d) => baseContractSymbol(d.symbol) === symbol);
    if (matches.length === 0) return null;
    return matches.find((d) => d.file.includes('5min')) ?? matches[0];
  };
  const dataset = DATASETS[datasetIndex];
  const tickAnimationMs = Math.min(350, (2200 / speed) * 0.35);

  const price = current?.close ?? 0;
  const tickChange = current && prevBar ? current.close - prevBar.close : 0;
  const tickChangePercent = current && prevBar && prevBar.close ? (tickChange / prevBar.close) * 100 : 0;

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
    tape.reset();
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
    setFileDataset(null);
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

  async function loadFile(file: string) {
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const candles = await api.getReplayDatasetCandles(file);
      if (candles.length < WARMUP + 5) {
        setError('Not enough rows in this data file for a replay.');
        setAllCandles([]);
      } else {
        setAllCandles(candles);
        resetSession();
        setFileDataset(file);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data file');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadContracts();
    api.getReplayDatasets().then(setFileDatasets).catch(() => setFileDatasets([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching to a different contract always re-checks for real data first,
  // even if "Simulated" was picked for a previous contract.
  useEffect(() => {
    setUseSimulated(false);
  }, [activeSymbol]);

  useEffect(() => {
    if (!urlContract) return;
    if (useSimulated) {
      loadChart();
      return;
    }
    const preferred = preferredFileForSymbol(urlContract.symbol);
    if (preferred) {
      loadFile(preferred.file);
    } else {
      loadChart();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlContract?.symbol, datasetIndex, futuresFileDatasets.length, useSimulated]);

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
          <h2 style={{ margin: 0 }}>Futures Replay — {fileDataset ? activeFileDataset?.symbol ?? activeSymbol : contract?.symbol ?? activeSymbol}</h2>
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
        <div style={{ maxWidth: 340 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {contracts.map((c) => (
              <button
                key={c.symbol}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700 }}
                onClick={() => navigate(`/futures-replay/${c.symbol}`)}
                disabled={fileDataset === null && c.symbol === activeSymbol}
              >
                {c.symbol}
              </button>
            ))}
          </div>
          {futuresFileDatasets.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Data file
              </span>
              <select
                className="search-input"
                style={{ width: 200 }}
                value={fileDataset ?? ''}
                disabled={loading}
                onChange={(e) => {
                  if (e.target.value) {
                    setUseSimulated(false);
                    loadFile(e.target.value);
                  } else {
                    setUseSimulated(true);
                  }
                }}
              >
                <option value="">Simulated (no real data)</option>
                {futuresFileDatasets.map((d) => (
                  <option key={d.file} value={d.file}>
                    {d.symbol} — {d.file} ({d.rowCount} bars)
                  </option>
                ))}
              </select>
            </div>
          )}
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
                  onClick={step}
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
              <span style={{ color: 'var(--text-dim)' }}>EMA(8,50)</span>{' '}
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
