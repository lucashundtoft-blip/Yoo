"""Command-line interface for Finnhub API skill."""

import argparse
import os
import sys
import logging
from typing import Optional

from client import FinnhubClient


logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)


def get_api_key() -> str:
    """Get API key from environment or prompt user.

    Returns:
        API key string

    Raises:
        ValueError: If API key not found
    """
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        raise ValueError(
            "API key not found. Set FINNHUB_API_KEY environment variable "
            "or pass --api-key argument."
        )
    return api_key


def quote_command(args):
    """Handle quote subcommand."""
    api_key = args.api_key or get_api_key()

    with FinnhubClient(api_key) as client:
        if args.symbols:
            # Multiple symbols
            quotes = client.get_quotes(args.symbols)
            print(f"\n{'Symbol':<10} {'Price':<12} {'Change':<12} {'% Change':<12} {'High':<12} {'Low':<12}")
            print("-" * 70)
            for quote in quotes:
                status = "▲" if quote.change > 0 else "▼"
                print(
                    f"{status} {quote.symbol:<8} ${quote.current_price:<11.2f} "
                    f"{quote.change:<11.2f} {quote.change_percent:<11.2f}% "
                    f"${quote.high:<11.2f} ${quote.low:<11.2f}"
                )
        else:
            # Single symbol
            quote = client.get_quote(args.symbol)
            print(f"\n{quote.symbol} Stock Quote")
            print("-" * 40)
            print(f"Current Price:  ${quote.current_price:.2f}")
            print(f"Previous Close: ${quote.previous_close:.2f}")
            print(f"Change:         {quote.change:+.2f} ({quote.change_percent:+.2f}%)")
            print(f"High:           ${quote.high:.2f}")
            print(f"Low:            ${quote.low:.2f}")
            print(f"Open:           ${quote.open:.2f}")


def company_command(args):
    """Handle company subcommand."""
    api_key = args.api_key or get_api_key()

    with FinnhubClient(api_key) as client:
        profile = client.get_company_profile(args.symbol)
        print(f"\n{profile.name} ({profile.ticker})")
        print("-" * 50)
        print(f"Exchange:     {profile.exchange}")
        print(f"Industry:     {profile.industry}")
        if profile.country:
            print(f"Country:      {profile.country}")
        if profile.website:
            print(f"Website:      {profile.website}")
        if profile.description:
            print(f"Description:  {profile.description[:100]}...")
        if profile.market_cap:
            print(f"Market Cap:   ${profile.market_cap:,}")
        if profile.ipo:
            print(f"IPO Date:     {profile.ipo}")


def news_command(args):
    """Handle news subcommand."""
    api_key = args.api_key or get_api_key()

    with FinnhubClient(api_key) as client:
        articles = client.get_news(args.symbol, limit=args.limit)
        print(f"\n{args.symbol} News ({len(articles)} articles)")
        print("-" * 80)

        for i, article in enumerate(articles, 1):
            print(f"\n{i}. {article.headline}")
            print(f"   Source: {article.source}")
            if article.summary:
                summary = article.summary[:150] + "..." if len(article.summary) > 150 else article.summary
                print(f"   {summary}")
            print(f"   {article.url}")


def search_command(args):
    """Handle search subcommand."""
    api_key = args.api_key or get_api_key()

    with FinnhubClient(api_key) as client:
        results = client.search_stocks(args.query)
        print(f"\nSearch results for '{args.query}':")
        print("-" * 60)

        if not results:
            print("No results found.")
            return

        for result in results[:10]:
            symbol = result.get("symbol", "N/A")
            description = result.get("description", "N/A")
            print(f"{symbol:<10} {description}")


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Finnhub API CLI - Get financial market data",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s quote AAPL
  %(prog)s quote AAPL MSFT GOOGL
  %(prog)s company AAPL
  %(prog)s news AAPL -n 5
  %(prog)s search "Apple"
  %(prog)s quote AAPL --api-key YOUR_KEY
        """
    )

    parser.add_argument(
        "--api-key",
        help="Finnhub API key (or set FINNHUB_API_KEY env var)"
    )

    subparsers = parser.add_subparsers(dest="command", help="Command to execute")

    # Quote command
    quote_parser = subparsers.add_parser("quote", help="Get stock quotes")
    quote_parser.add_argument("symbol", help="Stock symbol(s)")
    quote_parser.add_argument("symbols", nargs="*", help="Additional symbols")
    quote_parser.set_defaults(func=quote_command)

    # Company command
    company_parser = subparsers.add_parser("company", help="Get company profile")
    company_parser.add_argument("symbol", help="Stock symbol")
    company_parser.set_defaults(func=company_command)

    # News command
    news_parser = subparsers.add_parser("news", help="Get company news")
    news_parser.add_argument("symbol", help="Stock symbol")
    news_parser.add_argument("-n", "--limit", type=int, default=10, help="Number of articles")
    news_parser.set_defaults(func=news_command)

    # Search command
    search_parser = subparsers.add_parser("search", help="Search for stocks")
    search_parser.add_argument("query", help="Search query")
    search_parser.set_defaults(func=search_command)

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        return

    try:
        args.func(args)
    except ValueError as e:
        logger.error(str(e))
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
