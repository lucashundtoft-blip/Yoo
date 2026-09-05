export function formatCurrency(value: number, digits = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value)}`;
}

export function changeClass(value: number): 'up' | 'down' | 'flat' {
  if (value > 0) return 'up';
  if (value < 0) return 'down';
  return 'flat';
}

/** Human-readable label for an active bracket's stop/target, shared by the
 * stock and futures order panels. A trailing stop shows its live-updated
 * current level (stopLossPrice) alongside the percent, not just the percent,
 * since that level moves as the position moves in its favor. */
export function formatBracketLabel(b: {
  takeProfitPrice: number | null;
  stopLossPrice: number | null;
  trailPercent: number | null;
}): string {
  const parts: string[] = [];
  if (b.takeProfitPrice != null) parts.push(`TP ${formatCurrency(b.takeProfitPrice)}`);
  if (b.trailPercent != null) {
    parts.push(`Trailing ${b.trailPercent}%${b.stopLossPrice != null ? ` (stop ${formatCurrency(b.stopLossPrice)})` : ''}`);
  } else if (b.stopLossPrice != null) {
    parts.push(`SL ${formatCurrency(b.stopLossPrice)}`);
  }
  return parts.join(' / ');
}

/** Compact K/M/B abbreviation for large unitless numbers, e.g. a PVT value
 * -- matches how trading apps display cumulative volume-weighted figures. */
export function formatCompact(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(2)}K`;
  return `${sign}${abs.toFixed(2)}`;
}
