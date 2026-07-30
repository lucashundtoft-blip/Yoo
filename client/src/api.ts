export interface SearchResult {
  symbol: string;
  name: string;
}

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  marketOpen: boolean;
  timestamp: number;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ProjectionPoint {
  time: number;
  value: number;
}

export interface Projection {
  trendline: ProjectionPoint[];
  forecast: ProjectionPoint[];
  slopePerDay: number;
  direction: 'up' | 'down' | 'flat';
}

export interface Position {
  symbol: string;
  quantity: number;
  avgCost: number;
  marketPrice: number;
  marketValue: number;
  costBasis: number;
  unrealizedPL: number;
  unrealizedPLPercent: number;
}

export interface Portfolio {
  cash: number;
  positions: Position[];
  holdingsValue: number;
  totalValue: number;
  totalUnrealizedPL: number;
}

export interface Order {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  total: number;
  createdAt: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  search: (q: string) => request<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
  getQuote: (symbol: string) => request<Quote>(`/quote/${encodeURIComponent(symbol)}`),
  getCandles: (symbol: string, resolution: 'D' | '60' | '5' = 'D', days = 180) =>
    request<Candle[]>(`/candles/${encodeURIComponent(symbol)}?resolution=${resolution}&days=${days}`),
  getProjection: (
    symbol: string,
    resolution: 'D' | '60' | '5' = 'D',
    days = 180,
    lookback?: number,
    forecastPeriods?: number
  ) => {
    const params = new URLSearchParams({ resolution, days: String(days) });
    if (lookback) params.set('lookback', String(lookback));
    if (forecastPeriods) params.set('forecastPeriods', String(forecastPeriods));
    return request<Projection>(`/projection/${encodeURIComponent(symbol)}?${params}`);
  },
  getWatchlist: () => request<string[]>('/watchlist'),
  addToWatchlist: (symbol: string) =>
    request<string[]>('/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (symbol: string) =>
    request<string[]>(`/watchlist/${encodeURIComponent(symbol)}`, { method: 'DELETE' }),
  getPortfolio: () => request<Portfolio>('/portfolio'),
  getOrders: () => request<Order[]>('/orders'),
  placeOrder: (symbol: string, side: 'BUY' | 'SELL', quantity: number) =>
    request<Order>('/orders', { method: 'POST', body: JSON.stringify({ symbol, side, quantity }) }),
  resetAccount: () => request<{ ok: boolean }>('/account/reset', { method: 'POST' }),
};
