import { Router } from 'express';
import { marketData, type Resolution } from './marketData/index.js';
import { computeProjection } from './projection.js';
import {
  buy,
  sell,
  getCash,
  getPositions,
  getOrders,
  resetAccount,
  createBracket,
  getActiveBrackets,
  cancelBracket,
  TradingError,
} from './trading.js';
import { getWatchlist, addToWatchlist, removeFromWatchlist } from './watchlist.js';
import { getRecentAlerts, WATCHED_SYMBOLS } from './patternWatcher.js';
import {
  buildAuthorizeUrl,
  consumeState,
  exchangeCodeForToken,
  getConnection,
  disconnect as disconnectAlpaca,
  isOAuthConfigured,
  AlpacaOAuthError,
} from './alpacaOAuth.js';
import { FUTURES_CONTRACTS, getContract } from './futuresContracts.js';
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

    const takeProfitPrice = req.body?.takeProfitPrice != null ? Number(req.body.takeProfitPrice) : null;
    const stopLossPrice = req.body?.stopLossPrice != null ? Number(req.body.stopLossPrice) : null;
    const trailingStopPercent = req.body?.trailingStopPercent != null ? Number(req.body.trailingStopPercent) : null;
    if (side === 'BUY' && takeProfitPrice != null && !(takeProfitPrice > 0)) {
      return res.status(400).json({ error: 'takeProfitPrice must be a positive number' });
    }
    if (side === 'BUY' && stopLossPrice != null && !(stopLossPrice > 0)) {
      return res.status(400).json({ error: 'stopLossPrice must be a positive number' });
    }
    if (side === 'BUY' && stopLossPrice != null && trailingStopPercent != null) {
      return res.status(400).json({ error: 'Use either a fixed stop-loss price or a trailing stop percent, not both' });
    }
    if (side === 'BUY' && trailingStopPercent != null && !(trailingStopPercent > 0 && trailingStopPercent < 100)) {
      return res.status(400).json({ error: 'trailingStopPercent must be between 0 and 100' });
    }

    const quote = await marketData.getQuote(symbol);

    if (side === 'BUY' && takeProfitPrice != null && takeProfitPrice <= quote.price) {
      return res.status(400).json({ error: 'takeProfitPrice must be above the current price for a long position' });
    }
    if (side === 'BUY' && stopLossPrice != null && stopLossPrice >= quote.price) {
      return res.status(400).json({ error: 'stopLossPrice must be below the current price for a long position' });
    }

    const order = side === 'BUY' ? buy(symbol, quantity, quote.price) : sell(symbol, quantity, quote.price);

    if (side === 'BUY' && (takeProfitPrice != null || stopLossPrice != null || trailingStopPercent != null)) {
      createBracket(symbol, quantity, quote.price, takeProfitPrice, stopLossPrice, trailingStopPercent);
    }

    res.json(order);
  } catch (err) {
    if (err instanceof TradingError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/brackets', (req, res) => {
  const symbol = req.query.symbol ? String(req.query.symbol) : undefined;
  res.json(getActiveBrackets(symbol));
});

router.delete('/brackets/:id', (req, res, next) => {
  try {
    cancelBracket(Number(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof TradingError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

router.get('/alerts', (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ symbols: WATCHED_SYMBOLS, alerts: getRecentAlerts(limit) });
});

router.post('/account/reset', (_req, res) => {
  resetAccount();
  res.json({ ok: true });
});

router.get('/futures/contracts', (_req, res) => {
  res.json(FUTURES_CONTRACTS);
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
    const trailingStopPercent = req.body?.trailingStopPercent != null ? Number(req.body.trailingStopPercent) : null;
    if (takeProfitPrice != null && !(takeProfitPrice > 0)) {
      return res.status(400).json({ error: 'takeProfitPrice must be a positive number' });
    }
    if (stopLossPrice != null && !(stopLossPrice > 0)) {
      return res.status(400).json({ error: 'stopLossPrice must be a positive number' });
    }
    if (stopLossPrice != null && trailingStopPercent != null) {
      return res.status(400).json({ error: 'Use either a fixed stop-loss price or a trailing stop percent, not both' });
    }
    if (trailingStopPercent != null && !(trailingStopPercent > 0 && trailingStopPercent < 100)) {
      return res.status(400).json({ error: 'trailingStopPercent must be between 0 and 100' });
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

    if (takeProfitPrice != null || stopLossPrice != null || trailingStopPercent != null) {
      createFuturesBracket(symbol, side, quantity, quote.price, takeProfitPrice, stopLossPrice, trailingStopPercent);
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

router.get('/alpaca/status', (_req, res) => {
  const connection = getConnection();
  res.json({
    configured: isOAuthConfigured(),
    connected: Boolean(connection),
    scope: connection?.scope ?? null,
    connectedAt: connection?.connected_at ?? null,
  });
});

router.get('/alpaca/oauth/authorize', (_req, res) => {
  try {
    res.redirect(buildAuthorizeUrl());
  } catch (err) {
    if (err instanceof AlpacaOAuthError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

// In dev, the client runs on its own Vite origin (e.g. http://localhost:5173)
// separate from this API server, so a bare relative redirect would 404 here
// instead of landing in the app. Set ALPACA_OAUTH_CLIENT_ORIGIN in that case;
// in prod (single-service deploy) this is left unset and the relative path
// resolves against this same server, which also serves the built client.
function settingsRedirect(query: Record<string, string>): string {
  const path = `/settings?${new URLSearchParams(query)}`;
  const clientOrigin = process.env.ALPACA_OAUTH_CLIENT_ORIGIN;
  return clientOrigin ? new URL(path, clientOrigin).toString() : path;
}

router.get('/alpaca/oauth/callback', async (req, res) => {
  const state = req.query.state ? String(req.query.state) : undefined;
  const code = req.query.code ? String(req.query.code) : undefined;
  const oauthError = req.query.error ? String(req.query.error) : undefined;

  if (oauthError) {
    return res.redirect(settingsRedirect({ alpaca: 'error', message: oauthError }));
  }
  if (!consumeState(state)) {
    return res.redirect(settingsRedirect({ alpaca: 'error', message: 'Invalid or expired OAuth state' }));
  }
  if (!code) {
    return res.redirect(settingsRedirect({ alpaca: 'error', message: 'Missing authorization code' }));
  }

  try {
    await exchangeCodeForToken(code);
    res.redirect(settingsRedirect({ alpaca: 'connected' }));
  } catch (err) {
    const message = err instanceof AlpacaOAuthError ? err.message : 'Token exchange failed';
    res.redirect(settingsRedirect({ alpaca: 'error', message }));
  }
});

router.post('/alpaca/disconnect', (_req, res) => {
  disconnectAlpaca();
  res.json({ ok: true });
});
