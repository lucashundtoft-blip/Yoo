export interface FuturesContract {
  symbol: string;
  name: string;
  group: string;
  /** Smallest price increment. */
  tickSize: number;
  /** Dollar value of one tick move, for one contract. */
  tickValue: number;
  /** Dollar value per full point of price move, for one contract
   *  (tickValue / tickSize) -- stored directly to avoid float division
   *  drift, since P&L = priceChange * multiplier. */
  multiplier: number;
  /** Approximate day-trading margin per contract. These are illustrative,
   *  broker- and date-dependent figures for practice purposes -- not a
   *  quote of any real broker's current margin requirement. */
  approxMargin: number;
}

// Tick size/value/multiplier are official CME contract specs (stable).
// approxMargin figures are rough, illustrative day-trading margins meant to
// teach realistic position sizing -- real margins vary by broker and change
// with volatility, so don't treat these as current or authoritative.
export const FUTURES_CONTRACTS: FuturesContract[] = [
  { symbol: 'ES', name: 'E-mini S&P 500', group: 'Indices', tickSize: 0.25, tickValue: 12.5, multiplier: 50, approxMargin: 13000 },
  { symbol: 'MES', name: 'Micro E-mini S&P 500', group: 'Indices', tickSize: 0.25, tickValue: 1.25, multiplier: 5, approxMargin: 1300 },
  { symbol: 'NQ', name: 'E-mini Nasdaq 100', group: 'Indices', tickSize: 0.25, tickValue: 5, multiplier: 20, approxMargin: 18000 },
  { symbol: 'MNQ', name: 'Micro E-mini Nasdaq 100', group: 'Indices', tickSize: 0.25, tickValue: 0.5, multiplier: 2, approxMargin: 1800 },
  { symbol: 'YM', name: 'E-mini Dow', group: 'Indices', tickSize: 1, tickValue: 5, multiplier: 5, approxMargin: 8800 },
  { symbol: 'RTY', name: 'E-mini Russell 2000', group: 'Indices', tickSize: 0.1, tickValue: 5, multiplier: 50, approxMargin: 6500 },
  { symbol: 'CL', name: 'Crude Oil', group: 'Energy', tickSize: 0.01, tickValue: 10, multiplier: 1000, approxMargin: 6500 },
  { symbol: 'MCL', name: 'Micro WTI Crude Oil', group: 'Energy', tickSize: 0.01, tickValue: 1, multiplier: 100, approxMargin: 650 },
  { symbol: 'NG', name: 'Natural Gas', group: 'Energy', tickSize: 0.001, tickValue: 10, multiplier: 10000, approxMargin: 3500 },
  { symbol: 'RB', name: 'RBOB Gasoline', group: 'Energy', tickSize: 0.0001, tickValue: 4.2, multiplier: 42000, approxMargin: 6000 },
  { symbol: 'GC', name: 'Gold', group: 'Metals', tickSize: 0.1, tickValue: 10, multiplier: 100, approxMargin: 11000 },
  { symbol: 'MGC', name: 'Micro Gold', group: 'Metals', tickSize: 0.1, tickValue: 1, multiplier: 10, approxMargin: 1100 },
  { symbol: 'SI', name: 'Silver', group: 'Metals', tickSize: 0.005, tickValue: 25, multiplier: 5000, approxMargin: 14000 },
  { symbol: 'SIL', name: 'Micro Silver', group: 'Metals', tickSize: 0.005, tickValue: 5, multiplier: 1000, approxMargin: 2800 },
  { symbol: 'HG', name: 'Copper', group: 'Metals', tickSize: 0.0005, tickValue: 12.5, multiplier: 25000, approxMargin: 6500 },
  { symbol: 'MHG', name: 'Micro Copper', group: 'Metals', tickSize: 0.0005, tickValue: 1.25, multiplier: 2500, approxMargin: 650 },
  { symbol: 'ZB', name: '30-Year T-Bond', group: 'Rates', tickSize: 1 / 32, tickValue: 31.25, multiplier: 1000, approxMargin: 4500 },
  { symbol: 'ZN', name: '10-Year T-Note', group: 'Rates', tickSize: 1 / 64, tickValue: 15.625, multiplier: 1000, approxMargin: 2200 },
  { symbol: 'ZC', name: 'Corn', group: 'Agriculture', tickSize: 0.0025, tickValue: 12.5, multiplier: 5000, approxMargin: 2000 },
  { symbol: 'ZS', name: 'Soybeans', group: 'Agriculture', tickSize: 0.0025, tickValue: 12.5, multiplier: 5000, approxMargin: 3800 },
  { symbol: 'ZW', name: 'Wheat', group: 'Agriculture', tickSize: 0.0025, tickValue: 12.5, multiplier: 5000, approxMargin: 3200 },
  { symbol: '6E', name: 'Euro FX', group: 'Currencies', tickSize: 0.00005, tickValue: 6.25, multiplier: 125000, approxMargin: 2900 },
  { symbol: '6J', name: 'Japanese Yen', group: 'Currencies', tickSize: 0.0000005, tickValue: 6.25, multiplier: 12500000, approxMargin: 3800 },
  { symbol: '6B', name: 'British Pound', group: 'Currencies', tickSize: 0.0001, tickValue: 6.25, multiplier: 62500, approxMargin: 2000 },
];

const BY_SYMBOL = new Map(FUTURES_CONTRACTS.map((c) => [c.symbol, c]));

export function getContract(symbol: string): FuturesContract | undefined {
  return BY_SYMBOL.get(symbol.toUpperCase());
}
