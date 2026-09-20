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

export interface FuturesContract {
  symbol: string;
  name: string;
  group: string;
  tickSize: number;
  tickValue: number;
  multiplier: number;
  approxMargin: number;
}

export interface FuturesStat {
  symbol: string;
  name: string;
  group: string;
  tickSize: number;
  tickValue: number;
  multiplier: number;
  approxMargin: number;
  atrPoints: number | null;
  atrDollars: number | null;
  atrTicks: number | null;
  atrPercentOfMargin: number | null;
  lastPrice: number | null;
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

export interface ReplayDataset {
  file: string;
  symbol: string;
  extension: 'csv' | 'json' | 'jsonl';
  rowCount: number;
  sizeBytes: number;
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
  getHealth: () =>
    request<{
      ok: boolean;
      dataProvider: string;
      hasCommodityData: boolean;
      hasFuturesData: boolean;
      hasYahooFuturesData: boolean;
    }>('/health'),
  getAlerts: (limit = 50) => request<AlertsResponse>(`/alerts?limit=${limit}`),
  getFuturesContracts: () => request<FuturesContract[]>('/futures/contracts'),
  getFuturesStats: () => request<FuturesStat[]>('/futures/stats'),
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
  getReplayDatasets: () => request<ReplayDataset[]>('/replay/datasets'),
  getReplayDatasetCandles: (file: string) => request<Candle[]>(`/replay/datasets/${encodeURIComponent(file)}`),
};
