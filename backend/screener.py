"""Top-down MA20 / MA200 / MA400 bounce screener.

Top-down logic: MA200 vs MA400 (plus price) sets the longer-term trend
bias first; then each moving average is checked individually for a
"bounce" setup — price pulled back into the average and is holding /
reclaiming it while the average itself is still rising.
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass
from typing import Optional

import pandas as pd
import yfinance as yf

from tickers import FALLBACK_TICKERS

MA_PERIODS = (20, 200, 400)
BOUNCE_LOOKBACK_DAYS = 5      # window checked for a recent touch of the MA
BOUNCE_TOUCH_PCT = 0.02       # low must come within 2% of the MA to count as a "touch"
BOUNCE_SLOPE_LOOKBACK = 10    # days used to judge whether the MA itself is rising
HISTORY_PERIOD = "3y"         # needs to comfortably cover MA400 + lookback

_sp500_cache: Optional[list[str]] = None
_sp500_cache_ts: float = 0.0
SP500_CACHE_TTL = 6 * 3600


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


def run_screen(tickers: list[str], only_active: bool = True) -> list[dict]:
    if not tickers:
        return []

    data = yf.download(
        tickers=tickers,
        period=HISTORY_PERIOD,
        interval="1d",
        group_by="ticker",
        threads=True,
        progress=False,
        auto_adjust=False,
    )

    results = []
    single = len(tickers) == 1
    for t in tickers:
        try:
            hist = data if single else data[t]
        except (KeyError, TypeError):
            continue
        res = _compute_result(t, hist)
        if res is None:
            continue
        if only_active and not res.best_setup:
            continue
        results.append(asdict(res))

    results.sort(key=lambda r: (r["best_setup"] is None, r["ticker"]))
    return results


def get_stock_history(ticker: str, period: str = "2y") -> dict:
    hist = yf.Ticker(ticker).history(period=period, interval="1d")
    if hist.empty:
        return {"ticker": ticker, "candles": []}

    full_hist = yf.Ticker(ticker).history(period=HISTORY_PERIOD, interval="1d")
    for p in MA_PERIODS:
        full_hist[f"MA{p}"] = full_hist["Close"].rolling(p).mean()
    trimmed = full_hist.loc[hist.index.min():]

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
