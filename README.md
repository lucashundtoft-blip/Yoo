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
and/or [Financial Modeling Prep](https://financialmodelingprep.com/register)
and set them before starting the server:

```bash
export FINNHUB_API_KEY=your_key_here
export FMP_API_KEY=your_key_here
```

If both are set, Finnhub is tried first and FMP is used as a fallback (useful
since free-tier rate limits differ between the two). If a key is missing,
invalid, rate-limited, or the network is unreachable, the app automatically
falls back to the next provider (and ultimately to simulated data) per-request
so it keeps working either way.

### Futures data

The [Futures Heat Map](client/src/pages/FuturesHeatmapPage.tsx) page is
simulated by default, same as an unrecognized stock ticker. Real futures
contract quotes (CME, etc.) aren't available for free from any provider we
checked -- Alpha Vantage's live spot metals and FMP's commodities/futures
endpoints both require a paid plan. The one real, free-tier source we found
is Alpha Vantage's commodity benchmark data for crude oil, natural gas,
copper, corn, and wheat:

```bash
export ALPHA_VANTAGE_API_KEY=your_key_here
```

With that key set, the `CL`, `NG`, `HG`, `ZC`, and `ZW` tiles use real daily
prices (marked **Real (AV)** on the heat map) instead of simulated data; get
a free key from
[Alpha Vantage](https://www.alphavantage.co/support/#api-key). Note this is
daily benchmark pricing, not a live intraday futures tick feed, and Alpha
Vantage's free tier is rate-limited to ~25 requests/day, so results are
cached for 6 hours per commodity.

### Real intraday futures data (Databento)

For actual CME Globex futures contracts at intraday resolution -- not a
daily benchmark proxy -- the app can use [Databento](https://databento.com)'s
Historical API (pay-as-you-go, no broker account needed; new accounts get a
free credit to start):

```bash
export DATABENTO_API_KEY=your_key_here
```

With that key set, `MCL` (Micro WTI Crude), `MGC` (Micro Gold), and `SIL`
(Micro Silver) on the heat map switch to real continuous-front-month data
(marked **Real (Databento)**), taking priority over the Alpha Vantage proxy
for `MCL` since it's the actual futures contract rather than a spot-price
stand-in. The same feed also backs the [Pattern Alerts](client/src/pages/AlertsPage.tsx)
page's price-vs-PVT divergence watcher for `MCL`, `MGC`, `SIL`, and `MHG`
(Micro Copper) -- without this key, that watcher runs on simulated data and
says so on the page.

This uses Databento's Historical REST API polled on a cache (20s for
1-minute bars, longer for coarser resolutions), not their low-latency Live
streaming gateway, so treat it as "recent" rather than tick-by-tick live.
Because Databento bills by data volume, the cache exists specifically to
keep the app's own polling (an 8s quote refresh on an open stock page, a 15s
bracket-order check, a 60s pattern-alert check) from turning into constant
billed requests.

Metals other than gold/silver and every stock-index future (ES, NQ, RTY,
etc.) have no free or wired-up real data source, so those stay simulated
regardless of which keys are set.

## Connect with Alpaca

The **Settings** page can link your real Alpaca brokerage account via
Alpaca's OAuth2 flow ("Connect with Alpaca"), independent of the paper
trading simulator's own fake cash account. This only stores an access
token for the connected account — it doesn't place real orders anywhere
in the app yet.

To enable it, [register an OAuth app](https://app.alpaca.markets/brokerage/apps)
with Alpaca and set:

```bash
export ALPACA_OAUTH_CLIENT_ID=your_client_id
export ALPACA_OAUTH_CLIENT_SECRET=your_client_secret
export ALPACA_OAUTH_REDIRECT_URI=http://localhost:4000/api/alpaca/oauth/callback
```

The redirect URI must exactly match what's registered with your Alpaca
OAuth app. If you run the client's Vite dev server (`:5173`) separately
from the API (`:4000`), also set `ALPACA_OAUTH_CLIENT_ORIGIN=http://localhost:5173`
so the post-login redirect lands back in the running app instead of the
bare API server; leave it unset for a single-service deploy where both
are served from the same origin.

Two optional overrides, in case Alpaca's endpoints change:

```bash
export ALPACA_OAUTH_AUTHORIZE_URL=https://app.alpaca.markets/oauth/authorize  # default
export ALPACA_OAUTH_TOKEN_URL=https://authx.alpaca.markets/v1/oauth2/token   # default
```

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
