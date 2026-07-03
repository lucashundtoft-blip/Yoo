import type { ScreenResponse, StockHistoryResponse } from './types';

const BASE = '/api';

export async function fetchScreen(opts: {
  universe: 'sp500' | 'watchlist';
  watchlist?: string;
  onlyActive: boolean;
}): Promise<ScreenResponse> {
  const params = new URLSearchParams({
    universe: opts.universe,
    only_active: String(opts.onlyActive),
  });
  if (opts.universe === 'watchlist') {
    params.set('watchlist', opts.watchlist ?? '');
  }
  const res = await fetch(`${BASE}/screen?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Screen request failed (${res.status})`);
  }
  return res.json();
}

export async function fetchStockHistory(ticker: string): Promise<StockHistoryResponse> {
  const res = await fetch(`${BASE}/stock/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    throw new Error(`Failed to load history for ${ticker} (${res.status})`);
  }
  return res.json();
}
