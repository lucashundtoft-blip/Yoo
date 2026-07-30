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
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Resolution = '5' | '60' | 'D';

export interface MarketDataProvider {
  readonly name: string;
  search(query: string): Promise<SearchResult[]>;
  getQuote(symbol: string): Promise<Quote>;
  getCandles(symbol: string, resolution: Resolution, days: number): Promise<Candle[]>;
}
