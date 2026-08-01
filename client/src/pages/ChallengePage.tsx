import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, type Candle, type ChallengeRun, type ChallengeStats } from '../api';
import { Chart, type TradeMarker, type PositionLine } from '../components/Chart';
import { formatCurrency, formatSigned, formatPercent, changeClass } from '../format';

const DATASETS: { label: string; short: string; days: number; resolution: 'D' | '60' | '5'; bars: number }[] = [
  { label: '1 day (5-min bars)', short: '1D', days: 1, resolution: '5', bars: 24 },
  { label: '5 days (hourly bars)', short: '5D', days: 5, resolution: '60', bars: 24 },
  { label: '6 months (daily bars)', short: '6M', days: 180, resolution: 'D', bars: 30 },
  { label: '1 year (daily bars)', short: '1Y', days: 365, resolution: 'D', bars: 30 },
  { label: '2 years (daily bars)', short: '2Y', days: 730, resolution: 'D', bars: 40 },
];

const SPEEDS = [1, 2, 5, 10];
const FALLBACK_TICKERS = ['AAPL', 'AMD', 'MU', 'TSLA', 'NVDA'];
const WARMUP = 20; // candles of context shown before the challenge window starts
const SESSION_CASH = 100_000;

interface ChallengeTrade {
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  time: number;
}

interface ChallengeResult {
  yourReturnPct: number;
  buyHoldReturnPct: number;
  alphaPct: number;
  score: number;
  tradeCount: number;
}

// Slice a random contiguous window out of the full history so replaying the
// same symbol doesn't mean replaying the same challenge twice.
function pickSessionWindow(candles: Candle[], bars: number): Candle[] {
  const minStart = WARMUP;
  const maxStart = candles.length - bars;
  const startOffset = maxStart <= minStart ? minStart : minStart + Math.floor(Math.random() * (maxStart - minStart + 1));
  return candles.slice(startOffset - WARMUP, startOffset + bars);
}

