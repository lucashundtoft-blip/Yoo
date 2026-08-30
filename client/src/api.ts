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

export interface PatternAlert {
  id: number;
  symbol: string;
  kind: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE';
  price: number;
  priceChangePercent: number;
  createdAt: string;
}

export interface AlertsResponse {
  symbols: string[];
  alerts: PatternAlert[];
}

export interface BracketOrder {
  id: number;
  symbol: string;
  quantity: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED';
  createdAt: string;
  filledAt: string | null;
  filledPrice: number | null;
  filledLeg: 'TP' | 'SL' | null;
}

export interface FuturesContract {
  symbol: string;
  name: string;
  group: string;
  tickSize: number;
  tickValue: number;
  multiplier: number;
  approxMargin: number;
}

export interface FuturesPosition {
  symbol: string;
  quantity: number; // signed: positive = long, negative = short
  avgPrice: number;
  marketPrice: number;
  unrealizedPl: number;
  contractName: string;
}

export interface FuturesAccount {
  cash: number;
  usedMargin: number;
  availableMargin: number;
  equity: number;
  totalUnrealizedPl: number;
  positions: FuturesPosition[];
}

export interface FuturesOrder {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  realizedPl: number;
  createdAt: string;
}

export interface FuturesBracketOrder {
  id: number;
  symbol: string;
  side: 'BUY' | 'SELL'; // side of the entry: BUY=long, SELL=short
  quantity: number;
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  status: 'ACTIVE' | 'FILLED' | 'CANCELLED';
  createdAt: string;
  filledAt: string | null;
  filledPrice: number | null;
  filledLeg: 'TP' | 'SL' | null;
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
  placeOrder: (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    takeProfitPrice?: number | null,
    stopLossPrice?: number | null
  ) =>
    request<Order>('/orders', {
      method: 'POST',
      body: JSON.stringify({ symbol, side, quantity, takeProfitPrice, stopLossPrice }),
    }),
  getBrackets: (symbol?: string) =>
    request<BracketOrder[]>(`/brackets${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`),
  cancelBracket: (id: number) => request<{ ok: boolean }>(`/brackets/${id}`, { method: 'DELETE' }),
  resetAccount: () => request<{ ok: boolean }>('/account/reset', { method: 'POST' }),
  getHealth: () =>
    request<{ ok: boolean; dataProvider: string; hasCommodityData: boolean; hasFuturesData: boolean }>(
      '/health'
    ),
  getAlerts: (limit = 50) => request<AlertsResponse>(`/alerts?limit=${limit}`),
  getFuturesContracts: () => request<FuturesContract[]>('/futures/contracts'),
  getFuturesAccount: () => request<FuturesAccount>('/futures/account'),
  getFuturesOrders: () => request<FuturesOrder[]>('/futures/orders'),
  placeFuturesOrder: (
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    takeProfitPrice?: number | null,
    stopLossPrice?: number | null
  ) =>
    request<FuturesOrder>('/futures/orders', {
      method: 'POST',
      body: JSON.stringify({ symbol, side, quantity, takeProfitPrice, stopLossPrice }),
    }),
  getFuturesBrackets: (symbol?: string) =>
    request<FuturesBracketOrder[]>(`/futures/brackets${symbol ? `?symbol=${encodeURIComponent(symbol)}` : ''}`),
  cancelFuturesBracket: (id: number) => request<{ ok: boolean }>(`/futures/brackets/${id}`, { method: 'DELETE' }),
  resetFuturesAccount: () => request<{ ok: boolean }>('/futures/account/reset', { method: 'POST' }),
};
