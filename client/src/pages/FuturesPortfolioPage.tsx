import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type FuturesAccount } from '../api';
import { formatCurrency, changeClass, formatSigned } from '../format';
import { FuturesSubNav } from '../components/FuturesSubNav';

export function FuturesPortfolioPage() {
  const [account, setAccount] = useState<FuturesAccount | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const navigate = useNavigate();

  async function load() {
    setAccount(await api.getFuturesAccount());
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function handleReset() {
    await api.resetFuturesAccount();
    setConfirmingReset(false);
    load();
  }

  return (
    <div>
      <FuturesSubNav />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Futures Positions</h2>
        {confirmingReset ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-dim)', alignSelf: 'center' }}>
              Reset to $50,000 paper cash and clear all futures positions/orders?
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

      {!account ? (
        <div className="empty-state">Loading...</div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="stat-row">
              <div className="stat">
                <span className="label">Equity</span>
                <span className="value">{formatCurrency(account.equity)}</span>
              </div>
              <div className="stat">
                <span className="label">Cash</span>
                <span className="value">{formatCurrency(account.cash)}</span>
              </div>
              <div className="stat">
                <span className="label">Used Margin</span>
                <span className="value">{formatCurrency(account.usedMargin)}</span>
              </div>
              <div className="stat">
                <span className="label">Available Margin</span>
                <span className="value">{formatCurrency(account.availableMargin)}</span>
              </div>
              <div className="stat">
                <span className="label">Unrealized P&amp;L</span>
                <span className={`value ${changeClass(account.totalUnrealizedPl)}`}>
                  {formatSigned(account.totalUnrealizedPl)}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            {account.positions.length === 0 ? (
              <div className="empty-state">No open futures positions. Head to a contract on the heat map to trade.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Side</th>
                    <th className="num">Qty</th>
                    <th className="num">Avg Price</th>
                    <th className="num">Market Price</th>
                    <th className="num">Unrealized P&amp;L</th>
                  </tr>
                </thead>
                <tbody>
                  {account.positions.map((p) => (
                    <tr key={p.symbol} onClick={() => navigate(`/futures/${p.symbol}`)}>
                      <td>
                        <strong>{p.symbol}</strong>
                        <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{p.contractName}</div>
                      </td>
                      <td className={p.quantity > 0 ? 'up' : 'down'}>{p.quantity > 0 ? 'Long' : 'Short'}</td>
                      <td className="num">{Math.abs(p.quantity)}</td>
                      <td className="num">{formatCurrency(p.avgPrice)}</td>
                      <td className="num">{formatCurrency(p.marketPrice)}</td>
                      <td className={`num ${changeClass(p.unrealizedPl)}`}>{formatSigned(p.unrealizedPl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}
