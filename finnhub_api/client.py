"""Finnhub API client for fetching financial market data."""

import requests
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from .models import Quote, CompanyProfile, News

logger = logging.getLogger(__name__)


class FinnhubClient:
    """Client for Finnhub API."""

    BASE_URL = "https://finnhub.io/api/v1"

    def __init__(self, api_key: str):
        """Initialize Finnhub client.

        Args:
            api_key: Finnhub API key
        """
        self.api_key = api_key
        self.session = requests.Session()

    def _request(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Make API request to Finnhub.

        Args:
            endpoint: API endpoint path
            params: Query parameters

        Returns:
            JSON response as dictionary

        Raises:
            requests.RequestException: If request fails
        """
        if params is None:
            params = {}

        params["token"] = self.api_key
        url = f"{self.BASE_URL}{endpoint}"

        try:
            response = self.session.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            raise

    def get_quote(self, symbol: str) -> Quote:
        """Get stock quote for a symbol.

        Args:
            symbol: Stock ticker symbol

        Returns:
            Quote object with price data
        """
        data = self._request("/quote", {"symbol": symbol})

        return Quote(
            symbol=symbol,
            current_price=data.get("c", 0),
            previous_close=data.get("pc", 0),
            change=data.get("d", 0),
            change_percent=data.get("dp", 0),
            high=data.get("h", 0),
            low=data.get("l", 0),
            open=data.get("o", 0),
            timestamp=data.get("t"),
        )

    def get_quotes(self, symbols: List[str]) -> List[Quote]:
        """Get stock quotes for multiple symbols.

        Args:
            symbols: List of stock ticker symbols

        Returns:
            List of Quote objects
        """
        quotes = []
        for symbol in symbols:
            try:
                quote = self.get_quote(symbol)
                quotes.append(quote)
            except requests.exceptions.RequestException as e:
                logger.warning(f"Failed to fetch quote for {symbol}: {e}")
        return quotes

    def get_company_profile(self, symbol: str) -> CompanyProfile:
        """Get company profile for a symbol.

        Args:
            symbol: Stock ticker symbol

        Returns:
            CompanyProfile object
        """
        data = self._request("/stock/profile2", {"symbol": symbol})

        return CompanyProfile(
            name=data.get("name", ""),
            ticker=data.get("ticker", symbol),
            exchange=data.get("exchange", ""),
            industry=data.get("finnhubIndustry", ""),
            website=data.get("weburl"),
            description=data.get("description"),
            country=data.get("country"),
            phone=data.get("phone"),
            ipo=data.get("ipo"),
            logo=data.get("logo"),
            market_cap=data.get("marketCapitalization"),
            shares_outstanding=data.get("shareOutstanding"),
        )

    def get_news(self, symbol: str, limit: int = 10) -> List[News]:
        """Get company news for a symbol.

        Args:
            symbol: Stock ticker symbol
            limit: Maximum number of news articles to fetch

        Returns:
            List of News objects
        """
        data = self._request("/company-news", {"symbol": symbol, "limit": limit})

        news_list = []
        for item in data:
            news = News(
                id=item.get("id", 0),
                headline=item.get("headline", ""),
                summary=item.get("summary", ""),
                source=item.get("source", ""),
                url=item.get("url", ""),
                image=item.get("image"),
                category=item.get("category"),
                sentiment=item.get("sentiment"),
                related=item.get("related"),
            )
            if item.get("datetime"):
                news.datetime = datetime.fromtimestamp(item["datetime"])
            news_list.append(news)

        return news_list

    def search_stocks(self, query: str) -> List[Dict[str, str]]:
        """Search for stocks by company name or symbol.

        Args:
            query: Search query string

        Returns:
            List of matching stocks with symbol, description, etc.
        """
        data = self._request("/search", {"q": query})
        return data.get("result", [])

    def get_market_status(self) -> Dict[str, Any]:
        """Get market status for different exchanges.

        Returns:
            Dictionary with market status information
        """
        return self._request("/market-status")

    def get_earnings_surprises(self, symbol: str) -> List[Dict[str, Any]]:
        """Get earnings surprises for a symbol.

        Args:
            symbol: Stock ticker symbol

        Returns:
            List of earnings surprise data
        """
        data = self._request("/stock/earnings-surprises", {"symbol": symbol})
        return data

    def get_insider_trades(self, symbol: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Get insider trades for a symbol.

        Args:
            symbol: Stock ticker symbol
            limit: Maximum number of trades to fetch

        Returns:
            List of insider trade data
        """
        data = self._request("/stock/insider-transactions", {"symbol": symbol, "limit": limit})
        return data

    def close(self):
        """Close the HTTP session."""
        self.session.close()

    def __enter__(self):
        """Context manager entry."""
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.close()
