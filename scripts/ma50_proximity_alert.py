#!/usr/bin/env python3
"""
50-MA proximity alert for futures.

Watches one or more futures symbols (MYM, MES, MNQ, ...) and fires an
alert whenever price is "hanging around" its 50-period moving average --
close enough, for long enough, to look like a potential entry, rather
than a single tick that happened to touch the line.

This does NOT ship with a broker connection. You said you're already
pulling data in Python -- plug that into fetch_latest_price() (and,
optionally, fetch_recent_closes() to seed the MA instantly on startup
instead of waiting 50 polls to build history) and this handles the
rest: moving average math, the "hanging around" logic, cooldown so you
don't get spammed, and the alert itself.
"""

import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from typing import Deque, Optional

# ---------------------------------------------------------------------------
# Config -- tune these to taste
# ---------------------------------------------------------------------------

SYMBOLS = ["MYM", "MES", "MNQ", "M2K", "MGC", "SIL"]

MA_PERIOD = 50          # the moving average length
PROXIMITY_PCT = 0.0015  # 0.15% -- how close to the MA counts as "hanging around"
MIN_BARS_NEAR = 3       # must stay within that band this many polls in a row
POLL_SECONDS = 15       # how often to check price
COOLDOWN_SECONDS = 300  # don't re-alert the same symbol within this window


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
    first, to seed the moving average immediately on startup instead of
    building it up from live polls (which would take MA_PERIOD * POLL_SECONDS
    seconds before the first alert could possibly fire). Return None if
    you don't have an easy way to backfill -- the script falls back to
    building history live.
    """
    return None


# ---------------------------------------------------------------------------
# Alerting -- customize how you want to be notified
# ---------------------------------------------------------------------------

def alert(symbol: str, price: float, ma: float, bars_near: int) -> None:
    ts = datetime.now().strftime("%H:%M:%S")
    distance = price - ma
    msg = (
        f"[{ts}] {symbol}: price {price:.2f} hanging around 50MA {ma:.2f} "
        f"({distance:+.2f}) for {bars_near} checks -- possible entry"
    )
    print("\a" + msg, flush=True)  # \a = terminal bell

    # Desktop notification (uncomment; pip install plyer):
    # from plyer import notification
    # notification.notify(title=f"{symbol} near 50MA", message=msg, timeout=10)

    # Or push to a webhook / Slack / Discord, e.g.:
    # import urllib.request, json
    # urllib.request.urlopen(urllib.request.Request(
    #     WEBHOOK_URL, data=json.dumps({"text": msg}).encode(), method="POST"
    # ))


# ---------------------------------------------------------------------------
# Core logic -- shouldn't need to touch anything below this line
# ---------------------------------------------------------------------------

@dataclass
class SymbolState:
    prices: Deque[float] = field(default_factory=lambda: deque(maxlen=MA_PERIOD))
    consecutive_near: int = 0
    last_alert_at: float = 0.0
    seeded: bool = False


def moving_average(prices: Deque[float]) -> Optional[float]:
    if len(prices) < MA_PERIOD:
        return None
    return sum(prices) / len(prices)


def seed_if_possible(symbol: str, state: SymbolState) -> None:
    if state.seeded:
        return
    closes = fetch_recent_closes(symbol, MA_PERIOD)
    if closes:
        state.prices.extend(closes[-MA_PERIOD:])
    state.seeded = True


def check_symbol(symbol: str, state: SymbolState) -> None:
    seed_if_possible(symbol, state)

    price = fetch_latest_price(symbol)
    state.prices.append(price)

    ma = moving_average(state.prices)
    if ma is None:
        return  # still building history

    distance_pct = abs(price - ma) / ma
    near = distance_pct <= PROXIMITY_PCT

    state.consecutive_near = state.consecutive_near + 1 if near else 0

    now = time.time()
    ready = state.consecutive_near >= MIN_BARS_NEAR
    off_cooldown = (now - state.last_alert_at) > COOLDOWN_SECONDS
    if ready and off_cooldown:
        alert(symbol, price, ma, state.consecutive_near)
        state.last_alert_at = now


def main() -> None:
    states = {s: SymbolState() for s in SYMBOLS}
    print(
        f"Watching {', '.join(SYMBOLS)} for price within "
        f"{PROXIMITY_PCT * 100:.2f}% of their {MA_PERIOD}-period MA "
        f"for {MIN_BARS_NEAR}+ checks (every {POLL_SECONDS}s)..."
    )
    while True:
        for symbol in SYMBOLS:
            try:
                check_symbol(symbol, states[symbol])
            except NotImplementedError:
                raise
            except Exception as exc:  # keep the watcher alive on a bad tick
                print(f"{symbol}: error fetching price -- {exc}")
        time.sleep(POLL_SECONDS)


if __name__ == "__main__":
    main()
