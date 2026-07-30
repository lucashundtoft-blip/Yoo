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

## Indicators

- **Simple Moving Average (SMA)** — toggle a 20- or 50-period SMA line on any
  chart (computed client-side from the loaded candles).
- **RSI (14)** — Wilder-smoothed Relative Strength Index in its own pane below
  the price chart, with overbought (70) / oversold (30) reference lines. Its
  time scale stays synced with the main chart when you zoom or pan.
- **Trend projection** — a least-squares trendline fitted over the recent
  lookback window (solid blue), extended forward as a dashed forecast line
  (orange). This is classic technical-analysis-style extrapolation — "if the
  recent trend continues" — not a statistical prediction of price reversals.

All indicators are toggled from checkboxes above the chart.

## Market Replay

The **Replay** page (or the ▶ Replay button on any stock page) plays back
historical candles bar-by-bar so you can practice trading past price action
as if it were live — Webull/TradingView bar-replay style. Play/pause, step,
scrub, and speed controls (1x–10x); each session gets its own fresh $100,000
practice account with a live P&L scoreboard and trade log, kept separate
from your main paper portfolio. Indicators and the trend projection are
computed only from candles revealed so far — no peeking at the future.

## Running locally

```bash
npm install          # installs both workspaces
npm run dev:server   # starts the API on :4000
npm run dev:client   # starts the Vite dev server on :5173 (proxies /api to :4000)
```

Open http://localhost:5173.

## Building for production

```bash
npm run build   # builds server + client
npm start       # serves everything (API + web app) from one process
```

In production the Express server also serves the built client, so a single
process on one port runs the whole app (set `PORT` to override the default
`4000`).

## Deploying to Render (free hosting)

The repo includes a `render.yaml` blueprint. To get a public URL:

1. Go to [render.com](https://render.com) and sign up (choose **Sign in with
   GitHub**).
2. Click **New +** → **Blueprint**, and select the `Yoo` repository.
3. Click **Deploy** — Render builds and starts the app automatically, and
   gives you a URL like `https://yootrade.onrender.com` that works from any
   phone or computer.

Notes for the free tier: the app sleeps after ~15 minutes of inactivity (the
first visit after that takes up to a minute to wake), and the SQLite database
is reset whenever the service restarts or redeploys — fine for practice, but
don't expect your paper portfolio to last forever.
