#!/usr/bin/env python3
"""
20/200-MA proximity alert for futures.

Watches one or more futures symbols (MYM, MES, MNQ, ...) and fires an
alert whenever price is "hanging around" its 20-period MA or its
200-period MA -- close enough, for long enough, to look like a
potential entry, rather than a single tick that happened to touch the
line. Only these two MAs are checked -- nothing else.

Every poll cycle, all symbols' latest prices are fetched concurrently
with a ThreadPoolExecutor (this is I/O-bound -- network calls -- so
threads, not processes, same as the concurrency demo this was built
from), instead of fetching one symbol at a time.

This does NOT ship with a broker connection. You said you're already
pulling data in Python -- plug that into fetch_latest_price() (and,
optionally, fetch_recent_closes() to seed both MAs instantly on
startup instead of waiting 200 polls to build history) and this
handles the rest: moving average math for both periods, the "hanging
around" logic, cooldown so you don't get spammed, and the alert itself.
"""

import concurrent.futures
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Deque, Dict, Optional

# ---------------------------------------------------------------------------
# Config -- tune these to taste
# ---------------------------------------------------------------------------

SYMBOLS = ["MYM", "MES", "MNQ", "M2K", "MGC", "SIL"]

MA_PERIODS = (20, 200)   # the only two moving averages checked
PROXIMITY_PCT = 0.0015   # 0.15% -- how close to an MA counts as "hanging around"
MIN_BARS_NEAR = 3        # must stay within that band this many polls in a row
POLL_SECONDS = 15        # how often to check price
COOLDOWN_SECONDS = 300   # don't re-alert the same symbol/MA within this window


# ---------------------------------------------------------------------------
# Data source -- REPLACE THESE TWO FUNCTIONS with your real feed.
# Whatever you're already using in Python to pull Webull quotes/bars goes
# here; everything below just calls these two functions.
# ---------------------------------------------------------------------------

def fetch_latest_price(symbol: str) -> float:
    """Return the latest traded/last price for `symbol`."""
    raise NotImplementedError(
        f"Wire fetch_latest_price({symbol!r}) to your actual data source."
    )


def fetch_recent_closes(symbol: str, count: int) -> Optional[list[float]]:
    """
    Optional: return the last `count` bar closes for `symbol`, oldest
    first, to seed both moving averages immediately on startup instead
    of building them up from live polls (which would take
    200 * POLL_SECONDS seconds before the 200-MA could fire at all).
    Return None if you don't have an easy way to backfill -- the script
    falls back to building history live.
    """
    return None


# ---------------------------------------------------------------------------
# Alerting -- customize how you want to be notified
# ---------------------------------------------------------------------------

def alert(symbol: str, period: int, price: float, ma: float, bars_near: int) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    distance = price - ma
    msg = (
        f"[{ts}] {symbol}: price {price:.2f} hanging around {period}MA {ma:.2f} "
        f"({distance:+.2f}) for {bars_near} checks -- possible entry"
    )
    print("\a" + msg, flush=True)  # \a = terminal bell

    # Desktop notification (uncomment; pip install plyer):
    # from plyer import notification
    # notification.notify(title=f"{symbol} near {period}MA", message=msg, timeout=10)

    # Or push to a webhook / Slack / Discord, e.g.:
    # import urllib.request, json
    # urllib.request.urlopen(urllib.request.Request(
    #     WEBHOOK_URL, data=json.dumps({"text": msg}).encode(), method="POST"
    # ))


# ---------------------------------------------------------------------------
# Core logic -- shouldn't need to touch anything below this line
# ---------------------------------------------------------------------------

@dataclass
class MaState:
    prices: Deque[float] = field(default_factory=deque)
    consecutive_near: int = 0
    last_alert_at: float = 0.0


@dataclass
class SymbolState:
    mas: Dict[int, MaState] = field(
        default_factory=lambda: {p: MaState(prices=deque(maxlen=p)) for p in MA_PERIODS}
    )
    seeded: bool = False


def moving_average(ma: MaState, period: int) -> Optional[float]:
    if len(ma.prices) < period:
        return None
    return sum(ma.prices) / len(ma.prices)


def seed_if_possible(symbol: str, state: SymbolState) -> None:
    if state.seeded:
        return
    closes = fetch_recent_closes(symbol, max(MA_PERIODS))
    if closes:
        for period, ma in state.mas.items():
            ma.prices.extend(closes[-period:])
    state.seeded = True


def check_symbol(symbol: str, state: SymbolState, price: float) -> None:
    seed_if_possible(symbol, state)
    now = time.time()

    for period, ma in state.mas.items():
        ma.prices.append(price)
        avg = moving_average(ma, period)
        if avg is None:
            continue  # still building history for this MA

        near = abs(price - avg) / avg <= PROXIMITY_PCT
        ma.consecutive_near = ma.consecutive_near + 1 if near else 0

        ready = ma.consecutive_near >= MIN_BARS_NEAR
        off_cooldown = (now - ma.last_alert_at) > COOLDOWN_SECONDS
        if ready and off_cooldown:
            alert(symbol, period, price, avg, ma.consecutive_near)
            ma.last_alert_at = now


def main() -> None:
    states = {s: SymbolState() for s in SYMBOLS}
    periods_txt = " and ".join(f"{p}MA" for p in MA_PERIODS)
    print(
        f"Watching {', '.join(SYMBOLS)} for price within "
        f"{PROXIMITY_PCT * 100:.2f}% of their {periods_txt} "
        f"for {MIN_BARS_NEAR}+ checks (every {POLL_SECONDS}s, fetched concurrently)..."
    )
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SYMBOLS)) as executor:
        while True:
            # I/O-bound (network calls) -- fetch every symbol's price in
            # parallel instead of one at a time, same pattern as the
            # ThreadPoolExecutor demo this was built from.
            futures = {executor.submit(fetch_latest_price, s): s for s in SYMBOLS}
            prices: Dict[str, float] = {}
            for future in concurrent.futures.as_completed(futures):
                symbol = futures[future]
                try:
                    prices[symbol] = future.result()
                except NotImplementedError:
                    raise
                except Exception as exc:  # keep the watcher alive on a bad tick
                    print(f"{symbol}: error fetching price -- {exc}")

            for symbol, price in prices.items():
                check_symbol(symbol, states[symbol], price)

            time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
