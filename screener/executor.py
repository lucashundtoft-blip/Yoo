"""Executor: runs the coil screener against the S&P 500 and reports matches.

Usage:
    python executor.py
    python executor.py --tolerance 0.02 --period 1y --out matches.csv
    python executor.py --tickers my_watchlist.txt
"""

import argparse
import sys
from datetime import datetime

import pandas as pd
import yfinance as yf

from screener import check_coil

SP500_LIST_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"


def get_sp500_tickers() -> list[str]:
    tables = pd.read_html(SP500_LIST_URL)
    tickers = tables[0]["Symbol"].tolist()
    return [t.replace(".", "-") for t in tickers]  # yfinance format, e.g. BRK.B -> BRK-B


def load_tickers_from_file(path: str) -> list[str]:
    with open(path) as f:
        return [line.strip().upper() for line in f if line.strip()]


def fetch_history(tickers: list[str], period: str) -> dict[str, pd.DataFrame]:
    data = yf.download(
        tickers,
        period=period,
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=True,
    )

    per_ticker = {}
    for ticker in tickers:
        try:
            df = data[ticker].dropna(how="all")
        except KeyError:
            continue
        if not df.empty:
            per_ticker[ticker] = df
    return per_ticker


def run(tickers: list[str], period: str, tolerance: float, volume_tolerance: float, lookback: int) -> pd.DataFrame:
    print(f"Fetching {len(tickers)} tickers ({period} of daily history)...")
    histories = fetch_history(tickers, period)

    rows = []
    for ticker, df in histories.items():
        match = check_coil(
            df,
            tightness_tolerance=tolerance,
            volume_tolerance=volume_tolerance,
            trend_lookback=lookback,
        )
        if match:
            rows.append({"ticker": ticker, **match})

    results = pd.DataFrame(rows)
    if not results.empty:
        results = results.sort_values("spread_pct")
    return results


def main():
    parser = argparse.ArgumentParser(description="Scan for coiled uptrend stocks.")
    parser.add_argument("--tickers", help="Path to a file with one ticker per line. Defaults to the S&P 500.")
    parser.add_argument("--period", default="9mo", help="yfinance history period (default: 9mo)")
    parser.add_argument("--tolerance", type=float, default=0.03, help="Max MA spread as a fraction of price (default: 0.03)")
    parser.add_argument("--volume-tolerance", type=float, default=0.03, help="Max deviation of volume from its 20-day average, as a fraction (default: 0.03)")
    parser.add_argument("--lookback", type=int, default=10, help="Days used to confirm the slow MA is rising (default: 10)")
    parser.add_argument("--out", help="Optional CSV path to save matches to")
    args = parser.parse_args()

    tickers = load_tickers_from_file(args.tickers) if args.tickers else get_sp500_tickers()

    results = run(tickers, args.period, args.tolerance, args.volume_tolerance, args.lookback)

    if results.empty:
        print("No coiled uptrend matches found.")
        return

    print(f"\n{len(results)} match(es):\n")
    print(results.to_string(index=False))

    out_path = args.out or f"coil_matches_{datetime.now():%Y%m%d_%H%M%S}.csv"
    results.to_csv(out_path, index=False)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
