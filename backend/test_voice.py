"""Unit tests for voice.py's action validation and response parsing, using
a fake Anthropic client so no real API key or network call is needed.
"""
from types import SimpleNamespace

from voice import VoiceContext, handle_voice_query


class FakeToolUseBlock:
    type = "tool_use"

    def __init__(self, input_):
        self.input = input_


class FakeMessages:
    def __init__(self, tool_input):
        self._tool_input = tool_input

    def create(self, **kwargs):
        assert kwargs["tool_choice"] == {"type": "tool", "name": "respond_to_voice_query"}
        return SimpleNamespace(content=[FakeToolUseBlock(self._tool_input)])


class FakeClient:
    def __init__(self, tool_input):
        self.messages = FakeMessages(tool_input)


def _ctx(**overrides):
    defaults = dict(
        universe="sp500",
        watchlist="",
        trend_filter="all",
        ma_filter="all",
        only_active=True,
        total_results=2,
        stats={"trend:bullish": 2},
        sample_results=[{"ticker": "AAPL", "price": 231.4, "change_pct": 1.2, "trend_bias": "bullish", "best_setup": "MA20 confirmed_bounce"}],
    )
    defaults.update(overrides)
    return VoiceContext(**defaults)


def test_valid_actions_pass_through():
    client = FakeClient({
        "reply": "Switching to your watchlist and rescanning.",
        "actions": [
            {"type": "set_universe", "universe": "watchlist"},
            {"type": "set_watchlist", "tickers": "TSLA, NVDA"},
            {"type": "run_screen"},
        ],
    })
    result = handle_voice_query("show me tesla and nvidia", _ctx(), client=client)
    assert result["reply"] == "Switching to your watchlist and rescanning."
    assert result["actions"] == [
        {"type": "set_universe", "universe": "watchlist"},
        {"type": "set_watchlist", "tickers": "TSLA, NVDA"},
        {"type": "run_screen"},
    ]


def test_invalid_actions_are_dropped():
    client = FakeClient({
        "reply": "Here's what I found.",
        "actions": [
            {"type": "set_trend_filter", "value": "extremely bullish"},  # invalid enum value
            {"type": "not_a_real_action"},                                # unknown type
            {"type": "select_ticker", "ticker": "aapl"},                  # valid, gets normalized
        ],
    })
    result = handle_voice_query("what's up with apple", _ctx(), client=client)
    assert result["actions"] == [{"type": "select_ticker", "ticker": "AAPL"}]


def test_missing_tool_use_falls_back_gracefully():
    class NoToolMessages:
        def create(self, **kwargs):
            return SimpleNamespace(content=[])

    client = SimpleNamespace(messages=NoToolMessages())
    result = handle_voice_query("hello?", _ctx(), client=client)
    assert result["actions"] == []
    assert "reply" in result


if __name__ == "__main__":
    test_valid_actions_pass_through()
    test_invalid_actions_are_dropped()
    test_missing_tool_use_falls_back_gracefully()
    print("All voice tests passed.")
