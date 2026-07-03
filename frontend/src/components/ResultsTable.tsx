import type { ScreenResult, TrendBias } from '../types';

interface Props {
  results: ScreenResult[];
  selectedTicker: string | null;
  onSelect: (ticker: string) => void;
}

const trendStyles: Record<TrendBias, string> = {
  bullish: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  bearish: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  mixed: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const setupStyles: Record<string, string> = {
  confirmed_bounce: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  testing: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

function formatSetup(setup: string | null): { label: string; cls: string } {
  if (!setup) return { label: '—', cls: 'text-slate-500' };
  const [ma, status] = setup.split(' ');
  const cls = setupStyles[status] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  const label = `${ma} ${status === 'confirmed_bounce' ? 'bounce' : 'testing'}`;
  return { label, cls };
}

export default function ResultsTable({ results, selectedTicker, onSelect }: Props) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-500">
        No results yet. Run a screen to see bounce setups.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-800">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-800 bg-slate-900/80 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3">Ticker</th>
            <th className="px-4 py-3 text-right">Price</th>
            <th className="px-4 py-3 text-right">Chg %</th>
            <th className="px-4 py-3">Trend</th>
            <th className="px-4 py-3">Setup</th>
            <th className="px-4 py-3 text-right">MA20</th>
            <th className="px-4 py-3 text-right">MA200</th>
            <th className="px-4 py-3 text-right">MA400</th>
            <th className="px-4 py-3 text-right">Volume</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const setup = formatSetup(r.best_setup);
            const isSelected = r.ticker === selectedTicker;
            return (
              <tr
                key={r.ticker}
                onClick={() => onSelect(r.ticker)}
                className={`cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-800/40 ${
                  isSelected ? 'bg-slate-800/60' : ''
                }`}
              >
                <td className="px-4 py-2.5 font-medium text-slate-100">{r.ticker}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-200">
                  ${r.price.toFixed(2)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums ${
                    r.change_pct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {r.change_pct >= 0 ? '+' : ''}
                  {r.change_pct.toFixed(2)}%
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-block rounded-full border px-2 py-0.5 text-xs capitalize ${trendStyles[r.trend_bias]}`}
                  >
                    {r.trend_bias}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={`inline-block rounded-full border px-2 py-0.5 text-xs ${setup.cls}`}>
                    {setup.label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                  {r.ma20 ? `$${r.ma20.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                  {r.ma200 ? `$${r.ma200.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                  {r.ma400 ? `$${r.ma400.toFixed(2)}` : '—'}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                  {r.volume.toLocaleString()}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
