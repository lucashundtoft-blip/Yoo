"""Finnhub API skill for fetching financial market data."""

from .client import FinnhubClient
from .models import Quote, CompanyProfile, News

__version__ = "0.1.0"
__all__ = ["FinnhubClient", "Quote", "CompanyProfile", "News"]
