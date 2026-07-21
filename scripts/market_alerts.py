"""Console market-data scanner: checks a watchlist against Yahoo Finance and
prints an alert line for each ticker that crosses a configured price
threshold or moves more than a configured percentage on the day.

Watchlist format (watchlist.json), all fields optional per ticker:
    {
      "AAPL": {"above": 200, "below": 150, "pct_move": 3.0}
    }

- "above"/"below": absolute price thresholds.
- "pct_move": alert if abs(day change %) exceeds this.

Run on a schedule (e.g. cron) to get periodic alerts; this script itself
just does one pass and prints to stdout.

Usage:
    python -m scripts.market_alerts
    python -m scripts.market_alerts --watchlist my_watchlist.json
"""
import argparse
import json
import sys
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip install -r requirements.txt")
    raise SystemExit(1)

BASE_DIR = Path(__file__).resolve().parent.parent


def load_watchlist(path: Path) -> dict:
    with open(path) as f:
        return json.load(f)


def check_ticker(symbol: str, rules: dict) -> list[str]:
    ticker = yf.Ticker(symbol)
    info = ticker.fast_info

    price = info.get("last_price") if hasattr(info, "get") else info["last_price"]
    prev_close = info.get("previous_close") if hasattr(info, "get") else info["previous_close"]

    alerts = []

    above = rules.get("above")
    if above is not None and price > above:
        alerts.append(f"{symbol}: price {price:.2f} > above-threshold {above}")

    below = rules.get("below")
    if below is not None and price < below:
        alerts.append(f"{symbol}: price {price:.2f} < below-threshold {below}")

    pct_move = rules.get("pct_move")
    if pct_move is not None and prev_close:
        change_pct = (price - prev_close) / prev_close * 100
        if abs(change_pct) >= pct_move:
            direction = "up" if change_pct > 0 else "down"
            alerts.append(
                f"{symbol}: moved {change_pct:+.2f}% ({direction}) today, "
                f"threshold {pct_move}%"
            )

    return alerts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--watchlist", default="watchlist.json")
    args = parser.parse_args()

    watchlist_path = (BASE_DIR / args.watchlist).resolve()
    if not watchlist_path.is_file():
        print(f"Watchlist not found: {watchlist_path}")
        raise SystemExit(1)

    watchlist = load_watchlist(watchlist_path)
    if not watchlist:
        print("Watchlist is empty.")
        return

    any_alerts = False
    for symbol, rules in watchlist.items():
        try:
            alerts = check_ticker(symbol, rules)
        except Exception as e:
            print(f"{symbol}: failed to fetch ({e})")
            continue

        for alert in alerts:
            any_alerts = True
            print(f"ALERT: {alert}")

    if not any_alerts:
        print("No alerts triggered.")


if __name__ == "__main__":
    main()
