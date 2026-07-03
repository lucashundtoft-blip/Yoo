"""Voice assistant: turns a transcribed spoken query into a short spoken
reply plus a list of actions to apply to the screener UI (change filters,
run a scan, open a chart), grounded only in the on-screen data the frontend
sends as context — the model never invents prices or setups.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any, Optional

from anthropic import Anthropic

VOICE_MODEL = "claude-haiku-4-5-20251001"  # fast + cheap, right for short command parsing

ACTION_TYPES = {
    "set_universe",
    "set_watchlist",
    "set_trend_filter",
    "set_ma_filter",
    "set_only_active",
    "select_ticker",
    "run_screen",
}
TREND_VALUES = {"all", "bullish", "bearish", "mixed"}
MA_VALUES = {"all", "20", "200", "400"}

RESPOND_TOOL = {
    "name": "respond_to_voice_query",
    "description": (
        "Reply to the user's spoken query about the stock screener, and optionally "
        "queue actions to apply in the UI."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "reply": {
                "type": "string",
                "description": "Short, conversational response to read back via text-to-speech. 1-3 sentences.",
            },
            "actions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string", "enum": sorted(ACTION_TYPES)},
                        "universe": {"type": "string", "enum": ["sp500", "watchlist"]},
                        "tickers": {
                            "type": "string",
                            "description": "Comma-separated ticker symbols, for set_watchlist.",
                        },
                        "value": {
                            "type": "string",
                            "description": "For set_trend_filter (all/bullish/bearish/mixed) or set_ma_filter (all/20/200/400).",
                        },
                        "enabled": {"type": "boolean", "description": "For set_only_active."},
                        "ticker": {"type": "string", "description": "For select_ticker."},
                    },
                    "required": ["type"],
                },
            },
        },
        "required": ["reply", "actions"],
    },
}

SYSTEM_PROMPT = """You are the voice assistant embedded in a stock screener app. \
The user speaks a query; you get a transcript plus the current on-screen state \
(filters and the latest scan results). You must call the respond_to_voice_query tool.

Rules:
- Only use figures (prices, %, MAs, setups) present in the provided context. Never invent data.
- If the user asks about something not in the context (e.g. a ticker not currently shown), \
you can still queue a `select_ticker` action for it (the app will fetch its real chart data \
independently) but do not state numbers for it you weren't given.
- If the request implies changing what's screened (universe, watchlist, filters) and seeing \
new results, queue the relevant set_* actions followed by a `run_screen` action.
- If it's just a question answerable from the given context, answer in `reply` with no actions \
(or a `select_ticker` action if pulling up a chart makes sense).
- Keep `reply` short (1-3 sentences) and conversational — it will be spoken aloud.
- available MAs are simple moving averages: MA20, MA200, MA400.
"""


@dataclass
class VoiceContext:
    universe: str
    watchlist: str
    trend_filter: str
    ma_filter: str
    only_active: bool
    total_results: int
    stats: dict[str, int]
    sample_results: list[dict]


def _format_context(ctx: VoiceContext) -> str:
    lines = [
        f"Current universe: {ctx.universe}",
        f"Watchlist field: {ctx.watchlist or '(empty)'}",
        f"Trend filter: {ctx.trend_filter}",
        f"MA setup filter: {ctx.ma_filter}",
        f"Only-active-setups toggle: {ctx.only_active}",
        f"Total scan results currently loaded: {ctx.total_results}",
        f"Breakdown: {ctx.stats}",
        "Sample of currently visible results (ticker, price, change_pct, trend_bias, best_setup):",
    ]
    for r in ctx.sample_results:
        lines.append(
            f"  {r.get('ticker')}: ${r.get('price')} ({r.get('change_pct')}%), "
            f"trend={r.get('trend_bias')}, setup={r.get('best_setup')}"
        )
    return "\n".join(lines)


def _validate_action(action: dict) -> Optional[dict]:
    a_type = action.get("type")
    if a_type not in ACTION_TYPES:
        return None
    if a_type == "set_universe" and action.get("universe") in ("sp500", "watchlist"):
        return {"type": a_type, "universe": action["universe"]}
    if a_type == "set_watchlist" and isinstance(action.get("tickers"), str):
        return {"type": a_type, "tickers": action["tickers"]}
    if a_type == "set_trend_filter" and action.get("value") in TREND_VALUES:
        return {"type": a_type, "value": action["value"]}
    if a_type == "set_ma_filter" and action.get("value") in MA_VALUES:
        return {"type": a_type, "value": action["value"]}
    if a_type == "set_only_active" and isinstance(action.get("enabled"), bool):
        return {"type": a_type, "enabled": action["enabled"]}
    if a_type == "select_ticker" and isinstance(action.get("ticker"), str) and action["ticker"]:
        return {"type": a_type, "ticker": action["ticker"].strip().upper()}
    if a_type == "run_screen":
        return {"type": a_type}
    return None


def is_configured() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def handle_voice_query(query: str, context: VoiceContext, client: Optional[Any] = None) -> dict:
    if not is_configured() and client is None:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set on the backend. Add it to backend/.env or export it "
            "before starting uvicorn to enable the voice assistant."
        )

    anthropic_client = client or Anthropic()
    message = anthropic_client.messages.create(
        model=VOICE_MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT + "\n\nContext:\n" + _format_context(context),
        tools=[RESPOND_TOOL],
        tool_choice={"type": "tool", "name": "respond_to_voice_query"},
        messages=[{"role": "user", "content": query}],
    )

    tool_use = next((b for b in message.content if b.type == "tool_use"), None)
    if tool_use is None:
        return {"reply": "Sorry, I didn't catch a usable response for that.", "actions": []}

    raw = tool_use.input or {}
    reply = raw.get("reply") or "Okay."
    raw_actions = raw.get("actions") or []
    actions = [a for a in (_validate_action(a) for a in raw_actions) if a is not None]
    return {"reply": reply, "actions": actions}
