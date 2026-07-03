import json
from collections import Counter

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from screener import (
    data_source,
    get_intraday_history,
    get_sp500_tickers,
    get_stock_history,
    run_screen,
    run_screen_progress,
)
from tickers import FALLBACK_TICKERS
from voice import VoiceContext, handle_voice_query, is_configured

app = FastAPI(title="Stock Screener API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolve_tickers(universe: str, watchlist: str) -> list[str]:
    if universe == "watchlist":
        ticker_list = [t.strip().upper() for t in watchlist.split(",") if t.strip()]
        if not ticker_list:
            raise HTTPException(400, "watchlist is empty")
        return ticker_list
    return get_sp500_tickers()


@app.get("/api/health")
def health():
    return {"status": "ok", "data_source": data_source()}


@app.get("/api/tickers")
def tickers(universe: str = Query("sp500")):
    if universe == "sp500":
        return {"universe": "sp500", "tickers": get_sp500_tickers()}
    return {"universe": "fallback", "tickers": FALLBACK_TICKERS}


@app.get("/api/screen")
def screen(
    universe: str = Query("sp500", description="'sp500' or 'watchlist'"),
    watchlist: str = Query("", description="comma-separated tickers, used when universe=watchlist"),
):
    ticker_list = _resolve_tickers(universe, watchlist)
    results = run_screen(ticker_list)
    return {"count": len(results), "results": results}


@app.get("/api/screen/stream")
def screen_stream(
    universe: str = Query("sp500", description="'sp500' or 'watchlist'"),
    watchlist: str = Query("", description="comma-separated tickers, used when universe=watchlist"),
):
    """Same screen as /api/screen, but streamed as Server-Sent Events so the
    UI can show live progress through a full S&P 500 scan.
    """
    ticker_list = _resolve_tickers(universe, watchlist)

    def event_stream():
        for event in run_screen_progress(ticker_list):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.get("/api/stock/{ticker}")
def stock(ticker: str):
    return get_stock_history(ticker.upper())


@app.get("/api/stock/{ticker}/intraday")
def stock_intraday(
    ticker: str,
    minutes: int = Query(45, ge=1, le=390, description="Bar size in minutes"),
    days: int = Query(5, ge=1, le=20, description="How many trading days back"),
):
    return get_intraday_history(ticker.upper(), minutes=minutes, days=days)


class VoiceFilters(BaseModel):
    universe: str = "sp500"
    watchlist: str = ""
    trend_filter: str = "all"
    ma_filter: str = "all"
    only_active: bool = True


class VoiceQueryRequest(BaseModel):
    query: str
    filters: VoiceFilters
    results: list[dict] = []


@app.get("/api/voice/status")
def voice_status():
    return {"configured": is_configured()}


@app.post("/api/voice/query")
def voice_query(req: VoiceQueryRequest):
    if not is_configured():
        raise HTTPException(
            503,
            "Voice assistant isn't configured: set ANTHROPIC_API_KEY in backend/.env and restart the server.",
        )

    stats = Counter()
    for r in req.results:
        stats[f"trend:{r.get('trend_bias')}"] += 1
        if r.get("best_setup"):
            stats[f"setup:{r['best_setup']}"] += 1

    context = VoiceContext(
        universe=req.filters.universe,
        watchlist=req.filters.watchlist,
        trend_filter=req.filters.trend_filter,
        ma_filter=req.filters.ma_filter,
        only_active=req.filters.only_active,
        total_results=len(req.results),
        stats=dict(stats),
        sample_results=req.results[:30],
    )

    try:
        return handle_voice_query(req.query, context)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    except Exception as e:
        raise HTTPException(502, f"Voice assistant request failed: {e}")
