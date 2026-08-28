import { useEffect, useState } from 'react';
import { api, type PatternAlert } from '../api';
import { formatCurrency, formatPercent } from '../format';

const KIND_LABEL: Record<PatternAlert['kind'], string> = {
  BULLISH_DIVERGENCE: 'Bullish divergence',
  BEARISH_DIVERGENCE: 'Bearish divergence',
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<PatternAlert[]>([]);
  const [symbols, setSymbols] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const res = await api.getAlerts();
    setAlerts(res.alerts);
    setSymbols(res.symbols);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: 4 }}>Pattern Alerts</h2>
      <div style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 16, maxWidth: 640 }}>
        Watching {symbols.join(', ') || '—'} for price-vs-PVT divergence, checked every minute. This
        runs on simulated placeholder data — no free real-time futures feed exists for these symbols
        yet — so treat alerts as a demo of the detection logic, not a real trading signal, until a live
        feed is wired in.
      </div>
      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : alerts.length === 0 ? (
          <div className="empty-state">No divergence patterns detected yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Symbol</th>
                <th>Pattern</th>
                <th className="num">Price</th>
                <th className="num">Move</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.createdAt).toLocaleString()}</td>
                  <td>
                    <strong>{a.symbol}</strong>
                  </td>
                  <td className={a.kind === 'BULLISH_DIVERGENCE' ? 'up' : 'down'}>{KIND_LABEL[a.kind]}</td>
                  <td className="num">{formatCurrency(a.price)}</td>
                  <td className={`num ${a.priceChangePercent > 0 ? 'up' : 'down'}`}>
                    {formatPercent(a.priceChangePercent)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
