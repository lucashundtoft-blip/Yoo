export interface BounceSignal {
  ma_period: 20 | 200 | 400;
  ma_value: number;
  distance_pct: number;
  touched_recently: boolean;
  ma_rising: boolean;
  status: 'confirmed_bounce' | 'testing' | 'none';
}

export type TrendBias = 'bullish' | 'bearish' | 'mixed' | 'unknown';

export interface ScreenResult {
  ticker: string;
  price: number;
  change_pct: number;
  volume: number;
  trend_bias: TrendBias;
  ma20: number | null;
  ma200: number | null;
  ma400: number | null;
  signals: BounceSignal[];
  best_setup: string | null;
}

export interface Candle {
  date: string;
  close: number | null;
  ma20: number | null;
  ma200: number | null;
  ma400: number | null;
}

export interface StockHistoryResponse {
  ticker: string;
  candles: Candle[];
}

export type VoiceAction =
  | { type: 'set_universe'; universe: 'sp500' | 'watchlist' }
  | { type: 'set_watchlist'; tickers: string }
  | { type: 'set_trend_filter'; value: string }
  | { type: 'set_ma_filter'; value: string }
  | { type: 'set_only_active'; enabled: boolean }
  | { type: 'select_ticker'; ticker: string }
  | { type: 'run_screen' };

export interface VoiceQueryResponse {
  reply: string;
  actions: VoiceAction[];
}

export interface VoiceFilters {
  universe: 'sp500' | 'watchlist';
  watchlist: string;
  trend_filter: string;
  ma_filter: string;
  only_active: boolean;
}
