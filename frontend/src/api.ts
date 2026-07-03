import type { ScreenResult, StockHistoryResponse } from './types';

const BASE = '/api';

interface ScreenOpts {
  universe: 'sp500' | 'watchlist';
  watchlist?: string;
}

function screenParams(opts: ScreenOpts): URLSearchParams {
  const params = new URLSearchParams({ universe: opts.universe });
  if (opts.universe === 'watchlist') {
    params.set('watchlist', opts.watchlist ?? '');
  }
  return params;
}

interface StreamHandlers {
  onProgress: (processed: number, total: number) => void;
  onDone: (results: ScreenResult[]) => void;
  onError: (message: string) => void;
}

/**
 * Runs a screen via Server-Sent Events so the caller gets live progress
 * through a full S&P 500 scan instead of one opaque wait. Returns a
 * function that cancels the stream.
 */
export function streamScreen(opts: ScreenOpts, handlers: StreamHandlers): () => void {
  const params = screenParams(opts);
  const source = new EventSource(`${BASE}/screen/stream?${params.toString()}`);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'progress') {
        handlers.onProgress(data.processed, data.total);
      } else if (data.type === 'done') {
        handlers.onDone(data.results);
        source.close();
      }
    } catch {
      handlers.onError('Received a malformed update from the screener');
      source.close();
    }
  };

  source.onerror = () => {
    handlers.onError('Lost connection to the screener (is the backend running?)');
    source.close();
  };

  return () => source.close();
}

export async function fetchStockHistory(ticker: string): Promise<StockHistoryResponse> {
  const res = await fetch(`${BASE}/stock/${encodeURIComponent(ticker)}`);
  if (!res.ok) {
    throw new Error(`Failed to load history for ${ticker} (${res.status})`);
  }
  return res.json();
}
