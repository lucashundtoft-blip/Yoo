"""Fallback ticker universe used when the live S&P 500 constituent list
(fetched from Wikipedia) can't be reached. Covers a broad, liquid slice
of large caps across sectors so the screener still returns useful results.
"""

FALLBACK_TICKERS = [
    # Tech
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "AVGO", "ORCL", "CRM",
    "ADBE", "AMD", "INTC", "CSCO", "QCOM", "TXN", "IBM", "NOW", "INTU", "AMAT",
    "MU", "PANW", "SNPS", "CDNS", "LRCX", "KLAC",
    # Communication / Media
    "NFLX", "DIS", "CMCSA", "TMUS", "VZ", "T",
    # Consumer
    "TSLA", "HD", "MCD", "NKE", "SBUX", "LOW", "TJX", "BKNG", "TGT", "ABNB",
    "CMG", "MAR",
    # Staples
    "WMT", "PG", "KO", "PEP", "COST", "PM", "MO", "CL", "MDLZ",
    # Financials
    "BRK-B", "JPM", "V", "MA", "BAC", "WFC", "GS", "MS", "AXP", "SCHW", "C",
    "BLK", "SPGI",
    # Healthcare
    "UNH", "LLY", "JNJ", "ABBV", "MRK", "PFE", "TMO", "ABT", "DHR", "BMY",
    "AMGN", "GILD", "ISRG", "VRTX",
    # Industrials
    "GE", "CAT", "RTX", "HON", "UPS", "BA", "DE", "LMT", "UNP", "ADP",
    # Energy
    "XOM", "CVX", "COP", "SLB",
    # Utilities / Real Estate
    "NEE", "DUK", "SO", "PLD", "AMT",
]
