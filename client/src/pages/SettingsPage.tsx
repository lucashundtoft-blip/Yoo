import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type AlpacaStatus } from '../api';

export function SettingsPage() {
  const [status, setStatus] = useState<AlpacaStatus | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  async function load() {
    setStatus(await api.getAlpacaStatus());
  }

  useEffect(() => {
    load();
  }, []);

  const alpacaParam = searchParams.get('alpaca');
  const errorMessage = searchParams.get('message');

  useEffect(() => {
    if (alpacaParam) {
      load();
      const next = new URLSearchParams(searchParams);
      next.delete('alpaca');
      next.delete('message');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alpacaParam]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      await api.disconnectAlpaca();
      await load();
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div>
      <h2 style={{ margin: '0 0 16px' }}>Settings</h2>

      {alpacaParam === 'connected' && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#3fb950', color: '#3fb950' }}>
          Connected to your Alpaca account.
        </div>
      )}
      {alpacaParam === 'error' && (
        <div className="card" style={{ marginBottom: 16, borderColor: '#f85149', color: '#f85149' }}>
          Couldn't connect to Alpaca{errorMessage ? `: ${errorMessage}` : '.'}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Alpaca brokerage account</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>
              {status == null
                ? 'Loading...'
                : !status.configured
                  ? 'Not configured on this server. Set ALPACA_OAUTH_CLIENT_ID, ALPACA_OAUTH_CLIENT_SECRET, and ALPACA_OAUTH_REDIRECT_URI.'
                  : status.connected
                    ? `Connected since ${new Date(status.connectedAt!).toLocaleString()}${status.scope ? ` — scope: ${status.scope}` : ''}`
                    : 'Not connected. Link your real Alpaca account to enable live brokerage access.'}
            </div>
          </div>
          {status?.configured && (
            status.connected ? (
              <button className="btn btn-secondary" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <a className="btn btn-buy" href="/api/alpaca/oauth/authorize" style={{ textDecoration: 'none' }}>
                Connect with Alpaca
              </a>
            )
          )}
        </div>
      </div>
    </div>
  );
}
