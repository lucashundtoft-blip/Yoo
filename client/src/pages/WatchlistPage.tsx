import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Quote } from '../api';
import { formatCurrency, formatPercent, changeClass } from '../format';

export function WatchlistPage() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  async function load() {
    const list = await api.getWatchlist();
    setSymbols(list);
    const entries = await Promise.all(
      list.map(async (s) => {
        try {
          return [s, await api.getQuote(s)] as const;
        } catch {
          return null;
        }
      })
    );
    const map: Record<string, Quote> = {};
    for (const entry of entries) {
      if (entry) map[entry[0]] = entry[1];
    }
    setQuotes(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function remove(symbol: string, e: React.MouseEvent) {
    e.stopPropagation();
    await api.removeFromWatchlist(symbol);
    load();
  }

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Watchlist</h2>
      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : symbols.length === 0 ? (
          <div className="empty-state">Your watchlist is empty. Search for a stock above to add one.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Price</th>
                <th className="num">Change</th>
                <th className="num">% Change</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((symbol) => {
                const quote = quotes[symbol];
                return (
                  <tr key={symbol} onClick={() => navigate(`/stock/${symbol}`)}>
                    <td>
                      <strong>{symbol}</strong>
                    </td>
                    <td className="num">{quote ? formatCurrency(quote.price) : '—'}</td>
                    <td className={`num ${quote ? changeClass(quote.change) : ''}`}>
                      {quote ? formatCurrency(quote.change) : '—'}
                    </td>
                    <td className={`num ${quote ? changeClass(quote.changePercent) : ''}`}>
                      {quote ? formatPercent(quote.changePercent) : '—'}
                    </td>
                    <td className="num">
                      <button className="btn btn-secondary" onClick={(e) => remove(symbol, e)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
