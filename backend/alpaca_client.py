"""Thin client for Alpaca's Market Data API — an alternative to scraping
Yahoo Finance via yfinance. Used when APCA_API_KEY_ID / APCA_API_SECRET_KEY
are set; screener.py falls back to yfinance otherwise.

Note: this hits data.alpaca.markets (market data), not
paper-api.alpaca.markets (order/account management) — same API keys work
for both, they're just different services.
"""
from __future__ import annotations

import os
import re
from datetime import date, timedelta

import pandas as pd
import requests

DATA_BASE_URL = "https://data.alpaca.markets/v2/stocks/bars"
BATCH_SIZE = 50          # symbols per request
PAGE_LIMIT = 10000       # max bars per page, per Alpaca's API
REQUEST_TIMEOUT = 30

_CLASS_SHARE_RE = re.compile(r"^([A-Z]+)-([A-Z])$")


def is_configured() -> bool:
    return bool(os.environ.get("APCA_API_KEY_ID")) and bool(os.environ.get("APCA_API_SECRET_KEY"))


def _headers() -> dict[str, str]:
    return {
        "APCA-API-KEY-ID": os.environ["APCA_API_KEY_ID"],
        "APCA-API-SECRET-KEY": os.environ["APCA_API_SECRET_KEY"],
    }


def _to_alpaca_symbol(ticker: str) -> str:
    """Class shares are Yahoo-style "BRK-B" in our ticker universe; Alpaca
    (like most non-Yahoo feeds) expects dot notation, "BRK.B".
    """
    m = _CLASS_SHARE_RE.match(ticker)
    return f"{m.group(1)}.{m.group(2)}" if m else ticker


def _bars_to_frame(rows: list[dict]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    df["t"] = pd.to_datetime(df["t"])
    df = df.set_index("t").rename(
        columns={"o": "Open", "h": "High", "l": "Low", "c": "Close", "v": "Volume"}
    )
    return df[["Open", "High", "Low", "Close", "Volume"]]


def _fetch_batch(tickers: list[str], start: str, end: str) -> dict[str, pd.DataFrame]:
    symbol_map = {_to_alpaca_symbol(t): t for t in tickers}
    raw_bars: dict[str, list[dict]] = {}

    params = {
        "symbols": ",".join(symbol_map.keys()),
        "timeframe": "1Day",
        "start": start,
        "end": end,
        "limit": PAGE_LIMIT,
        "adjustment": "split",
        "feed": "iex",  # included on Alpaca's free tier
    }
    page_token = None
    while True:
        if page_token:
            params["page_token"] = page_token
        resp = requests.get(DATA_BASE_URL, headers=_headers(), params=params, timeout=REQUEST_TIMEOUT)
        resp.raise_for_status()
        payload = resp.json()
        for symbol, rows in (payload.get("bars") or {}).items():
            raw_bars.setdefault(symbol, []).extend(rows)
        page_token = payload.get("next_page_token")
        if not page_token:
            break

    result: dict[str, pd.DataFrame] = {}
    for alpaca_symbol, rows in raw_bars.items():
        ticker = symbol_map.get(alpaca_symbol, alpaca_symbol)
        if rows:
            result[ticker] = _bars_to_frame(rows)
    return result


def fetch_history(tickers: list[str], years: float = 3) -> dict[str, pd.DataFrame]:
    """Daily OHLCV bars for each ticker, batched to stay within Alpaca's
    per-request symbol limits. Returns the same {ticker: DataFrame} shape
    screener.py already expects from the yfinance path.
    """
    if not tickers:
        return {}

    end = date.today()
    start = end - timedelta(days=int(years * 365.25) + 10)
    result: dict[str, pd.DataFrame] = {}
    for i in range(0, len(tickers), BATCH_SIZE):
        batch = tickers[i : i + BATCH_SIZE]
        result.update(_fetch_batch(batch, start.isoformat(), end.isoformat()))
    return result
