"""Data models for Finnhub API responses."""

from dataclasses import dataclass
from typing import Optional
from datetime import datetime


@dataclass
class Quote:
    """Stock quote data."""
    symbol: str
    current_price: float
    previous_close: float
    change: float
    change_percent: float
    high: float
    low: float
    open: float
    timestamp: Optional[int] = None

    def __str__(self) -> str:
        return (
            f"{self.symbol}: ${self.current_price:.2f} "
            f"({self.change:+.2f}, {self.change_percent:+.2f}%)"
        )


@dataclass
class CompanyProfile:
    """Company profile data."""
    name: str
    ticker: str
    exchange: str
    industry: str
    website: Optional[str] = None
    description: Optional[str] = None
    country: Optional[str] = None
    phone: Optional[str] = None
    ipo: Optional[str] = None
    logo: Optional[str] = None
    market_cap: Optional[int] = None
    shares_outstanding: Optional[int] = None


@dataclass
class News:
    """News article data."""
    id: int
    headline: str
    summary: str
    source: str
    url: str
    image: Optional[str] = None
    category: Optional[str] = None
    datetime: Optional[datetime] = None
    sentiment: Optional[float] = None
    related: Optional[list] = None

    def __str__(self) -> str:
        return f"{self.headline} ({self.source})"
