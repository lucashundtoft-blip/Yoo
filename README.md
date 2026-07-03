# Stock Screener — MA Bounce Setups

A top-down technical screener: classifies each stock's trend bias from
MA200 vs MA400, then flags **MA20 / MA200 / MA400 bounce setups** — price
pulling back into a rising moving average and holding/reclaiming it.

Real daily OHLCV data comes from Yahoo Finance via [`yfinance`](https://pypi.org/project/yfinance/)
by default (no API key needed), or from
[Alpaca's Market Data API](https://alpaca.markets/) if you configure keys —
see **Data source** below. The S&P 500 ticker list is pulled live from
Wikipedia, with a hardcoded large-cap fallback if that fetch fails.

## How a "bounce" is defined

All three are plain **simple moving averages (SMA)** — an unweighted
rolling mean of daily closes — not EMA or any other weighted variant.

For each moving average (20/200/400 day):

- **touched_recently** — the low over the last 5 sessions came within 2% of the MA
- **ma_rising** — the MA itself is higher now than 10 sessions ago
- **confirmed_bounce** — touched, MA rising, and price has closed back above it
- **testing** — touched, MA rising, price currently sitting within 2% of the MA (not yet reclaimed)

Trend bias (top-down context): **bullish** if price > MA200 > MA400, **bearish**
if price < MA200 < MA400, otherwise **mixed**.

This is a heuristic starting point, not financial advice — tune the
constants in `backend/screener.py` (`BOUNCE_TOUCH_PCT`, lookback windows) to
match how you actually trade this setup.

## Project layout

```
backend/    FastAPI service: fetches data, computes MAs, detects setups
frontend/   React + Vite + Tailwind screener UI
```

## Running locally

You need real internet access to reach Yahoo Finance — this won't return
data from a network-restricted sandbox.

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Runs the API at `http://localhost:8000`. Quick check:
`curl http://localhost:8000/api/health` — the response includes
`"data_source"` so you can confirm whether it's using yfinance or Alpaca.

Optional: run the synthetic logic tests (no network required) with
`python3 test_screener.py`, `python3 test_voice.py`, and
`python3 test_alpaca_client.py`.

Copy `backend/.env.example` to `backend/.env` to configure either/both of:
- `ANTHROPIC_API_KEY` for the voice assistant (see **Voice control** below)
- `APCA_API_KEY_ID` + `APCA_API_SECRET_KEY` for Alpaca market data (see
  **Data source** below)

Both are optional — the app works fully without either, just with voice
disabled and/or yfinance as the data source.

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:5173` and proxies `/api` requests to the backend
on port 8000 (see `frontend/vite.config.ts`).

## API

- `GET /api/health` — liveness check, includes `"data_source": "yfinance"|"alpaca"`
- `GET /api/tickers?universe=sp500|fallback` — ticker universe used
- `GET /api/screen?universe=sp500|watchlist&watchlist=AAPL,MSFT` — run the screener, returns all results (client filters "only active")
- `GET /api/screen/stream?universe=sp500|watchlist&watchlist=AAPL,MSFT` — same screen as Server-Sent Events, emitting `{"type":"progress","processed":N,"total":M}` as each batch of tickers finishes and a final `{"type":"done","results":[...]}`. The UI uses this for the live progress bar.
- `GET /api/stock/{ticker}` — daily closes + MA20/200/400 for charting
- `GET /api/voice/status` — `{"configured": bool}`, whether `ANTHROPIC_API_KEY` is set
- `POST /api/voice/query` — `{query, filters, results}` → `{reply, actions}` (see Voice control below)

## Voice control

Tap the mic and talk instead of clicking through filters — e.g. "switch to
my watchlist and run it", "only show bullish setups", "pull up Nvidia's
chart", "how many are testing their 200 day average". Speech-to-text and
text-to-speech run entirely in the browser (Web Speech API — Chrome/Edge
only, no key needed); the transcript is sent to the backend, which asks
Claude (`claude-haiku-4-5-20251001`, via the Anthropic API) to produce a
short spoken reply plus a list of UI actions (`set_universe`,
`set_watchlist`, `set_trend_filter`, `set_ma_filter`, `set_only_active`,
`select_ticker`, `run_screen`). The model only ever sees the filters and
currently-loaded results already on screen — it can't see or invent prices
you haven't scanned for, and every action is validated server-side before
being applied.

Requires an `ANTHROPIC_API_KEY` in `backend/.env` (see above). Without one,
the app works fully — voice is the only thing disabled.

## Data source

By default the backend pulls history via `yfinance`, which scrapes Yahoo
Finance's public endpoints — free and keyless, but unofficial and can be
fragile (rate limits, layout changes).

Setting both `APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` in `backend/.env`
switches it to [Alpaca's Market Data API](https://alpaca.markets/) instead
— a proper, supported API. Paper trading keys work fine (data access is the
same as live keys); grab them from
https://app.alpaca.markets/paper/dashboard/overview → "Generate New Keys".
Note that's a different URL from the one used to actually fetch data
(`data.alpaca.markets`) — the paper-trading dashboard is just where you
create the keys.

The free tier uses the IEX feed (`feed=iex` in `backend/alpaca_client.py`),
a real but partial slice of the market (not full SIP consolidated tape) —
plenty for EOD daily-bar screening. If an Alpaca request fails (bad key,
rate limit, network issue), that batch of tickers just comes back empty
instead of taking down the whole scan — check the backend's console output
for the logged error. There's no automatic fallback from Alpaca to yfinance
mid-run; if Alpaca is configured, it's used for everything.

Class-share tickers are translated automatically (`BRK-B` → `BRK.B`, Alpaca's
convention) since the app's ticker universe otherwise uses Yahoo-style
dashes.

## Caching & progress

- Downloaded OHLCV history is cached in-process per ticker for 15 minutes
  (`HISTORY_CACHE_TTL` in `backend/screener.py`). Re-running a scan, switching
  filters, or opening a stock's chart within that window reuses the cached
  data instead of re-hitting Yahoo Finance — repeat scans typically drop from
  tens of seconds to well under a second.
- The cache is in-memory and per-process, so it resets when the backend
  restarts, and only helps within a single running instance.
- The full-universe scan is processed in batches of `SCREEN_BATCH_SIZE` (25)
  tickers, streaming a progress event after each batch so the UI can show
  "N / total tickers" and a progress bar instead of one long opaque wait.

## Notes / next steps

- First S&P 500 scan takes ~30-60s over `yfinance` (500 tickers × 3y daily
  history); Alpaca is noticeably faster since it's a real batched API rather
  than per-ticker scraping. Repeat scans within 15 minutes are much faster
  either way thanks to the history cache.
- Both data sources are end-of-day-ish, not real-time — fine for daily
  screening, not for intraday execution.
- Natural extensions: persist scan results to disk/DB (cache survives restarts),
  add volume/RSI confirmation, email/Slack alerts when a new confirmed bounce
  appears, backtest the setup against historical forward returns.
