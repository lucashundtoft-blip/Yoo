"""Unit tests for alpaca_client.py's response parsing, symbol translation,
and pagination — using a fake requests.get so no real API key or network
call is needed.
"""
import os
from types import SimpleNamespace

import alpaca_client


class FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        pass

    def json(self):
        return self._payload


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


def test_fetch_batch_parses_bars_and_maps_symbols_back(monkeypatch):
    os.environ["APCA_API_KEY_ID"] = "PKtest"
    os.environ["APCA_API_SECRET_KEY"] = "secret"

    payload = {
        "bars": {
            "AAPL": [
                {"t": "2024-01-02T05:00:00Z", "o": 100, "h": 101, "l": 99, "c": 100.5, "v": 1000},
                {"t": "2024-01-03T05:00:00Z", "o": 100.5, "h": 102, "l": 100, "c": 101.5, "v": 1200},
            ],
            "BRK.B": [
                {"t": "2024-01-02T05:00:00Z", "o": 350, "h": 352, "l": 349, "c": 351, "v": 500},
            ],
        },
        "next_page_token": None,
    }

    def fake_get(url, headers, params, timeout):
        assert url == alpaca_client.DATA_BASE_URL
        assert headers["APCA-API-KEY-ID"] == "PKtest"
        assert "AAPL" in params["symbols"] and "BRK.B" in params["symbols"]
        return FakeResponse(payload)

    monkeypatch.setattr(alpaca_client.requests, "get", fake_get)

    result = alpaca_client._fetch_batch(["AAPL", "BRK-B"], "2024-01-01", "2024-01-04")

    assert set(result.keys()) == {"AAPL", "BRK-B"}  # mapped back to Yahoo-style ticker
    aapl = result["AAPL"]
    assert list(aapl.columns) == ["Open", "High", "Low", "Close", "Volume"]
    assert len(aapl) == 2
    assert aapl.iloc[-1]["Close"] == 101.5

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


def test_fetch_batch_follows_pagination(monkeypatch):
    os.environ["APCA_API_KEY_ID"] = "PKtest"
    os.environ["APCA_API_SECRET_KEY"] = "secret"

    pages = [
        {
            "bars": {"AAPL": [{"t": "2024-01-02T05:00:00Z", "o": 1, "h": 1, "l": 1, "c": 1, "v": 1}]},
            "next_page_token": "page2",
        },
        {
            "bars": {"AAPL": [{"t": "2024-01-03T05:00:00Z", "o": 2, "h": 2, "l": 2, "c": 2, "v": 2}]},
            "next_page_token": None,
        },
    ]
    call_count = {"n": 0}

    def fake_get(url, headers, params, timeout):
        page = pages[call_count["n"]]
        call_count["n"] += 1
        return FakeResponse(page)

    monkeypatch.setattr(alpaca_client.requests, "get", fake_get)

    result = alpaca_client._fetch_batch(["AAPL"], "2024-01-01", "2024-01-04")
    assert call_count["n"] == 2
    assert len(result["AAPL"]) == 2

    del os.environ["APCA_API_KEY_ID"]
    del os.environ["APCA_API_SECRET_KEY"]


if __name__ == "__main__":
    import types

    class MonkeyPatch:
        def setattr(self, obj, name, value):
            setattr(obj, name, value)

    mp = MonkeyPatch()
    test_is_configured_requires_both_keys()
    test_class_share_symbol_translation()
    test_fetch_batch_parses_bars_and_maps_symbols_back(mp)
    test_fetch_batch_follows_pagination(mp)
    print("All Alpaca client tests passed.")
