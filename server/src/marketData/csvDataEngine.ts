// Streams historical candle files (CSV or newline-delimited JSON) off disk
// line-by-line instead of reading the whole file into memory, so large
// intraday/tick dumps don't blow up server RAM just to feed the replay tape.
import fs from 'node:fs';
import readline from 'node:readline';
import type { Candle } from './types.js';

export interface DatasetFile {
  /** File name on disk, e.g. "AAPL_5min.csv" -- used as the dataset id. */
  file: string;
  symbol: string;
  extension: 'csv' | 'json' | 'jsonl';
  rowCount: number;
  sizeBytes: number;
}

const CSV_COLUMNS = ['time', 'open', 'high', 'low', 'close', 'volume'] as const;

function toUnixSeconds(raw: string): number {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    // Heuristic: 13-digit numbers are millisecond timestamps.
    return raw.length >= 13 ? Math.round(n / 1000) : Math.round(n);
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw new Error(`Unparseable timestamp: "${raw}"`);
  return Math.round(parsed / 1000);
}

function parseCsvLine(line: string, header: string[]): Candle | null {
  const cells = line.split(',').map((c) => c.trim());
  if (cells.length < header.length || cells.every((c) => c === '')) return null;
  const row: Record<string, string> = {};
  header.forEach((col, i) => (row[col] = cells[i]));
  return {
    time: toUnixSeconds(row.time),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume ?? 0),
  };
}

function parseJsonLine(line: string): Candle {
  const obj = JSON.parse(line);
  return {
    time: typeof obj.time === 'string' ? toUnixSeconds(obj.time) : Math.round(obj.time),
    open: Number(obj.open),
    high: Number(obj.high),
    low: Number(obj.low),
    close: Number(obj.close),
    volume: Number(obj.volume ?? 0),
  };
}

/**
 * Reads a candle file one line at a time via a readline interface over a
 * file read stream, yielding parsed candles as they're decoded rather than
 * buffering the entire file's text in memory at once.
 */
export async function* streamCandles(filePath: string): AsyncGenerator<Candle> {
  const isJsonLines = filePath.endsWith('.json') || filePath.endsWith('.jsonl');
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  let header: string[] | null = isJsonLines ? [] : null;
  try {
    for await (const rawLine of rl) {
      const line = rawLine.trim();
      if (!line) continue;

      if (isJsonLines) {
        yield parseJsonLine(line);
        continue;
      }

      if (!header) {
        const cells = line.split(',').map((c) => c.trim().toLowerCase());
        header = CSV_COLUMNS.every((col) => cells.includes(col)) ? cells : [...CSV_COLUMNS];
        // If the first line wasn't actually a header (no recognizable column
        // names), fall through and parse it as a data row too.
        if (CSV_COLUMNS.every((col) => cells.includes(col))) continue;
      }
      const candle = parseCsvLine(line, header);
      if (candle) yield candle;
    }
  } finally {
    rl.close();
  }
}

/** Collects a streamed file into an array, sorted ascending by time. */
export async function loadCandleFile(filePath: string): Promise<Candle[]> {
  const candles: Candle[] = [];
  for await (const candle of streamCandles(filePath)) {
    candles.push(candle);
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}

/** Lists candle files available in a directory without loading their contents. */
export async function listDatasets(dir: string): Promise<DatasetFile[]> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => /\.(csv|json|jsonl)$/i.test(f));

  const datasets: DatasetFile[] = [];
  for (const file of entries) {
    const fullPath = `${dir}/${file}`;
    const stat = fs.statSync(fullPath);
    let rowCount = 0;
    // Streamed line count -- avoids materializing the whole file to count rows.
    for await (const _ of streamCandles(fullPath)) rowCount++;

    const extension = file.endsWith('.csv') ? 'csv' : file.endsWith('.jsonl') ? 'jsonl' : 'json';
    const symbol = file.replace(/\.(csv|json|jsonl)$/i, '').split(/[_\-.]/)[0].toUpperCase();
    datasets.push({ file, symbol, extension, rowCount, sizeBytes: stat.size });
  }
  return datasets;
}
