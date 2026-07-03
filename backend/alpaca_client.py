"""Client for Alpaca's Market Data API, via the official `alpaca-py` SDK —
an alternative to scraping Yahoo Finance via yfinance. Used when
APCA_API_KEY_ID / APCA_API_SECRET_KEY are set; screener.py falls back to
yfinance otherwise.

Note: this hits data.alpaca.markets (market data) under the hood, not
paper-api.alpaca.markets (order/account management) — same API keys work
for both, they're just different services. The SDK handles pagination
internally, unlike a hand-rolled requests-based client.
"""
from __future__ import annotations

import os
import re
from datetime import date, timedelta
from typing import Optional

import pandas as pd
from alpaca.data.enums import Adjustment, DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.models import Bar
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

BATCH_SIZE = 50  # symbols per request, keeps individual requests a sane size

_CLASS_SHARE_RE = re.compile(r"^([A-Z]+)-([A-Z])$")


def is_configured() -> bool:
    return bool(os.environ.get("APCA_API_KEY_ID")) and bool(os.environ.get("APCA_API_SECRET_KEY"))


def _client() -> StockHistoricalDataClient:
    return StockHistoricalDataClient(
        api_key=os.environ["APCA_API_KEY_ID"],
        secret_key=os.environ["APCA_API_SECRET_KEY"],
    )


def _to_alpaca_symbol(ticker: str) -> str:
    """Class shares are Yahoo-style "BRK-B" in our ticker universe; Alpaca
    (like most non-Yahoo feeds) expects dot notation, "BRK.B".
    """
    m = _CLASS_SHARE_RE.match(ticker)
    return f"{m.group(1)}.{m.group(2)}" if m else ticker


def _bars_to_frame(bars: list[Bar]) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "Open": [b.open for b in bars],
            "High": [b.high for b in bars],
            "Low": [b.low for b in bars],
            "Close": [b.close for b in bars],
            "Volume": [b.volume for b in bars],
        },
        index=pd.DatetimeIndex([b.timestamp for b in bars], name="t"),
    )


def _fetch_batch(
    client: StockHistoricalDataClient, tickers: list[str], start: date, end: date
) -> dict[str, pd.DataFrame]:
    symbol_map = {_to_alpaca_symbol(t): t for t in tickers}
    request = StockBarsRequest(
        symbol_or_symbols=list(symbol_map.keys()),
        timeframe=TimeFrame.Day,
        start=start,
        end=end,
        adjustment=Adjustment.SPLIT,
        feed=DataFeed.IEX,  # included on Alpaca's free tier
    )
    barset = client.get_stock_bars(request)

    result: dict[str, pd.DataFrame] = {}
    for alpaca_symbol, bars in barset.data.items():
        ticker = symbol_map.get(alpaca_symbol, alpaca_symbol)
        if bars:
            result[ticker] = _bars_to_frame(bars)
    return result


def fetch_history(
    tickers: list[str], years: float = 3, client: Optional[StockHistoricalDataClient] = None
) -> dict[str, pd.DataFrame]:
    """Daily OHLCV bars for each ticker, batched to keep individual requests
    a reasonable size. Returns the same {ticker: DataFrame} shape
    screener.py already expects from the yfinance path.
    """
    if not tickers:
        return {}

    end = date.today()
    start = end - timedelta(days=int(years * 365.25) + 10)
    active_client = client or _client()

    result: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        result.update(_fetch_batch(active_client, batch, start, end))
    return result


def fetch_intraday_bars(
    ticker: str, minutes: int = 45, days: int = 5, client: Optional[StockHistoricalDataClient] = None
) -> pd.DataFrame:
    """Recent intraday bars for a single ticker at a custom minute timeframe
    (e.g. 45-min bars over the last 5 sessions), for finer entry timing on
    a bounce day — separate from the daily history used for MA/bounce
    detection, and not batched/cached since it's fetched on demand per ticker.
    """
    end = date.today() + timedelta(days=1)
    start = end - timedelta(days=days * 3)  # pad for weekends/holidays
    active_client = client or _client()

    request = StockBarsRequest(
        symbol_or_symbols=[_to_alpaca_symbol(ticker)],
        timeframe=TimeFrame(minutes, TimeFrameUnit.Minute),
        start=start,
        end=end,
        adjustment=Adjustment.SPLIT,
        feed=DataFeed.IEX,
    )
    barset = active_client.get_stock_bars(request)
    bars = next(iter(barset.data.values()), [])
    if not bars:
        return pd.DataFrame(columns=["Open", "High", "Low", "Close", "Volume"])

    frame = _bars_to_frame(bars)
    trading_session_minutes = 390  # ~6.5hr US market session
    bars_per_day = trading_session_minutes // minutes + 1
    return frame.tail(days * bars_per_day)
