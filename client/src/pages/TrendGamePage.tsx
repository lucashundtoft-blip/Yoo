import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, type Candle } from '../api';
import { Chart, type PositionLine } from '../components/Chart';
import { formatCurrency, formatSigned, changeClass } from '../format';

const DATASETS: { label: string; short: string; days: number; resolution: 'D' | '60' | '5'; horizon: number }[] = [
  { label: '1 day (5-min bars)', short: '1D', days: 1, resolution: '5', horizon: 12 },
  { label: '5 days (hourly bars)', short: '5D', days: 5, resolution: '60', horizon: 6 },
  { label: '6 months (daily bars)', short: '6M', days: 180, resolution: 'D', horizon: 5 },
  { label: '1 year (daily bars)', short: '1Y', days: 365, resolution: 'D', horizon: 5 },
];

const WARMUP = 20;
const FALLBACK_TICKERS = ['AAPL', 'AMD', 'MU', 'TSLA', 'NVDA'];
const FLAT_THRESHOLD_PCT = 0.15;
const REVEAL_TICK_MS = 260;

type Phase = 'predict' | 'revealing' | 'result' | 'finished';

interface RoundResult {
  round: number;
  predictedPct: number;
  actualPct: number;
  direction: 'up' | 'down' | 'flat';
  actualDirection: 'up' | 'down' | 'flat';
  correct: boolean;
  points: number;
}

function directionOf(pct: number): 'up' | 'down' | 'flat' {
  if (pct > FLAT_THRESHOLD_PCT) return 'up';
  if (pct < -FLAT_THRESHOLD_PCT) return 'down';
  return 'flat';
}

const DIRECTION_LABEL: Record<'up' | 'down' | 'flat', string> = { up: 'Bullish', down: 'Bearish', flat: 'Flat' };

