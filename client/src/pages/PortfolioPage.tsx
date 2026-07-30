import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Portfolio } from '../api';
import { formatCurrency, formatPercent, changeClass, formatSigned } from '../format';

export function PortfolioPage() {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setPortfolio(await api.getPortfolio());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function handleReset() {
    await api.resetAccount();
    setConfirmingReset(false);
    load();
  }

  if (!portfolio) return <div className="empty-state">Loading...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Portfolio</h2>
        {confirmingReset ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-dim)', alignSelf: 'center' }}>
              Reset to $100,000 paper cash and clear all positions/orders?
            </span>
            <button className="btn btn-sell" onClick={handleReset}>
              Confirm Reset
            </button>
            <button className="btn btn-secondary" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button className="btn btn-secondary" onClick={() => setConfirmingReset(true)}>
            Reset Account
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="stat-row">
          <div className="stat">
            <span className="label">Total Value</span>
            <span className="value">{formatCurrency(portfolio.totalValue)}</span>
          </div>
          <div className="stat">
            <span className="label">Cash</span>
            <span className="value">{formatCurrency(portfolio.cash)}</span>
          </div>
          <div className="stat">
            <span className="label">Holdings Value</span>
            <span className="value">{formatCurrency(portfolio.holdingsValue)}</span>
          </div>
          <div className="stat">
            <span className="label">Unrealized P&amp;L</span>
            <span className={`value ${changeClass(portfolio.totalUnrealizedPL)}`}>
              {formatSigned(portfolio.totalUnrealizedPL)}
            </span>
          </div>
        </div>
      </div>

      <div className="card">
        {portfolio.positions.length === 0 ? (
          <div className="empty-state">No open positions. Buy a stock to get started.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Symbol</th>
                <th className="num">Qty</th>
                <th className="num">Avg Cost</th>
                <th className="num">Market Price</th>
                <th className="num">Market Value</th>
                <th className="num">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.positions.map((p) => (
                <tr key={p.symbol} onClick={() => navigate(`/stock/${p.symbol}`)}>
                  <td>
                    <strong>{p.symbol}</strong>
                  </td>
                  <td className="num">{p.quantity}</td>
                  <td className="num">{formatCurrency(p.avgCost)}</td>
                  <td className="num">{formatCurrency(p.marketPrice)}</td>
                  <td className="num">{formatCurrency(p.marketValue)}</td>
                  <td className={`num ${changeClass(p.unrealizedPL)}`}>
                    {formatSigned(p.unrealizedPL)} ({formatPercent(p.unrealizedPLPercent)})
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
