# Stock Screener — MA Bounce Setups

A top-down technical screener: classifies each stock's trend bias from
MA200 vs MA400, then flags **MA20 / MA200 / MA400 bounce setups** — price
pulling back into a rising moving average and holding/reclaiming it.

Real daily OHLCV data comes from Yahoo Finance via [`yfinance`](https://pypi.org/project/yfinance/)
(no API key needed). The S&P 500 ticker list is pulled live from Wikipedia,
with a hardcoded large-cap fallback if that fetch fails.

## How a "bounce" is defined

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
`python3 test_screener.py`.

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
- `GET /api/screen?universe=sp500|watchlist&watchlist=AAPL,MSFT&only_active=true` — run the screener
- `GET /api/stock/{ticker}` — daily closes + MA20/200/400 for charting

## Notes / next steps

- First S&P 500 scan takes ~30-60s (500 tickers × 3y daily history via `yfinance`).
- Yahoo's free data is typically delayed, not real-time — fine for end-of-day
  screening, not for intraday execution.
- Natural extensions: persist scan results, add volume/RSI confirmation,
  email/Slack alerts when a new confirmed bounce appears, backtest the setup
  against historical forward returns.
