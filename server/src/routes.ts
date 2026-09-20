import { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { marketData, type Resolution } from './marketData/index.js';
import { computeProjection } from './projection.js';
import { listDatasets, loadCandleFile } from './marketData/csvDataEngine.js';
import { getRecentAlerts, WATCHED_SYMBOLS } from './patternWatcher.js';
import { FUTURES_CONTRACTS, getContract } from './futuresContracts.js';
import { getFuturesStats } from './futuresStats.js';
import {
  buyFutures,
  sellFutures,
  getFuturesOrders,
  getFuturesPositions,
  getFuturesAccountSummary,
  resetFuturesAccount,
  createFuturesBracket,
  getActiveFuturesBrackets,
  cancelFuturesBracket,
  FuturesTradingError,
} from './futuresTrading.js';

export const router = Router();

function parseResolution(value: unknown): Resolution {
  if (value === '5' || value === '60' || value === 'D') return value;
  return 'D';
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_DATA_DIR = path.join(__dirname, '..', 'data', 'replay');
// Bare file name only -- blocks "../" and absolute paths from escaping REPLAY_DATA_DIR.
const SAFE_FILENAME = /^[A-Za-z0-9._-]+$/;

router.get('/replay/datasets', async (_req, res, next) => {
  try {
    res.json(await listDatasets(REPLAY_DATA_DIR));
  } catch (err) {
    next(err);
  }
});

router.get('/replay/datasets/:file', async (req, res, next) => {
  try {
    const { file } = req.params;
    if (!SAFE_FILENAME.test(file)) return res.status(400).json({ error: 'Invalid file name' });
    const candles = await loadCandleFile(path.join(REPLAY_DATA_DIR, file));
    res.json(candles);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return res.status(404).json({ error: 'Dataset not found' });
    }
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

router.get('/alerts', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ symbols: WATCHED_SYMBOLS, alerts: getRecentAlerts(limit) });
});

router.get('/futures/contracts', (_req, res) => {
  res.json(FUTURES_CONTRACTS);
});

router.get('/futures/stats', async (_req, res, next) => {
  try {
    res.json(await getFuturesStats());
  } catch (err) {
    next(err);
  }
});

router.get('/futures/account', async (_req, res, next) => {
  try {
    const summary = getFuturesAccountSummary();
    const positions = getFuturesPositions();
    const quotes = await Promise.all(
      positions.map((p) => marketData.getQuote(p.symbol).catch(() => null))
    );
    const enriched = positions.map((p, i) => {
      const contract = getContract(p.symbol);
      const quote = quotes[i];
      const marketPrice = quote?.price ?? p.avgPrice;
      const multiplier = contract?.multiplier ?? 0;
      const unrealizedPl = (marketPrice - p.avgPrice) * multiplier * p.quantity;
      return { ...p, marketPrice, unrealizedPl, contractName: contract?.name ?? p.symbol };
    });
    const totalUnrealizedPl = enriched.reduce((sum, p) => sum + p.unrealizedPl, 0);
    res.json({
      ...summary,
      equity: summary.cash + totalUnrealizedPl,
      totalUnrealizedPl,
      positions: enriched,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/futures/orders', (_req, res) => {
  res.json(getFuturesOrders());
});

router.post('/futures/orders', async (req, res, next) => {
  try {
    const symbol = String(req.body?.symbol ?? '').trim();
    const side = String(req.body?.side ?? '').toUpperCase();
    const quantity = Number(req.body?.quantity);
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });
    if (!getContract(symbol)) return res.status(400).json({ error: `${symbol} isn't a tradeable futures contract` });
    if (side !== 'BUY' && side !== 'SELL') return res.status(400).json({ error: 'side must be BUY or SELL' });
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ error: 'quantity must be a positive whole number of contracts' });
    }

    const takeProfitPrice = req.body?.takeProfitPrice != null ? Number(req.body.takeProfitPrice) : null;
    const stopLossPrice = req.body?.stopLossPrice != null ? Number(req.body.stopLossPrice) : null;
    if (takeProfitPrice != null && !(takeProfitPrice > 0)) {
      return res.status(400).json({ error: 'takeProfitPrice must be a positive number' });
    }
    if (stopLossPrice != null && !(stopLossPrice > 0)) {
      return res.status(400).json({ error: 'stopLossPrice must be a positive number' });
    }

    const quote = await marketData.getQuote(symbol);

    // A BUY opens/adds to a long: take-profit sits above, stop-loss below.
    // A SELL opens/adds to a short: the mirror image.
    if (side === 'BUY' && takeProfitPrice != null && takeProfitPrice <= quote.price) {
      return res.status(400).json({ error: 'takeProfitPrice must be above the current price for a long position' });
    }
    if (side === 'BUY' && stopLossPrice != null && stopLossPrice >= quote.price) {
      return res.status(400).json({ error: 'stopLossPrice must be below the current price for a long position' });
    }
    if (side === 'SELL' && takeProfitPrice != null && takeProfitPrice >= quote.price) {
      return res.status(400).json({ error: 'takeProfitPrice must be below the current price for a short position' });
    }
    if (side === 'SELL' && stopLossPrice != null && stopLossPrice <= quote.price) {
      return res.status(400).json({ error: 'stopLossPrice must be above the current price for a short position' });
    }

    const order = side === 'BUY' ? buyFutures(symbol, quantity, quote.price) : sellFutures(symbol, quantity, quote.price);

    if (takeProfitPrice != null || stopLossPrice != null) {
      createFuturesBracket(symbol, side, quantity, takeProfitPrice, stopLossPrice);
    }

    res.json(order);
  } catch (err) {
    if (err instanceof FuturesTradingError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/futures/brackets', (req, res) => {
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  res.json(getActiveFuturesBrackets(symbol));
});

router.delete('/futures/brackets/:id', (req, res, next) => {
  try {
    cancelFuturesBracket(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof FuturesTradingError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.post('/futures/account/reset', (_req, res) => {
  resetFuturesAccount();
  res.json({ ok: true });
});
