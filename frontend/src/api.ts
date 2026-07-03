import type {
  IntradayHistoryResponse,
  ScreenResult,
  StockHistoryResponse,
  VoiceFilters,
  VoiceQueryResponse,
} from './types';

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

export async function fetchIntradayHistory(
  ticker: string,
  minutes = 45,
  days = 5
): Promise<IntradayHistoryResponse> {
  const params = new URLSearchParams({ minutes: String(minutes), days: String(days) });
  const res = await fetch(`${BASE}/stock/${encodeURIComponent(ticker)}/intraday?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`Failed to load intraday history for ${ticker} (${res.status})`);
  }
  return res.json();
}

export async function fetchVoiceStatus(): Promise<{ configured: boolean }> {
  const res = await fetch(`${BASE}/voice/status`);
  if (!res.ok) return { configured: false };
  return res.json();
}

export async function sendVoiceQuery(
  query: string,
  filters: VoiceFilters,
  results: ScreenResult[]
): Promise<VoiceQueryResponse> {
  const res = await fetch(`${BASE}/voice/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters, results }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? `Voice request failed (${res.status})`);
  }
  return res.json();
}
