import { Router } from 'express';
import { marketData, type Resolution } from './marketData/index.js';
import { computeProjection } from './projection.js';
import { buy, sell, getCash, getPositions, getOrders, resetAccount, TradingError } from './trading.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from './watchlist.js';
import { recordChallengeRun, listChallengeRuns, getChallengeStats } from './challenges.js';

export const router = Router();

function parseResolution(value: unknown): Resolution {
  if (value === '5' || value === '60' || value === 'D') return value;
  return 'D';
}

router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q ?? '');
    const results = await marketData.search(q);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/quote/:symbol', async (req, res, next) => {
  try {
    const quote = await marketData.getQuote(req.params.symbol);
    res.json(quote);
  } catch (err) {
    next(err);
  }
});

router.get('/candles/:symbol', async (req, res, next) => {
  try {
    const resolution = parseResolution(req.query.resolution);
    const days = Math.min(Number(req.query.days) || 180, 730);
    const candles = await marketData.getCandles(req.params.symbol, resolution, days);
    res.json(candles);
  } catch (err) {
    next(err);
  }
});

router.get('/projection/:symbol', async (req, res, next) => {
  try {
    const resolution = parseResolution(req.query.resolution);
    const days = Math.min(Number(req.query.days) || 180, 730);
    const candles = await marketData.getCandles(req.params.symbol, resolution, days);
    const lookback = req.query.lookback ? Number(req.query.lookback) : undefined;
    const forecastPeriods = req.query.forecastPeriods ? Number(req.query.forecastPeriods) : undefined;
    const projection = computeProjection(candles, { lookback, forecastPeriods });
    res.json(projection);
  } catch (err) {
    next(err);
  }
});

router.get('/watchlist', (_req, res) => {
  res.json(getWatchlist());
});

router.post('/watchlist', (req, res) => {
  const symbol = String(req.body?.symbol ?? '').trim();
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  addToWatchlist(symbol);
  res.json(getWatchlist());
});

router.delete('/watchlist/:symbol', (req, res) => {
  removeFromWatchlist(req.params.symbol);
  res.json(getWatchlist());
});

router.get('/portfolio', async (_req, res, next) => {
  try {
    const cash = getCash();
    const positions = getPositions();
    const quotes = await Promise.all(
      positions.map((p) => marketData.getQuote(p.symbol).catch(() => null))
    );
    const enriched = positions.map((p, i) => {
      const quote = quotes[i];
      const marketPrice = quote?.price ?? p.avgCost;
      const marketValue = marketPrice * p.quantity;
      const costBasis = p.avgCost * p.quantity;
      return {
        ...p,
        marketPrice,
        marketValue,
        costBasis,
        unrealizedPL: marketValue - costBasis,
        unrealizedPLPercent: costBasis ? ((marketValue - costBasis) / costBasis) * 100 : 0,
      };
    });
    const holdingsValue = enriched.reduce((sum, p) => sum + p.marketValue, 0);
    const totalCostBasis = enriched.reduce((sum, p) => sum + p.costBasis, 0);
    res.json({
      cash,
      positions: enriched,
      holdingsValue,
      totalValue: cash + holdingsValue,
      totalUnrealizedPL: holdingsValue - totalCostBasis,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/orders', (_req, res) => {
  res.json(getOrders());
});

router.post('/orders', async (req, res, next) => {
  try {
    const symbol = String(req.body?.symbol ?? '').trim();
    const side = String(req.body?.side ?? '').toUpperCase();
    const quantity = Number(req.body?.quantity);
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    if (side !== 'BUY' && side !== 'SELL') return res.status(400).json({ error: 'side must be BUY or SELL' });
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive number' });
    }
    const quote = await marketData.getQuote(symbol);
    const order = side === 'BUY' ? buy(symbol, quantity, quote.price) : sell(symbol, quantity, quote.price);
    res.json(order);
  } catch (err) {
    if (err instanceof TradingError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/account/reset', (_req, res) => {
  resetAccount();
  res.json({ ok: true });
});

router.get('/challenges', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json({ runs: listChallengeRuns(limit), stats: getChallengeStats() });
});

router.post('/challenges', (req, res) => {
  const symbol = String(req.body?.symbol ?? '').trim();
  const datasetLabel = String(req.body?.datasetLabel ?? '').trim();
  const bars = Number(req.body?.bars);
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  if (!datasetLabel) return res.status(400).json({ error: 'datasetLabel is required' });
  if (!Number.isFinite(bars) || bars <= 0) return res.status(400).json({ error: 'bars must be a positive number' });
  const run = recordChallengeRun({
    symbol,
    datasetLabel,
    bars,
    yourReturnPct: Number(req.body?.yourReturnPct) || 0,
    buyHoldReturnPct: Number(req.body?.buyHoldReturnPct) || 0,
    alphaPct: Number(req.body?.alphaPct) || 0,
    tradeCount: Number(req.body?.tradeCount) || 0,
    score: Math.round(Number(req.body?.score) || 0),
  });
  res.json(run);
});
