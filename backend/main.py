import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from screener import get_sp500_tickers, get_stock_history, run_screen, run_screen_progress
from tickers import FALLBACK_TICKERS

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
    return {"status": "ok"}


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