export function TrendGamePage() {
  const { symbol: urlSymbol } = useParams();
  const navigate = useNavigate();
  const activeSymbol = (urlSymbol ?? 'AAPL').toUpperCase();

  const [datasetIndex, setDatasetIndex] = useState(2);
  const dataset = DATASETS[datasetIndex];

  const [allCandles, setAllCandles] = useState<Candle[]>([]);
  const [cursor, setCursor] = useState(WARMUP);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>('predict');
  const [predictedPct, setPredictedPct] = useState(0);
  const roundStartCursorRef = useRef(WARMUP);
  const roundStartPriceRef = useRef(0);

  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [history, setHistory] = useState<RoundResult[]>([]);

  const visible = useMemo(() => allCandles.slice(0, cursor), [allCandles, cursor]);
  const current = visible[visible.length - 1] ?? null;

  async function load(symbolToLoad: string, dsIndex: number) {
    const s = symbolToLoad.trim().toUpperCase();
    if (!s) return;
    setLoading(true);
    setError(null);
    try {
      const ds = DATASETS[dsIndex];
      const candles = await api.getCandles(s, ds.resolution, ds.days);
      if (candles.length < WARMUP + ds.horizon + 5) {
        setError('Not enough historical data for this symbol/range.');
        setAllCandles([]);
      } else {
        setAllCandles(candles);
        setCursor(WARMUP);
        roundStartCursorRef.current = WARMUP;
        roundStartPriceRef.current = candles[WARMUP - 1].close;
        setPhase('predict');
        setPredictedPct(0);
        if (s !== activeSymbol) navigate(`/replay/${s}/game`, { replace: true });
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

  // Reveal phase: step forward one bar at a time until the round's horizon is reached.
  useEffect(() => {
    if (phase !== 'revealing') return;
    const target = roundStartCursorRef.current + dataset.horizon;
    const interval = setInterval(() => {
      setCursor((c) => {
        if (c >= target) return c;
        const next = c + 1;
        if (next >= target) {
          clearInterval(interval);
          setPhase('result');
        }
        return next;
      });
    }, REVEAL_TICK_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, dataset.horizon]);

  const lastRound = history[0] ?? null;

  function lockInPrediction() {
    if (!current) return;
    roundStartCursorRef.current = cursor;
    roundStartPriceRef.current = current.close;
    setPhase('revealing');
  }

  function scoreRound() {
    const startPrice = roundStartPriceRef.current;
    const endCandle = allCandles[roundStartCursorRef.current + dataset.horizon - 1];
    if (!endCandle || !startPrice) return;
    const endPrice = endCandle.close;
    const actualPct = ((endPrice - startPrice) / startPrice) * 100;
    const direction = directionOf(predictedPct);
    const actualDirection = directionOf(actualPct);
    const correct = direction === actualDirection;
    const directionPoints = correct ? 60 : 0;
    const priceScale = startPrice * 0.05;
    const priceError = Math.abs(startPrice * (predictedPct / 100) - startPrice * (actualPct / 100));
    const accuracyPoints = Math.max(0, Math.round(40 * (1 - priceError / priceScale)));
    const points = directionPoints + accuracyPoints;

    setScore((s) => s + points);
    setStreak((s) => {
      const next = correct ? s + 1 : 0;
      setBestStreak((b) => Math.max(b, next));
      return next;
    });
    setHistory((h) => [
      { round: h.length + 1, predictedPct, actualPct, direction, actualDirection, correct, points },
      ...h,
    ].slice(0, 8));
  }

  const scoredRoundCursorRef = useRef(-1);
  useEffect(() => {
    if (phase === 'result' && scoredRoundCursorRef.current !== roundStartCursorRef.current) {
      scoredRoundCursorRef.current = roundStartCursorRef.current;
      scoreRound();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function nextRound() {
    if (cursor + dataset.horizon > allCandles.length) {
      setPhase('finished');
      return;
    }
    roundStartCursorRef.current = cursor;
    roundStartPriceRef.current = current?.close ?? 0;
    setPredictedPct(0);
    setPhase('predict');
  }

  function newSymbol() {
    const pool = FALLBACK_TICKERS.filter((s) => s !== activeSymbol);
    const next = pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_TICKERS[0];
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setHistory([]);
    navigate(`/replay/${next}/game`);
  }

  const startPrice = roundStartPriceRef.current;
  const predictedPrice = startPrice * (1 + predictedPct / 100);
  const predictedDirection = directionOf(predictedPct);

  const priceLines: PositionLine[] = useMemo(() => {
    if (phase === 'predict' && startPrice) {
      return [{ price: predictedPrice, title: `TARGET ${formatSigned(predictedPct)}%`, color: '#e0a52c' }];
    }
    if ((phase === 'revealing' || phase === 'result') && startPrice) {
      const lines: PositionLine[] = [{ price: predictedPrice, title: `TARGET ${formatSigned(predictedPct)}%`, color: '#e0a52c' }];
      if (phase === 'result' && current) {
        lines.push({ price: current.close, title: `ACTUAL ${formatCurrency(current.close)}`, color: current.close >= startPrice ? '#17c964' : '#f5304a' });
      }
      return lines;
    }
    return [];
  }, [phase, predictedPrice, predictedPct, startPrice, current]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Trend Projection Practice — {activeSymbol}</h2>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 4 }}>
            Set your target for the next {dataset.horizon} bars, lock it in, then watch price play out.{' '}
            <Link to={`/replay/${activeSymbol}`}>Switch to trading replay →</Link>
          </div>
        </div>
        <div className="tabs" style={{ marginBottom: 0 }}>
          {DATASETS.map((d, i) => (
            <button key={d.label} title={d.label} className={i === datasetIndex ? 'active' : ''} onClick={() => setDatasetIndex(i)} disabled={phase === 'revealing'}>
              {d.short}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="grid-2">
        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>
                Bar {Math.max(0, cursor)} / {allCandles.length}
              </span>
              {current && (
                <span style={{ fontSize: 20, fontWeight: 800 }}>{formatCurrency(current.close)}</span>
              )}
            </div>
            <Chart
              candles={visible}
              showProjection={false}
              smaPeriods={[]}
              extraPriceLines={priceLines}
              height="clamp(320px, 50dvh, 480px)"
            />
          </div>
        </div>

        <div>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="stat-row" style={{ marginBottom: 14 }}>
              <div className="stat">
                <span className="label">Score</span>
                <span className="value" style={{ fontSize: 20 }}>{score}</span>
              </div>
              <div className="stat">
                <span className="label">Streak</span>
                <span className="value" style={{ fontSize: 20 }}>{streak}</span>
              </div>
              <div className="stat">
                <span className="label">Best streak</span>
                <span className="value" style={{ fontSize: 20 }}>{bestStreak}</span>
              </div>
              <div className="stat">
                <span className="label">Rounds</span>
                <span className="value" style={{ fontSize: 20 }}>{history.length}</span>
              </div>
            </div>

            {phase === 'predict' && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 10 }}>
                  Where will {activeSymbol} be in {dataset.horizon} bars?
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className={changeClass(predictedPct)} style={{ fontWeight: 700 }}>
                    {DIRECTION_LABEL[predictedDirection]} {formatSigned(predictedPct)}%
                  </span>
                  <span style={{ color: 'var(--text-dim)' }}>{startPrice ? formatCurrency(predictedPrice) : '—'}</span>
                </div>
                <input
                  type="range"
                  min={-10}
                  max={10}
                  step={0.25}
                  value={predictedPct}
                  onChange={(e) => setPredictedPct(Number(e.target.value))}
                  style={{ width: '100%', marginBottom: 12 }}
                  disabled={!current}
                />
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPredictedPct(-4)} disabled={!current}>
                    ↓ Bearish
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPredictedPct(0)} disabled={!current}>
                    → Flat
                  </button>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPredictedPct(4)} disabled={!current}>
                    ↑ Bullish
                  </button>
                </div>
                <button className="btn btn-buy" style={{ width: '100%' }} onClick={lockInPrediction} disabled={!current || loading}>
                  Lock In Prediction
                </button>
              </>
            )}

            {phase === 'revealing' && (
              <div className="empty-state" style={{ padding: '24px 0' }}>Revealing bars…</div>
            )}

            {phase === 'result' && lastRound && (
              <>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-dim)' }}>You predicted</span>
                    <span className={changeClass(lastRound.predictedPct)}>
                      {DIRECTION_LABEL[lastRound.direction]} ({formatSigned(lastRound.predictedPct)}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-dim)' }}>Actually happened</span>
                    <span className={changeClass(lastRound.actualPct)}>
                      {DIRECTION_LABEL[lastRound.actualDirection]} ({formatSigned(lastRound.actualPct)}%)
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 18, fontWeight: 800 }}>
                    <span className={lastRound.correct ? 'up' : 'down'}>{lastRound.correct ? 'Correct direction!' : 'Wrong direction'}</span>
                    <span>+{lastRound.points} pts</span>
                  </div>
                </div>
                <button className="btn btn-secondary" style={{ width: '100%' }} onClick={nextRound}>
                  Next Round →
                </button>
              </>
            )}

            {phase === 'finished' && (
              <>
                <div className="empty-state" style={{ padding: '16px 0' }}>
                  Out of bars — final score {score} over {history.length} rounds.
                </div>
                <button className="btn btn-buy" style={{ width: '100%' }} onClick={newSymbol}>
                  Play a new symbol
                </button>
              </>
            )}
          </div>

          <div className="card">
            <h3 style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Round History
            </h3>
            {history.length === 0 ? (
              <div className="empty-state" style={{ padding: '16px 0' }}>Lock in a prediction to start scoring rounds.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Predicted</th>
                    <th>Actual</th>
                    <th className="num">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((r) => (
                    <tr key={r.round} style={{ cursor: 'default' }}>
                      <td>{r.round}</td>
                      <td className={changeClass(r.predictedPct)}>{DIRECTION_LABEL[r.direction]}</td>
                      <td className={changeClass(r.actualPct)}>{DIRECTION_LABEL[r.actualDirection]}</td>
                      <td className="num">{r.points}</td>
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
