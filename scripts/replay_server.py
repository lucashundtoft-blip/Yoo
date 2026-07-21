"""Local backend for web/bar_replay_trainer.html: serves the trainer page and
a /api/bars endpoint that pulls fresh OHLCV data from Yahoo Finance (via
yfinance) in the same shape the trainer's baked-in DATA object uses:

    {"d": [[date, open, high, low, close, volume], ...],   # ~2y daily
     "f": [[epoch_minutes, o, h, l, c, volume], ...],       # ~60d of 5m bars
     "m": [[epoch_minutes, o, h, l, c, volume], ...]}       # ~7d of 1m bars

The browser can't call Yahoo Finance directly (no CORS headers on the
undocumented endpoints yfinance uses), so this proxies the request
server-side and serves it same-origin alongside the static page.

Requires the `yfinance` package (see requirements.txt).

Usage:
    python -m scripts.replay_server
    # then open http://localhost:8000/bar_replay_trainer.html
"""
import http.server
import json
import socketserver
import urllib.parse
from pathlib import Path

try:
    import yfinance as yf
except ImportError:
    print("yfinance not installed. Run: pip install -r requirements.txt")
    raise SystemExit(1)

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
PORT = 8000


def _bars(ticker: "yf.Ticker", period: str, interval: str, date_only: bool):
    hist = ticker.history(period=period, interval=interval)
    out = []
    for idx, row in hist.iterrows():
        key = idx.strftime("%Y-%m-%d") if date_only else int(idx.timestamp() // 60)
        out.append([
            key,
            round(float(row.Open), 2), round(float(row.High), 2),
            round(float(row.Low), 2), round(float(row.Close), 2),
            int(row.Volume),
        ])
    return out


def fetch_symbol(symbol: str) -> dict:
    ticker = yf.Ticker(symbol)
    return {
        "d": _bars(ticker, "2y", "1d", date_only=True),
        "f": _bars(ticker, "60d", "5m", date_only=False),
        "m": _bars(ticker, "7d", "1m", date_only=False),
    }


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/bars":
            return super().do_GET()

        qs = urllib.parse.parse_qs(parsed.query)
        symbol = (qs.get("symbol") or [""])[0].strip().upper()
        if not symbol:
            self.send_error(400, "symbol query param required")
            return

        try:
            data = fetch_symbol(symbol)
        except Exception as e:
            self.send_error(502, f"fetch failed for {symbol}: {e}")
            return

        if not data["d"]:
            self.send_error(404, f"no data for {symbol}")
            return

        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"Serving {WEB_DIR} at http://localhost:{PORT}/bar_replay_trainer.html")
        print(f"Live data endpoint: http://localhost:{PORT}/api/bars?symbol=AAPL")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
