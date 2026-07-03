import { useEffect, useMemo, useRef, useState } from 'react';
import { streamScreen } from './api';
import FilterBar from './components/FilterBar';
import ResultsTable from './components/ResultsTable';
import StockChart from './components/StockChart';
import VoiceControl from './components/VoiceControl';
import type { ScreenResult, VoiceAction } from './types';

export default function App() {
  const [universe, setUniverse] = useState<'sp500' | 'watchlist'>('sp500');
  const [watchlist, setWatchlist] = useState('AAPL, MSFT, NVDA, AMZN, GOOGL');
  const [onlyActive, setOnlyActive] = useState(true);
  const [trendFilter, setTrendFilter] = useState('all');
  const [maFilter, setMaFilter] = useState('all');

  const [results, setResults] = useState<ScreenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);

  const cancelRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRef.current?.(), []);

  function runScreen(override?: { universe?: 'sp500' | 'watchlist'; watchlist?: string }) {
    const effectiveUniverse = override?.universe ?? universe;
    const effectiveWatchlist = override?.watchlist ?? watchlist;

    if (effectiveUniverse === 'watchlist' && !effectiveWatchlist.trim()) {
      setError('Add at least one ticker to your watchlist.');
      return;
    }

    cancelRef.current?.();
    setLoading(true);
    setError(null);
    setProgress({ processed: 0, total: 0 });

    cancelRef.current = streamScreen(
      { universe: effectiveUniverse, watchlist: effectiveWatchlist },
      {
        onProgress: (processed, total) => setProgress({ processed, total }),
        onDone: (screenResults) => {
          setResults(screenResults);
          setLastRunAt(new Date());
          setSelectedTicker(screenResults[0]?.ticker ?? null);
          setLoading(false);
          setProgress(null);
        },
        onError: (message) => {
          setError(message);
          setLoading(false);
          setProgress(null);
        },
      }
    );
  }

  // Applies a batch of voice-driven actions. Filter/watchlist/universe
  // setters update state as usual, but run_screen uses locally tracked
  // "effective" values instead of the (still-stale, pre-render) React
  // state so a single voice command like "switch to my watchlist and run
  // it" doesn't scan against the universe that was active before the command.
  function handleVoiceActions(actions: VoiceAction[]) {
    let effectiveUniverse = universe;
    let effectiveWatchlist = watchlist;
    let shouldRun = false;

    for (const action of actions) {
      switch (action.type) {
        case 'set_universe':
          effectiveUniverse = action.universe;
          setUniverse(action.universe);
          break;
        case 'set_watchlist':
          effectiveWatchlist = action.tickers;
          setWatchlist(action.tickers);
          break;
        case 'set_trend_filter':
          setTrendFilter(action.value);
          break;
        case 'set_ma_filter':
          setMaFilter(action.value);
          break;
        case 'set_only_active':
          setOnlyActive(action.enabled);
          break;
        case 'select_ticker':
          setSelectedTicker(action.ticker);
          break;
        case 'run_screen':
          shouldRun = true;
          break;
      }
    }

    if (shouldRun) {
      runScreen({ universe: effectiveUniverse, watchlist: effectiveWatchlist });
    }
  }

  const filtered = useMemo(() => {
    return results.filter((r) => {
      if (onlyActive && !r.best_setup) return false;
      if (trendFilter !== 'all' && r.trend_bias !== trendFilter) return false;
      if (maFilter !== 'all' && !r.best_setup?.startsWith(`MA${maFilter}`)) return false;
      return true;
    });
  }, [results, onlyActive, trendFilter, maFilter]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-slate-50">Stock Screener</h1>
          <p className="mt-1 text-sm text-slate-400">
            Top-down MA20 / MA200 / MA400 (simple moving average) bounce setups, built on real
            daily price data.
          </p>
        </header>

        <div className="mb-4">
          <VoiceControl
            filters={{
              universe,
              watchlist,
              trend_filter: trendFilter,
              ma_filter: maFilter,
              only_active: onlyActive,
            }}
            results={filtered}
            onActions={handleVoiceActions}
          />
        </div>

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
          onRun={() => runScreen()}
          loading={loading}
          progress={progress}
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
