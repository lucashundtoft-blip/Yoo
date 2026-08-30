import { useEffect, useState } from 'react';
import { api, type FuturesOrder } from '../api';
import { formatCurrency, formatSigned, changeClass } from '../format';
import { FuturesSubNav } from '../components/FuturesSubNav';

export function FuturesOrdersPage() {
  const [orders, setOrders] = useState<FuturesOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getFuturesOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <FuturesSubNav />
      <h2 style={{ marginBottom: 16 }}>Futures Order History</h2>
      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">No futures orders yet. Head to a contract on the heat map to trade.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="num">Quantity</th>
                <th className="num">Price</th>
                <th className="num">Realized P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{new Date(o.createdAt).toLocaleString()}</td>
                  <td>
                    <strong>{o.symbol}</strong>
                  </td>
                  <td className={o.side === 'BUY' ? 'up' : 'down'}>{o.side}</td>
                  <td className="num">{o.quantity}</td>
                  <td className="num">{formatCurrency(o.price)}</td>
                  <td className={`num ${o.realizedPl !== 0 ? changeClass(o.realizedPl) : ''}`}>
                    {o.realizedPl !== 0 ? formatSigned(o.realizedPl) : '—'}
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
