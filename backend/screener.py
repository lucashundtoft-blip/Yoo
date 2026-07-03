"""Top-down MA20 / MA200 / MA400 bounce screener.

Top-down logic: MA200 vs MA400 (plus price) sets the longer-term trend
bias first; then each moving average is checked individually for a
"bounce" setup — price pulled back into the average and is holding /
reclaiming it while the average itself is still rising.

All three MAs (20/200/400) are plain simple moving averages (SMA) —
an unweighted rolling mean of daily closes (`Series.rolling(p).mean()`),
not an EMA or any other weighted variant.
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Iterator, Optional

import pandas as pd
import yfinance as yf

import alpaca_client
from tickers import FALLBACK_TICKERS

MA_PERIODS = (20, 200, 400)
BOUNCE_LOOKBACK_DAYS = 5      # window checked for a recent touch of the MA
BOUNCE_TOUCH_PCT = 0.02       # low must come within 2% of the MA to count as a "touch"
BOUNCE_SLOPE_LOOKBACK = 10    # days used to judge whether the MA itself is rising
HISTORY_PERIOD = "3y"         # needs to comfortably cover MA400 + lookback
SCREEN_BATCH_SIZE = 25        # tickers per yfinance batch download / progress tick

_sp500_cache: Optional[list[str]] = None
_sp500_cache_ts: float = 0.0
SP500_CACHE_TTL = 6 * 3600

# Per-ticker OHLCV history cache. Yahoo's free data is end-of-day-ish
# anyway (delayed intraday), so a short TTL avoids re-downloading the same
# ~750 rows/ticker on every scan without going noticeably stale.
_history_cache: dict[str, tuple[float, pd.DataFrame]] = {}
HISTORY_CACHE_TTL = 15 * 60


def get_sp500_tickers() -> list[str]:
    """Live S&P 500 constituents from Wikipedia, cached in-process.
    Falls back to a hardcoded liquid large-cap list if the fetch fails.
    """
    global _sp500_cache, _sp500_cache_ts
    now = time.time()
    if _sp500_cache and now - _sp500_cache_ts < SP500_CACHE_TTL:
        return _sp500_cache
    try:
        tables = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")
        symbols = tables[0]["Symbol"].tolist()
        tickers = [str(s).strip().replace(".", "-") for s in symbols]
        _sp500_cache, _sp500_cache_ts = tickers, now
        return tickers
    except Exception:
        return FALLBACK_TICKERS


@dataclass
class BounceSignal:
    ma_period: int
    ma_value: float
    distance_pct: float   # (price - ma) / ma * 100; positive = price above the MA
    touched_recently: bool
    ma_rising: bool
    status: str            # "confirmed_bounce" | "testing" | "none"


@dataclass
class ScreenResult:
    ticker: str
    price: float
    change_pct: float
    volume: int
    trend_bias: str        # "bullish" | "bearish" | "mixed" | "unknown"
    ma20: Optional[float]
    ma200: Optional[float]
    ma400: Optional[float]
    signals: list
    best_setup: Optional[str]


def _compute_result(ticker: str, hist: pd.DataFrame) -> Optional[ScreenResult]:
    if hist is None or hist.empty:
        return None
    hist = hist.dropna(subset=["Close"]).copy()
    if len(hist) < 30:
        return None

    for p in MA_PERIODS:
        hist[f"MA{p}"] = hist["Close"].rolling(p).mean()

    last = hist.iloc[-1]
    price = float(last["Close"])
    prev_close = float(hist.iloc[-2]["Close"]) if len(hist) > 1 else price
    change_pct = (price - prev_close) / prev_close * 100 if prev_close else 0.0
    volume = int(last["Volume"]) if not pd.isna(last["Volume"]) else 0

    ma_values = {}
    for p in MA_PERIODS:
        v = last[f"MA{p}"]
        ma_values[p] = None if pd.isna(v) else float(v)

    ma200, ma400 = ma_values[200], ma_values[400]
    if ma200 is not None and ma400 is not None:
        if price > ma200 > ma400:
            trend_bias = "bullish"
        elif price < ma200 < ma400:
            trend_bias = "bearish"
        else:
            trend_bias = "mixed"
    else:
        trend_bias = "unknown"

    signals: list[BounceSignal] = []
    for p in MA_PERIODS:
        ma_val = ma_values[p]
        if ma_val is None:
            continue

        recent = hist.iloc[-BOUNCE_LOOKBACK_DAYS:]
        recent_low = float(recent["Low"].min())
        touched = recent_low <= ma_val * (1 + BOUNCE_TOUCH_PCT)

        ma_series = hist[f"MA{p}"].dropna()
        ma_rising = (
            len(ma_series) > BOUNCE_SLOPE_LOOKBACK
            and ma_series.iloc[-1] > ma_series.iloc[-BOUNCE_SLOPE_LOOKBACK]
        )

        distance_pct = (price - ma_val) / ma_val * 100

        if touched and price > ma_val and ma_rising:
            status = "confirmed_bounce"
        elif touched and abs(distance_pct) <= BOUNCE_TOUCH_PCT * 100 and ma_rising:
            status = "testing"
        else:
            status = "none"

        signals.append(BounceSignal(p, ma_val, distance_pct, touched, ma_rising, status))

    active = [s for s in signals if s.status != "none"]
    best_setup = None
    if active:
        active.sort(key=lambda s: (s.status != "confirmed_bounce", -s.ma_period))
        best_setup = f"MA{active[0].ma_period} {active[0].status}"

    return ScreenResult(
        ticker=ticker,
        price=price,
        change_pct=change_pct,
        volume=volume,
        trend_bias=trend_bias,
        ma20=ma_values[20],
        ma200=ma_values[200],
        ma400=ma_values[400],
        signals=[asdict(s) for s in signals],
        best_setup=best_setup,
    )


def data_source() -> str:
    return "alpaca" if alpaca_client.is_configured() else "yfinance"


def _fetch_from_yfinance(tickers: list[str]) -> dict[str, pd.DataFrame]:
    data = yf.download(
        tickers=tickers,
        period=HISTORY_PERIOD,
        interval="1d",
        group_by="ticker",
        threads=True,
        progress=False,
        auto_adjust=False,
    )
    result: dict[str, pd.DataFrame] = {}
    single = len(tickers) == 1
    for t in tickers:
        try:
            hist = data if single else data[t]
        except (KeyError, TypeError):
            continue
        result[t] = hist
    return result


def _fetch_history_batch(tickers: list[str]) -> dict[str, pd.DataFrame]:
    """Download OHLCV history for a batch of tickers, reusing cached data
    that's still within HISTORY_CACHE_TTL instead of re-fetching it. Uses
    Alpaca's Market Data API when APCA_API_KEY_ID/SECRET are configured,
    otherwise falls back to yfinance.
    """
    now = time.time()
    result: dict[str, pd.DataFrame] = {}
    to_fetch = []
    for t in tickers:
        cached = _history_cache.get(t)
        if cached and now - cached[0] < HISTORY_CACHE_TTL:
            result[t] = cached[1]
        else:
            to_fetch.append(t)

    if to_fetch:
        if alpaca_client.is_configured():
            try:
                fetched = alpaca_client.fetch_history(to_fetch, years=int(HISTORY_PERIOD.rstrip("y")))
            except Exception as e:
                # Unlike yfinance (which swallows per-ticker failures internally),
                # requests raises on auth/network errors — don't let a bad Alpaca
                # key or a dropped connection take down the whole scan.
                print(f"Alpaca fetch failed for batch {to_fetch}: {e}")
                fetched = {}
        else:
            fetched = _fetch_from_yfinance(to_fetch)
        for t, hist in fetched.items():
            _history_cache[t] = (now, hist)
            result[t] = hist

    return result


def run_screen_progress(tickers: list[str]) -> Iterator[dict]:
    """Screen tickers in batches, yielding progress events as it goes and a
    final `{"type": "done", ...}` event with every computed result (active
    setup or not — the caller/UI decides what to filter and display).
    """
    total = len(tickers)
    yield {"type": "progress", "processed": 0, "total": total}
    if total == 0:
        yield {"type": "done", "count": 0, "results": []}
        return

    results: list[dict] = []
    processed = 0
    for i in range(0, total, SCREEN_BATCH_SIZE):
        batch = tickers[i : i + SCREEN_BATCH_SIZE]
        hist_map = _fetch_history_batch(batch)
        for t in batch:
            res = _compute_result(t, hist_map.get(t))
            if res is not None:
                results.append(asdict(res))
        processed += len(batch)
        yield {"type": "progress", "processed": min(processed, total), "total": total}

    results.sort(key=lambda r: (r["best_setup"] is None, r["ticker"]))
    yield {"type": "done", "count": len(results), "results": results}


def run_screen(tickers: list[str]) -> list[dict]:
    """Non-streaming convenience wrapper around run_screen_progress."""
    for event in run_screen_progress(tickers):
        if event["type"] == "done":
            return event["results"]
    return []


def get_stock_history(ticker: str, display_days: int = 500) -> dict:
    """Full HISTORY_PERIOD is fetched (and cached) so MA400 has enough
    lookback, but only the most recent `display_days` rows are returned
    for charting.
    """
    hist_map = _fetch_history_batch([ticker])
    full_hist = hist_map.get(ticker)
    if full_hist is None or full_hist.empty:
        return {"ticker": ticker, "candles": []}
    full_hist = full_hist.copy()

    for p in MA_PERIODS:
        full_hist[f"MA{p}"] = full_hist["Close"].rolling(p).mean()

    trimmed = full_hist.tail(display_days)

    candles = []
    for idx, row in trimmed.iterrows():
        candles.append({
            "date": idx.strftime("%Y-%m-%d"),
            "close": None if pd.isna(row["Close"]) else float(row["Close"]),
            "ma20": None if pd.isna(row.get("MA20")) else float(row["MA20"]),
            "ma200": None if pd.isna(row.get("MA200")) else float(row["MA200"]),
            "ma400": None if pd.isna(row.get("MA400")) else float(row["MA400"]),
        })
    return {"ticker": ticker, "candles": candles}
