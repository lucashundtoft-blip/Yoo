interface IconProps {
  active?: boolean;
}

const common = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function WatchlistIcon({ active }: IconProps) {
  return (
    <svg {...common} stroke={active ? '#2f81f7' : '#8b939d'}>
      <path d="M3 12s3.5-6.5 9-6.5S21 12 21 12s-3.5 6.5-9 6.5S3 12 3 12Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function PortfolioIcon({ active }: IconProps) {
  return (
    <svg {...common} stroke={active ? '#2f81f7' : '#8b939d'}>
      <path d="M3 13.5 8 8l4 3.5L21 4" />
      <path d="M14.5 4H21v6.5" />
      <path d="M3 20h18" />
    </svg>
  );
}

export function OrdersIcon({ active }: IconProps) {
  return (
    <svg {...common} stroke={active ? '#2f81f7' : '#8b939d'}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4" />
    </svg>
  );
}

export function ReplayIcon({ active }: IconProps) {
  return (
    <svg {...common} stroke={active ? '#2f81f7' : '#8b939d'}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" fill={active ? '#2f81f7' : '#8b939d'} stroke="none" />
    </svg>
  );
}

export function FuturesIcon({ active }: IconProps) {
  return (
    <svg {...common} stroke={active ? '#2f81f7' : '#8b939d'}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.3" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.3" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.3" />
    </svg>
  );
}
