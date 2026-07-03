"""Sanity checks for the bounce-detection logic using synthetic OHLCV data,
since this environment can't reach live market data to test against yfinance.
"""
import os

import numpy as np
import pandas as pd

import alpaca_client
import screener
from screener import (
    BOUNCE_LOOKBACK_DAYS,
    _compute_result,
    _fetch_history_batch,
    _nearest_yf_interval,
    get_intraday_history,
)


def _make_history(closes: list[float]) -> pd.DataFrame:
    dates = pd.date_range("2023-01-01", periods=len(closes), freq="B")
    close = pd.Series(closes, index=dates)
    high = close * 1.005
    low = close * 0.995
    volume = pd.Series(1_000_000, index=dates)
    return pd.DataFrame({"Open": close, "High": high, "Low": low, "Close": close, "Volume": volume})


def test_confirmed_ma20_bounce_in_uptrend():
    # Strong steady uptrend for 450 days, then a shallow 4-day pullback that
    # touches MA20 and closes back above it on the last bar. The trend is
    # steep enough that MA20 keeps rising even through the dip.
    n = 450
    base = 100 + np.linspace(0, 220, n)  # rising from 100 to 320
    closes = base.tolist()
    closes[-4] *= 0.985
    closes[-3] *= 0.978
    closes[-2] *= 0.982
    closes[-1] *= 0.988  # still dipped, but within touch distance, closes above MA20
    hist = _make_history(closes)

    result = _compute_result("TEST", hist)
    assert result is not None, "expected a result for sufficiently long history"
    assert result.trend_bias == "bullish", result.trend_bias
    ma20_signals = [s for s in result.signals if s["ma_period"] == 20]
    assert ma20_signals, "expected an MA20 signal"
    print("MA20 signal:", ma20_signals[0])
    assert ma20_signals[0]["status"] in ("confirmed_bounce", "testing")


def test_no_setup_when_far_from_all_mas():
    n = 450
    closes = (100 + np.linspace(0, 60, n)).tolist()
    # Blow straight through, way above every MA for the whole lookback
    # window, no pullback at all.
    for i in range(1, BOUNCE_LOOKBACK_DAYS + 2):
        closes[-i] *= 1.5
    hist = _make_history(closes)

    result = _compute_result("TEST2", hist)
    assert result is not None
    assert result.best_setup is None, result.best_setup


def test_bearish_trend_bias():
    n = 450
    closes = (200 - np.linspace(0, 60, n)).tolist()  # steady downtrend
    hist = _make_history(closes)

    result = _compute_result("TEST3", hist)
    assert result is not None
    assert result.trend_bias == "bearish", result.trend_bias


def test_insufficient_history_returns_none():
    hist = _make_history((100 + np.linspace(0, 5, 10)).tolist())
    assert _compute_result("SHORT", hist) is None


def test_alpaca_fetch_failure_degrades_gracefully(monkeypatch):
    """A bad key / network error from Alpaca shouldn't crash the whole scan
    the way an uncaught `requests` exception would — it should just come
    back with no data for that batch, same as a yfinance ticker miss.
    """
    os.environ["APCA_API_KEY_ID"] = "PKtest"
    os.environ["APCA_API_SECRET_KEY"] = "secret"

    def boom(tickers, years=3):
        raise RuntimeError("simulated Alpaca auth failure")

    monkeypatch.setattr(alpaca_client, "fetch_history", boom)
    screener._history_cache.clear()

    result = _fetch_history_batch(["AAPL"])
    assert result == {}

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


def test_nearest_yf_interval_snaps_to_supported_values():
    assert _nearest_yf_interval(45) == 30  # closer to 30 than 60
    assert _nearest_yf_interval(1) == 1
    assert _nearest_yf_interval(100) == 90


def test_intraday_uses_alpaca_exact_timeframe_when_configured(monkeypatch):
    os.environ["APCA_API_KEY_ID"] = "PKtest"
    os.environ["APCA_API_SECRET_KEY"] = "secret"

    dates = pd.date_range("2024-01-02 09:30", periods=3, freq="45min")
    fake_df = pd.DataFrame(
        {"Open": [1, 2, 3], "High": [1, 2, 3], "Low": [1, 2, 3], "Close": [1, 2, 3], "Volume": [10, 20, 30]},
        index=dates,
    )

    def fake_fetch_intraday(ticker, minutes=45, days=5, client=None):
        assert minutes == 45
        return fake_df

    monkeypatch.setattr(alpaca_client, "fetch_intraday_bars", fake_fetch_intraday)

    result = get_intraday_history("AAPL", minutes=45, days=5)
    assert result["interval_minutes"] == 45
    assert len(result["candles"]) == 3
    assert result["candles"][0]["close"] == 1

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


def test_intraday_falls_back_to_yfinance_nearest_interval(monkeypatch):
    os.environ.pop("APCA_API_KEY_ID", None)
    os.environ.pop("APCA_API_SECRET_KEY", None)

    dates = pd.date_range("2024-01-02 09:30", periods=2, freq="30min")
    fake_df = pd.DataFrame(
        {"Open": [1, 2], "High": [1, 2], "Low": [1, 2], "Close": [1, 2], "Volume": [10, 20]},
        index=dates,
    )

    class FakeTicker:
        def history(self, period, interval):
            assert interval == "30m"  # 45 snapped to nearest supported (30)
            return fake_df

    monkeypatch.setattr(screener.yf, "Ticker", lambda t: FakeTicker())

    result = get_intraday_history("AAPL", minutes=45, days=5)
    assert result["interval_minutes"] == 30
    assert len(result["candles"]) == 2


if __name__ == "__main__":
    class MonkeyPatch:
        def setattr(self, obj, name, value):
            setattr(obj, name, value)

    test_confirmed_ma20_bounce_in_uptrend()
    test_no_setup_when_far_from_all_mas()
    test_bearish_trend_bias()
    test_insufficient_history_returns_none()
    test_alpaca_fetch_failure_degrades_gracefully(MonkeyPatch())
    test_nearest_yf_interval_snaps_to_supported_values()
    test_intraday_uses_alpaca_exact_timeframe_when_configured(MonkeyPatch())
    test_intraday_falls_back_to_yfinance_nearest_interval(MonkeyPatch())
    print("All synthetic screener tests passed.")
