"""Unit tests for alpaca_client.py's response parsing and symbol
translation — using a fake StockHistoricalDataClient (built on the real
BarSet/Bar models) so no real API key or network call is needed.
Pagination itself is handled by the alpaca-py SDK, not our code, so it's
not re-tested here.
"""
import os
from datetime import date

from alpaca.data.models.bars import BarSet

import alpaca_client


class FakeStockHistoricalDataClient:
    """Returns a real BarSet built from the same raw shape Alpaca's REST
    API returns, ignoring the actual request params (this fakes the
    network call, not the parsing).
    """

    def __init__(self, raw_bars_by_symbol: dict):
        self._raw = raw_bars_by_symbol

    def get_stock_bars(self, request_params):
        return BarSet(self._raw)


def test_is_configured_requires_both_keys():
    os.environ.pop("APCA_API_KEY_ID", None)
    os.environ.pop("APCA_API_SECRET_KEY", None)
    assert alpaca_client.is_configured() is False

    os.environ["APCA_API_KEY_ID"] = "PKtest"
    assert alpaca_client.is_configured() is False  # secret still missing

    os.environ["APCA_API_SECRET_KEY"] = "secret"
    assert alpaca_client.is_configured() is True

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


def test_class_share_symbol_translation():
    assert alpaca_client._to_alpaca_symbol("BRK-B") == "BRK.B"
    assert alpaca_client._to_alpaca_symbol("AAPL") == "AAPL"


def test_fetch_batch_parses_bars_and_maps_symbols_back():
    raw = {
        "AAPL": [
            {"t": "2024-01-02T05:00:00Z", "o": 100, "h": 101, "l": 99, "c": 100.5, "v": 1000, "n": 10, "vw": 100.0},
            {"t": "2024-01-03T05:00:00Z", "o": 100.5, "h": 102, "l": 100, "c": 101.5, "v": 1200, "n": 10, "vw": 100.0},
        ],
        "BRK.B": [
            {"t": "2024-01-02T05:00:00Z", "o": 350, "h": 352, "l": 349, "c": 351, "v": 500, "n": 10, "vw": 100.0},
        ],
    }
    fake_client = FakeStockHistoricalDataClient(raw)

    result = alpaca_client._fetch_batch(fake_client, ["AAPL", "BRK-B"], date(2024, 1, 1), date(2024, 1, 4))

    assert set(result.keys()) == {"AAPL", "BRK-B"}  # mapped back to Yahoo-style ticker
    aapl = result["AAPL"]
    assert list(aapl.columns) == ["Open", "High", "Low", "Close", "Volume"]
    assert len(aapl) == 2
    assert aapl.iloc[-1]["Close"] == 101.5


def test_fetch_batch_skips_symbols_with_no_bars():
    raw = {"AAPL": [], "MSFT": [{"t": "2024-01-02T05:00:00Z", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1, "n": 10, "vw": 100.0}]}
    fake_client = FakeStockHistoricalDataClient(raw)

    result = alpaca_client._fetch_batch(fake_client, ["AAPL", "MSFT"], date(2024, 1, 1), date(2024, 1, 4))

    assert set(result.keys()) == {"MSFT"}


def test_fetch_history_uses_injected_client_and_respects_batching(monkeypatch):
    os.environ["APCA_API_KEY_ID"] = "PKtest"
    os.environ["APCA_API_SECRET_KEY"] = "secret"
    monkeypatch.setattr(alpaca_client, "BATCH_SIZE", 1)  # force multiple batches

    raw = {"AAPL": [{"t": "2024-01-02T05:00:00Z", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1, "n": 10, "vw": 100.0}]}
    fake_client = FakeStockHistoricalDataClient(raw)

    result = alpaca_client.fetch_history(["AAPL", "MSFT"], years=1, client=fake_client)
    assert "AAPL" in result  # both batches hit the same fake client/raw data

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


if __name__ == "__main__":
    class MonkeyPatch:
        def setattr(self, obj, name, value):
            setattr(obj, name, value)

    test_is_configured_requires_both_keys()
    test_class_share_symbol_translation()
    test_fetch_batch_parses_bars_and_maps_symbols_back()
    test_fetch_batch_skips_symbols_with_no_bars()
    test_fetch_history_uses_injected_client_and_respects_batching(MonkeyPatch())
    print("All Alpaca client tests passed.")