export function ChallengePage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const activeSymbol = (urlSymbol ?? 'AAPL').toUpperCase();

  const [symbolInput, setSymbolInput] = useState(activeSymbol);
  const [datasetIndex, setDatasetIndex] = useState(2);
  const dataset = DATASETS[datasetIndex];

  const [sessionCandles, setSessionCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(WARMUP);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [watchlistSymbols, setWatchlistSymbols] = useState<string[]>([]);

  const [cash, setCash] = useState(SESSION_CASH);
  const [qty, setQty] = useState(0);
  const [avgCost, setAvgCost] = useState(0);
  const [realizedPL, setRealizedPL] = useState(0);
  const [trades, setTrades] = useState<ChallengeTrade[]>([]);
  const [orderQty, setOrderQty] = useState('10');

  const [result, setResult] = useState<ChallengeResult | null>(null);
  const savedRef = useRef(false);

  const [history, setHistory] = useState<ChallengeRun[]>([]);
  const [stats, setStats] = useState<ChallengeStats | null>(null);

  const visible = useMemo(() => sessionCandles.slice(0, cursor), [sessionCandles, cursor]);
  const current = visible[visible.length - 1] ?? null;
  const prevBar = visible[visible.length - 2] ?? null;
  const price = current?.close ?? 0;
  const tickChange = current && prevBar ? current.close - prevBar.close : 0;
  const tickChangePercent = current && prevBar && prevBar.close ? (tickChange / prevBar.close) * 100 : 0;
  const finished = sessionCandles.length > 0 && cursor >= sessionCandles.length;
  const tickAnimationMs = Math.min(350, (1000 / speed) * 0.75);

  const tradeMarkers: TradeMarker[] = useMemo(
    () => [...trades].sort((a, b) => a.time - b.time).map((t) => ({ time: t.time, side: t.side })),
    [trades]
  );
  const positionLine: PositionLine | null =
    qty > 0 ? { price: avgCost, title: `POS: ${qty} @ ${formatCurrency(avgCost)}` } : null;
  const startPrice = sessionCandles[WARMUP - 1]?.close ?? 0;
  const extraPriceLines: PositionLine[] = startPrice
    ? [{ price: startPrice, title: `START ${formatCurrency(startPrice)}`, color: '#8b939d' }]
    : [];

  function refreshHistory() {
    api
      .getChallenges(10)
      .then(({ runs, stats: s }) => {
        setHistory(runs);
        setStats(s);
      })
      .catch(() => {});
  }

  useEffect(() => {
    refreshHistory();
    api.getWatchlist().then(setWatchlistSymbols).catch(() => setWatchlistSymbols([]));
  }, []);

  async function load(symbolToLoad: string, dsIndex: number) {
    const s = symbolToLoad.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    setPlaying(false);
    try {
      const ds = DATASETS[dsIndex];
      const candles = await api.getCandles(s, ds.resolution, ds.days);
      if (candles.length < WARMUP + ds.bars + 5) {
        setError('Not enough historical data for this symbol/range.');
        setSessionCandles([]);
      } else {
        setSessionCandles(pickSessionWindow(candles, ds.bars));
        setCash(SESSION_CASH);
        setQty(0);
        setAvgCost(0);
        setRealizedPL(0);
        setTrades([]);
        setCursor(WARMUP);
        setResult(null);
        savedRef.current = false;
        if (s !== activeSymbol) navigate(`/replay/${s}/challenge`, { replace: true });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(activeSymbol, datasetIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSymbol, datasetIndex]);

  useEffect(() => {
    if (!playing) return;
    const interval = setInterval(() => {
      setCursor((c) => {
        if (c >= sessionCandles.length) {
          setPlaying(false);
          return c;
        }
        return c + 1;
      });
    }, 1000 / speed);
    return () => clearInterval(interval);
  }, [playing, speed, sessionCandles.length]);

  // Score the run exactly once, the moment the session's last bar is revealed.
  useEffect(() => {
    if (!finished || savedRef.current || !sessionCandles.length) return;
    savedRef.current = true;
    const endPrice = sessionCandles[sessionCandles.length - 1].close;
    const finalValue = cash + qty * endPrice;
    const yourReturnPct = ((finalValue - SESSION_CASH) / SESSION_CASH) * 100;
    const buyHoldReturnPct = startPrice ? ((endPrice - startPrice) / startPrice) * 100 : 0;
    const alphaPct = yourReturnPct - buyHoldReturnPct;
    const score = Math.round(alphaPct * 100);
    const r: ChallengeResult = { yourReturnPct, buyHoldReturnPct, alphaPct, score, tradeCount: trades.length };
    setResult(r);
    api
      .recordChallenge({ symbol: activeSymbol, datasetLabel: dataset.label, bars: dataset.bars, ...r })
      .then(refreshHistory)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

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
  const canBuy = current && !finished && orderQtyNum > 0 && orderQtyNum * price <= cash;
  const canSell = current && !finished && orderQtyNum > 0 && orderQtyNum <= qty;

  function formatTime(t: number) {
    const d = new Date(t * 1000);
    return dataset.resolution === 'D' ? d.toLocaleDateString() : d.toLocaleString();
  }

  function newChallenge() {
    load(activeSymbol, datasetIndex);
  }

  function newSymbol() {
    const pool = (watchlistSymbols.length > 0 ? watchlistSymbols : FALLBACK_TICKERS).filter((s) => s !== activeSymbol);
    const next = pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_TICKERS[0];
    navigate(`/replay/${next}/challenge`);
  }

  const tickerChips = watchlistSymbols.length > 0 ? watchlistSymbols : FALLBACK_TICKERS;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>🏆 Beat the Market — {activeSymbol}</h2>
          {current && (
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontSize: 36, fontWeight: 800 }}>{formatCurrency(price)}</span>
              <span className={changeClass(tickChange)} style={{ fontSize: 18, fontWeight: 700 }}>
                {formatSigned(tickChange)} ({formatPercent(tickChangePercent)})
              </span>
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            A random {dataset.bars}-bar window, fresh {formatCurrency(SESSION_CASH, 0)} account. Beat simple
            buy-and-hold to score points. <Link to={`/replay/${activeSymbol}`}>← Free replay</Link>
          </div>
        </div>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="search-input"
              style={{ width: 110 }}
              value={symbolInput}
              onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(`/replay/${symbolInput.trim().toUpperCase()}/challenge`);
              }}
              placeholder="Symbol"
            />
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/replay/${symbolInput.trim().toUpperCase()}/challenge`)}
              disabled={loading}
            >
              {loading ? 'Loading…' : 'Load'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {tickerChips.map((sym) => (
              <button
                key={sym}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: 12, fontWeight: 700 }}
                onClick={() => navigate(`/replay/${sym}/challenge`)}
                disabled={sym === activeSymbol}
              >
                {sym}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats && stats.totalRuns > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="stat-row">
            <div className="stat">
              <span className="label">Best score</span>
              <span className="value" style={{ fontSize: 18 }}>{stats.bestScore}</span>
            </div>
            <div className="stat">
              <span className="label">Best alpha</span>
              <span className={`value ${changeClass(stats.bestAlphaPct)}`} style={{ fontSize: 18 }}>
                {formatPercent(stats.bestAlphaPct)}
              </span>
            </div>
            <div className="stat">
              <span className="label">Win rate</span>
              <span className="value" style={{ fontSize: 18 }}>
                {Math.round((stats.wins / stats.totalRuns) * 100)}%
              </span>
            </div>
            <div className="stat">
              <span className="label">Runs played</span>
              <span className="value" style={{ fontSize: 18 }}>{stats.totalRuns}</span>
            </div>
          </div>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="tabs">
              {DATASETS.map((d, i) => (
                <button key={d.label} title={d.label} className={i === datasetIndex ? 'active' : ''} onClick={() => setDatasetIndex(i)} disabled={playing}>
                  {d.short}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 10 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-secondary" onClick={() => setPlaying(!playing)} disabled={finished || !sessionCandles.length}>
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setCursor((c) => Math.min(c + 1, sessionCandles.length))}
                  disabled={finished || !sessionCandles.length}
                >
                  Step ›
                </button>
                <button className="btn btn-secondary" onClick={newChallenge} disabled={loading}>
                  ↺ New Challenge
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
                Bar {Math.max(0, cursor - WARMUP)} / {dataset.bars}
                {current ? ` — ${formatTime(current.time)}` : ''}
                {finished ? ' — challenge complete' : ''}
              </span>
            </div>
            <input
              type="range"
              min={WARMUP}
              max={sessionCandles.length}
              value={cursor}
              onChange={(e) => setCursor(Number(e.target.value))}
              style={{ width: '100%', marginBottom: 8 }}
            />

            <div className="legend">
              <span>
                <span className="legend-swatch" style={{ background: '#8b939d' }} />
                Challenge start price
              </span>
            </div>
            <Chart
              candles={visible}
              showProjection={false}
              smaPeriods={[]}
              tickAnimationMs={tickAnimationMs}
              tradeMarkers={tradeMarkers}
              positionLine={positionLine}
              extraPriceLines={extraPriceLines}
              height="clamp(320px, 55dvh, 560px)"
            />
          </div>
        </div>

        <div>
          {!finished && (
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
              <div className="order-actions">
                <button className="btn btn-buy" style={{ flex: 1 }} disabled={!canBuy} onClick={() => trade('BUY')}>
                  Buy @ {current ? formatCurrency(price) : '—'}
                </button>
                <button className="btn btn-sell" style={{ flex: 1 }} disabled={!canSell} onClick={() => trade('SELL')}>
                  Sell
                </button>
              </div>
            </div>
          )}

          {finished && result && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ margin: '0 0 12px', fontSize: 14, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Challenge Result
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Your return</span>
                <span className={changeClass(result.yourReturnPct)} style={{ fontWeight: 700 }}>
                  {formatPercent(result.yourReturnPct)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Buy &amp; hold return</span>
                <span className={changeClass(result.buyHoldReturnPct)} style={{ fontWeight: 700 }}>
                  {formatPercent(result.buyHoldReturnPct)}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: 'var(--text-dim)' }}>Trades placed</span>
                <span style={{ fontWeight: 700 }}>{result.tradeCount}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 800 }}>
                  <span className={result.alphaPct >= 0 ? 'up' : 'down'}>
                    {result.alphaPct >= 0 ? '🏆 You beat the market' : '📉 The market beat you'}
                  </span>
                  <span className={changeClass(result.alphaPct)}>{formatPercent(result.alphaPct)} alpha</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6 }}>
                  <strong>Alpha</strong> is the return you generated beyond simply buying and holding for the
                  same period — it's the benchmark professional traders are actually judged on. Score: {result.score} pts.
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-buy" style={{ flex: 1 }} onClick={newChallenge}>
                  Play Again
                </button>
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={newSymbol}>
                  New Symbol
                </button>
              </div>
            </div>
          )}

          <div className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Recent Runs
            </h3>
            {history.length === 0 ? (
              <div className="empty-state" style={{ padding: '16px 0' }}>Finish a challenge to see your history here.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Range</th>
                    <th className="num">Alpha</th>
                    <th className="num">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.id} style={{ cursor: 'default' }}>
                      <td>{r.symbol}</td>
                      <td style={{ fontSize: 12 }}>{r.datasetLabel}</td>
                      <td className={`num ${changeClass(r.alphaPct)}`}>{formatPercent(r.alphaPct)}</td>
                      <td className="num">{r.score}</td>
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
