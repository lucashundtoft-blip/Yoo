"""Example usage of the Finnhub API skill."""

from .client import FinnhubClient


def example_get_quote():
    """Example: Get a single stock quote."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"
    client = FinnhubClient(api_key)

    try:
        quote = client.get_quote("AAPL")
        print(f"Apple Stock: {quote}")
        print(f"  Current Price: ${quote.current_price}")
        print(f"  Change: {quote.change:+.2f} ({quote.change_percent:+.2f}%)")
        print(f"  High: ${quote.high} | Low: ${quote.low}")
    finally:
        client.close()


def example_get_multiple_quotes():
    """Example: Get quotes for multiple stocks."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"
    client = FinnhubClient(api_key)

    try:
        symbols = ["AAPL", "MSFT", "GOOGL", "TSLA"]
        quotes = client.get_quotes(symbols)

        print("Stock Quotes:")
        print("-" * 60)
        for quote in quotes:
            status = "▲" if quote.change > 0 else "▼"
            print(f"{status} {quote.symbol}: ${quote.current_price:.2f} ({quote.change_percent:+.2f}%)")
    finally:
        client.close()


def example_get_company_profile():
    """Example: Get company profile information."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"
    client = FinnhubClient(api_key)

    try:
        profile = client.get_company_profile("AAPL")
        print(f"Company: {profile.name}")
        print(f"Ticker: {profile.ticker}")
        print(f"Exchange: {profile.exchange}")
        print(f"Industry: {profile.industry}")
        print(f"Website: {profile.website}")
        print(f"Market Cap: ${profile.market_cap:,}" if profile.market_cap else "N/A")
    finally:
        client.close()


def example_get_news():
    """Example: Get company news."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"
    client = FinnhubClient(api_key)

    try:
        news_articles = client.get_news("AAPL", limit=5)
        print("Latest News for Apple:")
        print("-" * 60)
        for article in news_articles:
            print(f"\n{article.headline}")
            print(f"Source: {article.source}")
            print(f"Summary: {article.summary[:200]}...")
            print(f"URL: {article.url}")
    finally:
        client.close()


def example_search_stocks():
    """Example: Search for stocks."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"
    client = FinnhubClient(api_key)

    try:
        results = client.search_stocks("Apple")
        print("Search Results for 'Apple':")
        print("-" * 60)
        for result in results[:5]:
            print(f"{result.get('symbol', 'N/A')}: {result.get('description', 'N/A')}")
    finally:
        client.close()


def example_context_manager():
    """Example: Using context manager for automatic cleanup."""
    api_key = "d9ihhahr01qs513m5gbgd9ihhahr01qs513m5gc0"

    with FinnhubClient(api_key) as client:
        quote = client.get_quote("AAPL")
        print(f"Apple: {quote}")
        # Session automatically closed after the with block


if __name__ == "__main__":
    print("Finnhub API Skill Examples")
    print("=" * 60)
    print()

    try:
        print("\n--- Example 1: Get Single Quote ---")
        example_get_quote()
    except Exception as e:
        print(f"Error: {e}")

    try:
        print("\n--- Example 2: Get Multiple Quotes ---")
        example_get_multiple_quotes()
    except Exception as e:
        print(f"Error: {e}")

    try:
        print("\n--- Example 3: Get Company Profile ---")
        example_get_company_profile()
    except Exception as e:
        print(f"Error: {e}")

    try:
        print("\n--- Example 4: Get News ---")
        example_get_news()
    except Exception as e:
        print(f"Error: {e}")

    try:
        print("\n--- Example 5: Search Stocks ---")
        example_search_stocks()
    except Exception as e:
        print(f"Error: {e}")

    try:
        print("\n--- Example 6: Context Manager ---")
        example_context_manager()
    except Exception as e:
        print(f"Error: {e}")
