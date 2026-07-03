import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type SearchResult } from '../api';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .search(q)
        .then((r) => {
          if (!cancelled) setResults(r);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function goTo(symbol: string) {
    setQuery('');
    setResults([]);
    setOpen(false);
    navigate(`/stock/${symbol}`);
  }

  return (
    <div className="search-wrap" ref={containerRef}>
      <input
        className="search-input"
        placeholder="Search stocks (e.g. AAPL, Tesla)"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && query.trim()) {
            goTo(results[0]?.symbol ?? query.trim().toUpperCase());
          }
        }}
      />
      {open && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((r) => (
            <div key={r.symbol} className="search-dropdown-item" onClick={() => goTo(r.symbol)}>
              <strong>{r.symbol}</strong>
              <span style={{ color: 'var(--text-dim)' }}>{r.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
