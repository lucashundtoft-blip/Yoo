import { useEffect, useState } from 'react';
import { api, type Order } from '../api';
import { formatCurrency } from '../format';

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getOrders()
      .then(setOrders)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h2 style={{ marginBottom: 16 }}>Order History</h2>
      <div className="card">
        {loading ? (
          <div className="empty-state">Loading...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">No orders yet. Head to a stock page and place your first trade.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Symbol</th>
                <th>Side</th>
                <th className="num">Quantity</th>
                <th className="num">Price</th>
                <th className="num">Total</th>
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
                  <td className="num">{formatCurrency(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
