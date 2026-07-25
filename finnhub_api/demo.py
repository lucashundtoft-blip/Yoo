"""Demo of Finnhub API skill with mocked data (no network required)."""

from unittest.mock import patch, MagicMock
from .client import FinnhubClient
from .models import Quote, CompanyProfile, News


def demo_with_mocks():
    """Demonstrate the API with mocked responses."""

    print("\n" + "="*70)
    print("FINNHUB API SKILL - DEMONSTRATION WITH MOCKED DATA")
    print("="*70)

    # Mock data
    quote_data = {
        "c": 150.50,
        "pc": 149.25,
        "d": 1.25,
        "dp": 0.84,
        "h": 151.00,
        "l": 148.50,
        "o": 149.00,
        "t": 1234567890
    }

    profile_data = {
        "name": "Apple Inc",
        "ticker": "AAPL",
        "exchange": "NASDAQ",
        "finnhubIndustry": "Technology",
        "weburl": "https://www.apple.com",
        "country": "US",
        "phone": "+1-408-996-1010",
        "ipo": "1980-12-12",
        "marketCapitalization": 3000000,
        "shareOutstanding": 15000
    }

    news_data = [
        {
            "id": 1,
            "headline": "Apple Announces Record Q3 Revenue",
            "summary": "Apple reported strong quarterly earnings with revenue exceeding expectations by 15%",
            "source": "Reuters",
            "url": "https://example.com/news/apple-q3",
            "image": "https://example.com/image.jpg",
            "category": "earnings",
            "datetime": 1234567890
        },
        {
            "id": 2,
            "headline": "Apple Stock Hits All-Time High",
            "summary": "Following strong earnings report, Apple stock reaches new peak",
            "source": "Bloomberg",
            "url": "https://example.com/news/apple-high",
            "datetime": 1234567800
        }
    ]

    search_data = {
        "result": [
            {"symbol": "AAPL", "description": "Apple Inc"},
            {"symbol": "APLD", "description": "Applied Digital Corporation"},
            {"symbol": "APLM", "description": "Apollomatix Corp"},
        ]
    }

    # ========== DEMO 1: Stock Quote ==========
    print("\n" + "-"*70)
    print("1. STOCK QUOTE")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = quote_data
        mock_get.return_value = mock_response

        client = FinnhubClient("demo_key")
        quote = client.get_quote("AAPL")

        print(f"Symbol:           {quote.symbol}")
        print(f"Current Price:    ${quote.current_price:.2f}")
        print(f"Previous Close:   ${quote.previous_close:.2f}")
        print(f"Change:           {quote.change:+.2f} ({quote.change_percent:+.2f}%)")
        print(f"High:             ${quote.high:.2f}")
        print(f"Low:              ${quote.low:.2f}")
        print(f"Open:             ${quote.open:.2f}")
        print(f"Status:           ▲ UP" if quote.change > 0 else "Status:           ▼ DOWN")

        client.close()

    # ========== DEMO 2: Multiple Quotes ==========
    print("\n" + "-"*70)
    print("2. MULTIPLE STOCK QUOTES")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = quote_data
        mock_get.return_value = mock_response

        client = FinnhubClient("demo_key")
        symbols = ["AAPL", "MSFT", "GOOGL"]

        print(f"\n{'Symbol':<10} {'Price':<12} {'Change':<12} {'% Change':<12}")
        print("-" * 50)

        for symbol in symbols:
            quote_data["c"] = 150.50 + (symbols.index(symbol) * 5)
            quote_data["d"] = 1.25 + (symbols.index(symbol) * 0.5)
            quote_data["dp"] = 0.84 + (symbols.index(symbol) * 0.3)

            quote = client.get_quote(symbol)
            status = "▲" if quote.change > 0 else "▼"
            print(f"{status} {quote.symbol:<8} ${quote.current_price:<11.2f} {quote.change:<11.2f} {quote.change_percent:<11.2f}%")

        client.close()

    # ========== DEMO 3: Company Profile ==========
    print("\n" + "-"*70)
    print("3. COMPANY PROFILE")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = profile_data
        mock_get.return_value = mock_response

        client = FinnhubClient("demo_key")
        profile = client.get_company_profile("AAPL")

        print(f"Company Name:     {profile.name}")
        print(f"Ticker:           {profile.ticker}")
        print(f"Exchange:         {profile.exchange}")
        print(f"Industry:         {profile.industry}")
        print(f"Country:          {profile.country}")
        print(f"Website:          {profile.website}")
        print(f"Phone:            {profile.phone}")
        print(f"IPO Date:         {profile.ipo}")
        print(f"Market Cap:       ${profile.market_cap:,} million")
        print(f"Shares Out:       {profile.shares_outstanding:,} million")

        client.close()

    # ========== DEMO 4: News ==========
    print("\n" + "-"*70)
    print("4. COMPANY NEWS")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = news_data
        mock_get.return_value = mock_response

        client = FinnhubClient("demo_key")
        articles = client.get_news("AAPL", limit=2)

        for i, article in enumerate(articles, 1):
            print(f"\n{i}. {article.headline}")
            print(f"   Source:   {article.source}")
            print(f"   Summary:  {article.summary}")
            print(f"   Link:     {article.url}")

        client.close()

    # ========== DEMO 5: Stock Search ==========
    print("\n" + "-"*70)
    print("5. STOCK SEARCH")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = search_data
        mock_get.return_value = mock_response

        client = FinnhubClient("demo_key")
        results = client.search_stocks("Apple")

        print(f"\nSearch Results for 'Apple':\n")
        print(f"{'Symbol':<10} {'Description':<40}")
        print("-" * 50)
        for result in results:
            print(f"{result['symbol']:<10} {result['description']:<40}")

        client.close()

    # ========== DEMO 6: Context Manager ==========
    print("\n" + "-"*70)
    print("6. USING CONTEXT MANAGER (Auto Cleanup)")
    print("-"*70)

    with patch("finnhub_api.client.requests.Session.get") as mock_get:
        mock_response = MagicMock()
        mock_response.json.return_value = quote_data
        mock_get.return_value = mock_response

        print("\nUsing 'with' statement for automatic resource cleanup:\n")

        with FinnhubClient("demo_key") as client:
            quote = client.get_quote("AAPL")
            print(f"✓ Session created and request made: {quote}")
            print(f"✓ Session will auto-close after 'with' block")

    print("\n" + "="*70)
    print("DEMONSTRATION COMPLETE")
    print("="*70)
    print("\nThe skill is fully functional and ready to use!")
    print("In a real environment with network access, it will fetch live data from Finnhub.\n")


if __name__ == "__main__":
    demo_with_mocks()
