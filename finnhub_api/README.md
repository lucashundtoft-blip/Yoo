# Finnhub API Skill

A comprehensive Python skill for fetching financial market data from the Finnhub API. Get stock quotes, company information, news, and more.

## Features

- **Stock Quotes**: Real-time and delayed stock price data
- **Company Profiles**: Detailed company information
- **News**: Company news and articles
- **Stock Search**: Find stocks by name or symbol
- **Market Status**: Get exchange status information
- **Earnings Data**: Earnings surprises and forecasts
- **Insider Trades**: Insider trading activity
- **Type-safe**: Dataclass models for all API responses
- **Error Handling**: Graceful error handling with logging
- **Context Manager**: Automatic resource cleanup

## Installation

```bash
pip install -r requirements.txt
```

## Getting Started

### 1. Get a Finnhub API Key

1. Visit [https://finnhub.io](https://finnhub.io)
2. Sign up for a free account
3. Copy your API key from the dashboard

### 2. Basic Usage

```python
from finnhub_api import FinnhubClient

# Initialize client
client = FinnhubClient(api_key="your_api_key_here")

# Get a stock quote
quote = client.get_quote("AAPL")
print(f"Apple: ${quote.current_price} ({quote.change_percent:+.2f}%)")

# Clean up
client.close()
```

### 3. Using Context Manager

```python
from finnhub_api import FinnhubClient

with FinnhubClient(api_key="your_api_key_here") as client:
    quote = client.get_quote("AAPL")
    print(quote)
    # Session automatically closed
```

## API Methods

### `get_quote(symbol: str) -> Quote`

Get current stock quote for a symbol.

```python
quote = client.get_quote("AAPL")
print(f"Price: ${quote.current_price}")
print(f"Change: {quote.change_percent:+.2f}%")
print(f"High: ${quote.high}, Low: ${quote.low}")
```

### `get_quotes(symbols: List[str]) -> List[Quote]`

Get quotes for multiple symbols at once.

```python
quotes = client.get_quotes(["AAPL", "MSFT", "GOOGL"])
for quote in quotes:
    print(f"{quote.symbol}: {quote}")
```

### `get_company_profile(symbol: str) -> CompanyProfile`

Get detailed company information.

```python
profile = client.get_company_profile("AAPL")
print(f"Company: {profile.name}")
print(f"Industry: {profile.industry}")
print(f"Website: {profile.website}")
print(f"Market Cap: ${profile.market_cap:,}")
```

### `get_news(symbol: str, limit: int = 10) -> List[News]`

Get company news and articles.

```python
news = client.get_news("AAPL", limit=5)
for article in news:
    print(f"{article.headline}")
    print(f"Source: {article.source}")
    print(f"URL: {article.url}")
```

### `search_stocks(query: str) -> List[Dict]`

Search for stocks by name or symbol.

```python
results = client.search_stocks("Apple")
for result in results:
    print(f"{result['symbol']}: {result['description']}")
```

### `get_market_status() -> Dict`

Get current market status for exchanges.

```python
status = client.get_market_status()
print(status)
```

### `get_earnings_surprises(symbol: str) -> List[Dict]`

Get earnings surprises data.

```python
earnings = client.get_earnings_surprises("AAPL")
for record in earnings:
    print(f"Q{record['quarter']}: {record['surprise']}")
```

### `get_insider_trades(symbol: str, limit: int = 100) -> List[Dict]`

Get insider trading activity.

```python
trades = client.get_insider_trades("AAPL", limit=10)
for trade in trades:
    print(f"{trade['name']}: {trade['transactionType']}")
```

## Data Models

### Quote

```python
@dataclass
class Quote:
    symbol: str
    current_price: float
    previous_close: float
    change: float
    change_percent: float
    high: float
    low: float
    open: float
    timestamp: Optional[int] = None
```

### CompanyProfile

```python
@dataclass
class CompanyProfile:
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
```

### News

```python
@dataclass
class News:
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
```

## Examples

See `examples.py` for complete working examples:

```bash
python examples.py
```

## Error Handling

The client gracefully handles API errors with logging:

```python
import logging

logging.basicConfig(level=logging.INFO)

try:
    quote = client.get_quote("INVALID")
except requests.exceptions.RequestException as e:
    print(f"API error: {e}")
```

## Rate Limiting

The Finnhub free tier has rate limits. The client respects these limits:

- Free tier: 60 API calls per minute
- Premium: Higher limits depending on plan

For batch operations, consider adding delays:

```python
import time

for symbol in symbols:
    quote = client.get_quote(symbol)
    time.sleep(0.1)  # Small delay between requests
```

## Environment Variables

For security, store your API key in an environment variable:

```bash
export FINNHUB_API_KEY="your_api_key_here"
```

Then use it:

```python
import os

api_key = os.getenv("FINNHUB_API_KEY")
client = FinnhubClient(api_key)
```

## License

MIT

## Contributing

Contributions welcome! Feel free to submit issues or pull requests.

## Support

- [Finnhub API Docs](https://finnhub.io/docs/api)
- [Issue Tracker](https://github.com/yourusername/yoo/issues)
