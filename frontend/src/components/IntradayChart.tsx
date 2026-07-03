import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchIntradayHistory } from '../api';
import type { IntradayCandle } from '../types';

interface Props {
  ticker: string;
  minutes: number;
  days: number;
}

export default function IntradayChart({ ticker, minutes, days }: Props) {
  const [candles, setCandles] = useState<IntradayCandle[] | null>(null);
  const [actualMinutes, setActualMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    setError(null);
    fetchIntradayHistory(ticker, minutes, days)
      .then((res) => {
        if (cancelled) return;
        setCandles(res.candles);
        setActualMinutes(res.interval_minutes);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker, minutes, days]);

  return (
    <div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!error && !candles && <p className="text-sm text-slate-500">Loading intraday chart…</p>}
      {candles && candles.length === 0 && (
        <p className="text-sm text-slate-500">No intraday data available for {ticker}.</p>
      )}
      {candles && candles.length > 0 && (
        <>
          {actualMinutes !== null && actualMinutes !== minutes && (
            <p className="mb-2 text-xs text-amber-400">
              {minutes}-min bars aren't available from the current data source — showing{' '}
              {actualMinutes}-min bars instead.
            </p>
          )}
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={candles} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} minTickGap={50} />
              <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#64748b' }} width={60} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Line type="monotone" dataKey="close" name="Price" stroke="#e2e8f0" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={80}>
            <BarChart data={candles} margin={{ top: 0, right: 16, left: 4, bottom: 4 }}>
              <XAxis dataKey="time" hide />
              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="volume" name="Volume" fill="#334155" />
            </BarChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
