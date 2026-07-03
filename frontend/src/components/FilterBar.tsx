interface Props {
  universe: 'sp500' | 'watchlist';
  onUniverseChange: (u: 'sp500' | 'watchlist') => void;
  watchlist: string;
  onWatchlistChange: (v: string) => void;
  onlyActive: boolean;
  onOnlyActiveChange: (v: boolean) => void;
  trendFilter: string;
  onTrendFilterChange: (v: string) => void;
  maFilter: string;
  onMaFilterChange: (v: string) => void;
  onRun: () => void;
  loading: boolean;
  progress: { processed: number; total: number } | null;
}

const selectClass =
  'bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500';

export default function FilterBar({
  universe,
  onUniverseChange,
  watchlist,
  onWatchlistChange,
  onlyActive,
  onOnlyActiveChange,
  trendFilter,
  onTrendFilterChange,
  maFilter,
  onMaFilterChange,
  onRun,
  loading,
  progress,
}: Props) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Universe</label>
          <select
            className={selectClass}
            value={universe}
            onChange={(e) => onUniverseChange(e.target.value as 'sp500' | 'watchlist')}
          >
            <option value="sp500">S&amp;P 500</option>
            <option value="watchlist">My watchlist</option>
          </select>
        </div>

        {universe === 'watchlist' && (
          <div className="flex flex-1 min-w-[220px] flex-col gap-1">
            <label className="text-xs uppercase tracking-wide text-slate-400">
              Tickers (comma separated)
            </label>
            <input
              className={selectClass + ' w-full'}
              placeholder="AAPL, MSFT, NVDA"
              value={watchlist}
              onChange={(e) => onWatchlistChange(e.target.value)}
            />
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">Trend bias</label>
          <select className={selectClass} value={trendFilter} onChange={(e) => onTrendFilterChange(e.target.value)}>
            <option value="all">All</option>
            <option value="bullish">Bullish</option>
            <option value="bearish">Bearish</option>
            <option value="mixed">Mixed</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs uppercase tracking-wide text-slate-400">MA setup</label>
          <select className={selectClass} value={maFilter} onChange={(e) => onMaFilterChange(e.target.value)}>
            <option value="all">All</option>
            <option value="20">MA20</option>
            <option value="200">MA200</option>
            <option value="400">MA400</option>
          </select>
        </div>

        <label className="flex items-center gap-2 pb-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => onOnlyActiveChange(e.target.checked)}
            className="h-4 w-4 accent-emerald-500"
          />
          Only show active setups
        </label>

        <button
          onClick={onRun}
          disabled={loading}
          className="ml-auto rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Scanning…' : 'Run screen'}
        </button>
      </div>
      {progress && progress.total > 0 ? (
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-200"
              style={{ width: `${Math.round((progress.processed / progress.total) * 100)}%` }}
            />
          </div>
          <span className="whitespace-nowrap text-xs tabular-nums text-slate-400">
            {progress.processed} / {progress.total} tickers
          </span>
        </div>
      ) : (
        <p className="text-xs text-slate-500">
          Scanning the full S&amp;P 500 pulls ~500 tickers of 3-year daily history — the first run
          can take a minute, cached tickers make repeat runs within 15 minutes much faster.
        </p>
      )}
    </div>
  );
}
