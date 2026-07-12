"""Core "coil" pattern detection logic.

A stock is "coiling" when its short/medium/long moving averages have
stacked into bullish order (10 > 20 > 50) and pulled in tight next to
each other, while the underlying trend is still pointed up. That
combination often precedes a breakout.
"""

import pandas as pd

SMA_FAST = 10
SMA_MID = 20
SMA_SLOW = 50

TIGHTNESS_TOLERANCE = 0.03  # MAs must sit within 3% of each other
TREND_LOOKBACK = 10  # days used to confirm the slow MA is still rising


def add_moving_averages(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["sma_fast"] = df["Close"].rolling(SMA_FAST).mean()
    df["sma_mid"] = df["Close"].rolling(SMA_MID).mean()
    df["sma_slow"] = df["Close"].rolling(SMA_SLOW).mean()
    return df


def check_coil(
    df: pd.DataFrame,
    tightness_tolerance: float = TIGHTNESS_TOLERANCE,
    trend_lookback: int = TREND_LOOKBACK,
) -> dict | None:
    """Return match details if the latest bar is a coiled uptrend, else None.

    Needs at least SMA_SLOW + trend_lookback rows of daily OHLCV data with
    a "Close" column.
    """
    if len(df) < SMA_SLOW + trend_lookback:
        return None

    df = add_moving_averages(df)
    latest = df.iloc[-1]
    close, fast, mid, slow = latest["Close"], latest["sma_fast"], latest["sma_mid"], latest["sma_slow"]

    if pd.isna(fast) or pd.isna(mid) or pd.isna(slow):
        return None

    # MAs lined up in bullish order, price riding above all of them.
    stacked = close > fast > mid > slow

    # MAs pulled tight together (the "coil").
    spread = (max(fast, mid, slow) - min(fast, mid, slow)) / close
    tight = spread <= tightness_tolerance

    # Slow MA still trending up, confirming the broader uptrend.
    slow_prior = df["sma_slow"].iloc[-1 - trend_lookback]
    rising = pd.notna(slow_prior) and slow > slow_prior

    if not (stacked and tight and rising):
        return None

    return {
        "close": round(close, 2),
        "sma_fast": round(fast, 2),
        "sma_mid": round(mid, 2),
        "sma_slow": round(slow, 2),
        "spread_pct": round(spread * 100, 2),
        "slow_ma_change_pct": round((slow / slow_prior - 1) * 100, 2),
    }
