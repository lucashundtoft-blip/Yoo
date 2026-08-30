"""Momentum screener: finds actively-traded stocks under a price ceiling that
are up the most today.

This is a different kind of scan from the coil screener in executor.py: it
looks at *today's* movers rather than a historical chart pattern, which makes
it useful for finding "flying" low-priced stocks -- but also means matches
here are exactly the volatile, often-illiquid names that can reverse hard.
The market cap / volume floors below are there to cut the worst of that risk,
not to eliminate it.

Requires FMP_API_KEY (a free key from https://financialmodelingprep.com/register).
Batch quotes need a paid FMP plan, so this fetches one quote per candidate --
keep --limit modest (default 100) to stay within the free tier's daily
request cap.

Usage:
    python momentum_screener.py
    python momentum_screener.py --price-max 6 --min-volume 500000 --top 10
    python momentum_screener.py --min-market-cap 50000000 --out movers.csv
"""

import argparse
from datetime import datetime

import pandas as pd
import requests

from executor import FMP_SCREENER_URL, get_fmp_api_key

FMP_QUOTE_URL = "https://financialmodelingprep.com/stable/quote"


def get_fmp_candidates(
    price_max: float,
    min_volume: int,
    min_market_cap: float,
    limit: int,
) -> list[str]:
    """Pull actively-traded US common stock under price_max with a liquidity
    and market-cap floor, to keep the scan away from total shell/halt risk."""
    api_key = get_fmp_api_key("momentum")
    params = {
        "priceLowerThan": price_max,
        "marketCapMoreThan": min_market_cap,
        "volumeMoreThan": min_volume,
        "isActivelyTrading": "true",
        "exchange": "NASDAQ,NYSE,AMEX",
        "limit": limit,
        "apikey": api_key,
    }
    res = requests.get(FMP_SCREENER_URL, params=params)
    res.raise_for_status()
    rows = res.json()
    return [row["symbol"] for row in rows if row.get("symbol")]


def get_quotes(symbols: list[str]) -> pd.DataFrame:
    """Fetch today's quote (price, % change, volume) for each symbol.

    One request per symbol, since batch quotes need a paid FMP plan.
    """
    api_key = get_fmp_api_key("momentum")
    rows = []
    for symbol in symbols:
        res = requests.get(FMP_QUOTE_URL, params={"symbol": symbol, "apikey": api_key})
        res.raise_for_status()
        data = res.json()
        if data:
            rows.append(data[0])
    return pd.DataFrame(rows)


def run(price_max: float, min_volume: int, min_market_cap: float, limit: int, top: int) -> pd.DataFrame:
    print(f"Screening for symbols under ${price_max} (min volume {min_volume:,}, min market cap ${min_market_cap:,.0f})...")
    candidates = get_fmp_candidates(price_max, min_volume, min_market_cap, limit)
    if not candidates:
        return pd.DataFrame()

    print(f"Fetching quotes for {len(candidates)} candidates...")
    quotes = get_quotes(candidates)
    if quotes.empty:
        return quotes

    keep_cols = [c for c in ["symbol", "name", "price", "changePercentage", "change", "volume", "marketCap"] if c in quotes.columns]
    quotes = quotes[keep_cols]
    quotes = quotes[quotes["price"] <= price_max]
    quotes = quotes.sort_values("changePercentage", ascending=False)
    return quotes.head(top)


def main():
    parser = argparse.ArgumentParser(description="Find today's biggest movers under a price ceiling.")
    parser.add_argument("--price-max", type=float, default=10.0, help="Max share price (default: 10)")
    parser.add_argument("--min-volume", type=int, default=200_000, help="Min today's volume, filters out illiquid names (default: 200000)")
    parser.add_argument("--min-market-cap", type=float, default=20_000_000, help="Min market cap in dollars, filters out shells (default: 20000000)")
    parser.add_argument("--limit", type=int, default=100, help="Max candidates to pull from the screener before ranking -- each costs one extra API request, so keep this modest on a free FMP plan (default: 100)")
    parser.add_argument("--top", type=int, default=20, help="How many top movers to show (default: 20)")
    parser.add_argument("--out", help="Optional CSV path to save results to")
    args = parser.parse_args()

    results = run(args.price_max, args.min_volume, args.min_market_cap, args.limit, args.top)

    if results.empty:
        print("No matches found.")
        return

    print(f"\nTop {len(results)} mover(s) under ${args.price_max}:\n")
    print(results.to_string(index=False))

    out_path = args.out or f"momentum_matches_{datetime.now():%Y%m%d_%H%M%S}.csv"
    results.to_csv(out_path, index=False)
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
