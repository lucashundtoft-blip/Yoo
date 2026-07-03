import { useMemo, useState } from 'react';
import { fetchScreen } from './api';
import FilterBar from './components/FilterBar';
import ResultsTable from './components/ResultsTable';
import StockChart from './components/StockChart';
import type { ScreenResult } from './types';

export default function App() {
  const [universe, setUniverse] = useState<'sp500' | 'watchlist'>('sp500');
  const [watchlist, setWatchlist] = useState('AAPL, MSFT, NVDA, AMZN, GOOGL');
  const [onlyActive, setOnlyActive] = useState(true);
  const [trendFilter, setTrendFilter] = useState('all');
  const [maFilter, setMaFilter] = useState('all');

  const [results, setResults] = useState<ScreenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  async function runScreen() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchScreen({ universe, watchlist, onlyActive });
      setResults(res.results);
      setLastRunAt(new Date());
      setSelectedTicker(res.results[0]?.ticker ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Screen failed');
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (trendFilter !== 'all' && r.trend_bias !== trendFilter) return false;
      if (maFilter !== 'all' && !r.best_setup?.startsWith(`MA${maFilter}`)) return false;
      return true;
    });
  }, [results, trendFilter, maFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-50">Stock Screener</h1>
          <p className="mt-1 text-sm text-slate-400">
            Top-down MA20 / MA200 / MA400 bounce setups, built on real daily price data.
          </p>
        </header>

        <FilterBar
          universe={universe}
          onUniverseChange={setUniverse}
          watchlist={watchlist}
          onWatchlistChange={setWatchlist}
          onlyActive={onlyActive}
          onOnlyActiveChange={setOnlyActive}
          trendFilter={trendFilter}
          onTrendFilterChange={setTrendFilter}
          maFilter={maFilter}
          onMaFilterChange={setMaFilter}
          onRun={runScreen}
          loading={loading}
        />

        {error && (
          <div className="mt-4 rounded-md border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
          <span>{filtered.length} result(s)</span>
          {lastRunAt && <span>Last run {lastRunAt.toLocaleTimeString()}</span>}
        </div>

        <div className="mt-2">
          <ResultsTable results={filtered} selectedTicker={selectedTicker} onSelect={setSelectedTicker} />
        </div>

        {selectedTicker && (
          <div className="mt-6">
            <StockChart ticker={selectedTicker} />
          </div>
        )}
      </div>
    </div>
  );
}
