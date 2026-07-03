from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from screener import get_sp500_tickers, get_stock_history, run_screen
from tickers import FALLBACK_TICKERS

app = FastAPI(title="Stock Screener API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    only_active: bool = Query(True, description="only return tickers with an active bounce setup"),
):
    if universe == "watchlist":
        ticker_list = [t.strip().upper() for t in watchlist.split(",") if t.strip()]
        if not ticker_list:
            raise HTTPException(400, "watchlist is empty")
    else:
        ticker_list = get_sp500_tickers()

    results = run_screen(ticker_list, only_active=only_active)
    return {"count": len(results), "results": results}


@app.get("/api/stock/{ticker}")
def stock(ticker: str):
    return get_stock_history(ticker.upper())
