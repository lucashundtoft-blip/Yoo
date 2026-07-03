# Stock Screener — MA Bounce Setups

A top-down technical screener: classifies each stock's trend bias from
MA200 vs MA400, then flags **MA20 / MA200 / MA400 bounce setups** — price
pulling back into a rising moving average and holding/reclaiming it.

Real daily OHLCV data comes from Yahoo Finance via [`yfinance`](https://pypi.org/project/yfinance/)
(no API key needed). The S&P 500 ticker list is pulled live from Wikipedia,
with a hardcoded large-cap fallback if that fetch fails.

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

Runs the API at `http://localhost:8000`. Quick check: `curl http://localhost:8000/api/health`.

Optional: run the synthetic logic tests (no network required) with
`python3 test_screener.py` and `python3 test_voice.py`.

To enable the voice assistant, copy `backend/.env.example` to `backend/.env`
and set your own `ANTHROPIC_API_KEY` (from https://console.anthropic.com/),
then restart uvicorn. Without a key, the rest of the app works normally —
the mic button just shows "not configured".

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

- `GET /api/health` — liveness check
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

- First S&P 500 scan takes ~30-60s (500 tickers × 3y daily history via `yfinance`);
  repeat scans within 15 minutes are much faster thanks to the history cache.
- Yahoo's free data is typically delayed, not real-time — fine for end-of-day
  screening, not for intraday execution.
- Natural extensions: persist scan results to disk/DB (cache survives restarts),
  add volume/RSI confirmation, email/Slack alerts when a new confirmed bounce
  appears, backtest the setup against historical forward returns.
