# YooTrade

Practice trading stocks 24/7 with fake money — Webull-style watchlist, charts,
and order execution, plus a trend-projection overlay on every chart.

## Stack

- **server/** — Express + TypeScript + SQLite (`better-sqlite3`). Single-user
  paper-trading account, starts with $100,000 fake cash.
- **client/** — React + Vite + TypeScript, charts via `lightweight-charts`.

## Market data

By default the app uses a built-in **simulated data provider** — deterministic
per-symbol random walks, so it works fully offline with no API key and never
stops "trading," even when real markets are closed.

To use real prices, get a free API key from [Finnhub](https://finnhub.io/register)
and set it before starting the server:

```bash
export FINNHUB_API_KEY=your_key_here
```

If the key is missing, invalid, rate-limited, or the network is unreachable,
the app automatically falls back to simulated data per-request so it keeps
working either way.

## Trend projection

Charts include an optional overlay: a least-squares trendline fitted over the
recent lookback window (solid blue), extended forward as a dashed forecast
line (orange). This is classic technical-analysis-style extrapolation — "if
the recent trend continues" — not a statistical prediction of price
reversals. Toggle it off from the checkbox above any chart.

## Running locally

```bash
npm install          # installs both workspaces
npm run dev:server   # starts the API on :4000
npm run dev:client   # starts the Vite dev server on :5173 (proxies /api to :4000)
```

Open http://localhost:5173.

## Building for production

```bash
npm run build:server
npm run build:client
```

Serve `client/dist` as static files and run `node server/dist/index.js`
(set `PORT` to override the default `4000`).
