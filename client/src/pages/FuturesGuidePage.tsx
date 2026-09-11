import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type FuturesStat } from '../api';
import { FuturesSubNav } from '../components/FuturesSubNav';
import { formatCurrency } from '../format';

type SortKey = 'symbol' | 'tickValue' | 'atrTicks' | 'atrDollars' | 'approxMargin' | 'atrPercentOfMargin';

const COLUMNS: { key: SortKey; label: string; hint: string; numeric: boolean }[] = [
  { key: 'symbol', label: 'Contract', hint: 'Symbol and product name', numeric: false },
  { key: 'tickValue', label: '$/Tick', hint: 'What one tick of movement is worth on a single contract', numeric: true },
  { key: 'atrTicks', label: 'Ticks/Day', hint: 'How many ticks it travels in an average day -- raw speed', numeric: true },
  { key: 'atrDollars', label: '$/Day', hint: "An average day's full range, in dollars, on one contract", numeric: true },
  { key: 'approxMargin', label: 'Margin', hint: 'Approximate day-trading margin to hold one contract', numeric: true },
  { key: 'atrPercentOfMargin', label: 'Day/Margin', hint: "Average day's range as a percentage of the margin tied up", numeric: true },
];

/** Warm for fast movers, cool for slow ones -- lets you eyeball which
 *  contracts throw the most dollars around per day at a glance. */
function heatColor(value: number | null, max: number): string {
  if (value === null || max <= 0) return 'transparent';
  const intensity = Math.min(1, value / max);
  return `rgba(224, 108, 44, ${0.08 + intensity * 0.32})`;
}

export function FuturesGuidePage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<FuturesStat[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('atrDollars');
  const [ascending, setAscending] = useState(false);

  useEffect(() => {
    api
      .getFuturesStats()
      .then(setStats)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load contract stats'));
  }, []);

  const sorted = useMemo(() => {
    if (!stats) return [];
    const rows = [...stats];
    rows.sort((a, b) => {
      if (sortKey === 'symbol') {
        return ascending ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
      }
      // Contracts with no data sort to the bottom either way rather than
      // pretending to be the slowest movers.
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return ascending ? av - bv : bv - av;
    });
    return rows;
  }, [stats, sortKey, ascending]);

  const maxDollars = useMemo(
    () => Math.max(0, ...(stats ?? []).map((s) => s.atrDollars ?? 0)),
    [stats]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAscending((prev) => !prev);
    else {
      setSortKey(key);
      setAscending(key === 'symbol' || key === 'approxMargin');
    }
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

      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Contract Guide</h2>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 6, maxWidth: 720 }}>
          How fast each contract moves and what that movement is worth. Speed and range come from
          the real average daily range (ATR over the last 14 sessions), so these update with the
          market rather than being fixed guesses. Margin figures are illustrative — check your
          broker's order ticket for the real number.
        </div>
      </div>

      {!stats ? (
        <div className="empty-state">Loading contract stats…</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    title={col.hint}
                    className={col.numeric ? 'num' : undefined}
                    style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
                    onClick={() => toggleSort(col.key)}
                  >
                    {col.label}
                    {sortKey === col.key ? (ascending ? ' ▲' : ' ▼') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => (
                <tr key={s.symbol} onClick={() => navigate(`/futures/${s.symbol}`)}>
                  <td>
                    <strong>{s.symbol}</strong>
                    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.name}</div>
                  </td>
                  <td className="num">{formatCurrency(s.tickValue)}</td>
                  <td className="num">{s.atrTicks === null ? '—' : Math.round(s.atrTicks).toLocaleString()}</td>
                  <td className="num" style={{ background: heatColor(s.atrDollars, maxDollars), fontWeight: 700 }}>
                    {s.atrDollars === null ? '—' : formatCurrency(s.atrDollars, 0)}
                  </td>
                  <td className="num">{formatCurrency(s.approxMargin, 0)}</td>
                  <td className="num">
                    {s.atrPercentOfMargin === null ? '—' : `${s.atrPercentOfMargin.toFixed(0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 14, lineHeight: 1.6 }}>
            <div>
              <strong>$/Tick</strong> — the smallest unit of profit or loss. A 4-tick stop on MES
              costs $5; the same 4-tick stop on ES costs $50.
            </div>
            <div>
              <strong>Ticks/Day</strong> — raw speed. A contract with more ticks per day gives you
              more chances to be right, and more chances to get shaken out.
            </div>
            <div>
              <strong>$/Day</strong> — what a full average day's range is worth. Treat this as the
              realistic ceiling for a one-contract day trade, not a target.
            </div>
            <div>
              <strong>Day/Margin</strong> — movement per dollar tied up. Higher means more action
              per dollar of margin, which cuts both directions.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
