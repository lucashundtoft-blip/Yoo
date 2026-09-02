"""Unit tests for Finnhub API client."""

import unittest
from unittest.mock import patch, MagicMock
from client import FinnhubClient
from models import Quote, CompanyProfile, News


class TestFinnhubClient(unittest.TestCase):
    """Test cases for FinnhubClient."""

    def setUp(self):
        """Set up test fixtures."""
        self.api_key = "test_api_key"
        self.client = FinnhubClient(self.api_key)

    def tearDown(self):
        """Clean up after tests."""
        self.client.close()

    @patch("client.requests.Session.get")
    def test_get_quote(self, mock_get):
        """Test getting a stock quote."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "c": 150.50,
            "pc": 149.25,
            "d": 1.25,
            "dp": 0.84,
            "h": 151.00,
            "l": 148.50,
            "o": 149.00,
            "t": 1234567890
        }
        mock_get.return_value = mock_response

        quote = self.client.get_quote("AAPL")

        self.assertEqual(quote.symbol, "AAPL")
        self.assertEqual(quote.current_price, 150.50)
        self.assertEqual(quote.change, 1.25)
        self.assertEqual(quote.change_percent, 0.84)
        self.assertEqual(quote.high, 151.00)
        self.assertEqual(quote.low, 148.50)

    @patch("client.requests.Session.get")
    def test_get_company_profile(self, mock_get):
        """Test getting company profile."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "name": "Apple Inc",
            "ticker": "AAPL",
            "exchange": "NASDAQ",
            "finnhubIndustry": "Technology",
            "weburl": "https://www.apple.com",
            "country": "US",
            "marketCapitalization": 3000000,
            "shareOutstanding": 15000
        }
        mock_get.return_value = mock_response

        profile = self.client.get_company_profile("AAPL")

        self.assertEqual(profile.name, "Apple Inc")
        self.assertEqual(profile.ticker, "AAPL")
        self.assertEqual(profile.exchange, "NASDAQ")
        self.assertEqual(profile.industry, "Technology")
        self.assertEqual(profile.market_cap, 3000000)

    @patch("client.requests.Session.get")
    def test_get_news(self, mock_get):
        """Test getting company news."""
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {
                "id": 1,
                "headline": "Apple Announces Q3 Results",
                "summary": "Strong quarterly performance",
                "source": "TechNews",
                "url": "https://example.com/news1",
                "datetime": 1234567890
            }
        ]
        mock_get.return_value = mock_response

        news = self.client.get_news("AAPL", limit=1)

        self.assertEqual(len(news), 1)
        self.assertEqual(news[0].headline, "Apple Announces Q3 Results")
        self.assertEqual(news[0].source, "TechNews")

    @patch("client.requests.Session.get")
    def test_search_stocks(self, mock_get):
        """Test searching for stocks."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "result": [
                {
                    "symbol": "AAPL",
                    "description": "Apple Inc",
                    "displaySymbol": "AAPL"
                }
            ]
        }
        mock_get.return_value = mock_response

        results = self.client.search_stocks("Apple")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["symbol"], "AAPL")

    def test_context_manager(self):
        """Test using client as context manager."""
        with FinnhubClient(self.api_key) as client:
            self.assertIsNotNone(client.session)

    def test_quote_str_representation(self):
        """Test Quote string representation."""
        quote = Quote(
            symbol="AAPL",
            current_price=150.50,
            previous_close=149.25,
            change=1.25,
            change_percent=0.84,
            high=151.00,
            low=148.50,
            open=149.00
        )
        expected = "AAPL: $150.50 (+1.25, +0.84%)"
        self.assertEqual(str(quote), expected)


if __name__ == "__main__":
    unittest.main()
