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
import IntradayChart from './IntradayChart';

const INTRADAY_MINUTES = 45;
const INTRADAY_DAYS = 5;

type View = 'daily' | 'intraday';

export default function StockChart({ ticker }: { ticker: string }) {
  const [view, setView] = useState<View>('daily');
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
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">
          {ticker} — {view === 'daily' ? 'price vs. MA20 / MA200 / MA400' : `${INTRADAY_MINUTES}-min bars, last ${INTRADAY_DAYS} days`}
        </h3>
        <div className="flex rounded-md border border-slate-700 text-xs">
          <button
            onClick={() => setView('daily')}
            className={`rounded-l-md px-3 py-1 transition ${
              view === 'daily' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Daily
          </button>
          <button
            onClick={() => setView('intraday')}
            className={`rounded-r-md px-3 py-1 transition ${
              view === 'intraday' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Intraday
          </button>
        </div>
      </div>

      {view === 'intraday' ? (
        <IntradayChart ticker={ticker} minutes={INTRADAY_MINUTES} days={INTRADAY_DAYS} />
      ) : (
        <>
          {error && <p className="text-sm text-rose-400">{error}</p>}
          {!error && !candles && <p className="text-sm text-slate-500">Loading chart…</p>}
          {candles && (
            <ResponsiveContainer width="100%" height={340}>
              <LineChart data={candles} margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={40} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11, fill: '#64748b' }} width={60} />
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
        </>
      )}
    </div>
  );
}
