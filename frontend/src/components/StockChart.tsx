import { useEffect, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { fetchStockHistory } from '../api';
import type { Candle } from '../types';

export default function StockChart({ ticker }: { ticker: string }) {
  const [candles, setCandles] = useState<Candle[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    setError(null);
    fetchStockHistory(ticker)
      .then((res) => {
        if (!cancelled) setCandles(res.candles);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [ticker]);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="mb-3 text-sm font-medium text-slate-300">
        {ticker} — price vs. MA20 / MA200 / MA400
      </h3>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!error && !candles && <p className="text-sm text-slate-500">Loading chart…</p>}
      {candles && (
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={candles} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#64748b' }}
              minTickGap={40}
            />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 11, fill: '#64748b' }}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', fontSize: 12 }}
              labelStyle={{ color: '#94a3b8' }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line type="monotone" dataKey="close" name="Price" stroke="#e2e8f0" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="ma20" name="MA20" stroke="#38bdf8" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="ma200" name="MA200" stroke="#facc15" dot={false} strokeWidth={1.5} />
            <Line type="monotone" dataKey="ma400" name="MA400" stroke="#f472b6" dot={false} strokeWidth={1.5} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
