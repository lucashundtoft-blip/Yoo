import { NavLink } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { WatchlistIcon, PortfolioIcon, OrdersIcon, ReplayIcon, FuturesIcon, AlertsIcon } from './TabIcons';

// Standalone static page (not a client-side route) -- a plain <a> so the
// browser does a real navigation instead of react-router swallowing it.
const REPLAY_DESK_HREF = '/replay-desk.html';

const TABS = [
  { to: '/', end: true, label: 'Watchlist', Icon: WatchlistIcon },
  { to: '/portfolio', end: false, label: 'Portfolio', Icon: PortfolioIcon },
  { to: '/orders', end: false, label: 'Orders', Icon: OrdersIcon },
  { to: '/replay', end: false, label: 'Replay', Icon: ReplayIcon },
  { to: '/futures', end: false, label: 'Futures', Icon: FuturesIcon },
  { to: '/alerts', end: false, label: 'Alerts', Icon: AlertsIcon },
];

export function NavBar() {
  return (
    <>
      <header className="navbar">
        <div className="brand">
          Yoo<span>Trade</span>
        </div>
        <nav>
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')}>
              {tab.label}
            </NavLink>
          ))}
          <a href={REPLAY_DESK_HREF}>Replay Desk</a>
        </nav>
        <SearchBar />
      </header>

      <nav className="bottom-tabs">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.end} className={({ isActive }) => (isActive ? 'active' : '')}>
            {({ isActive }) => (
              <>
                <tab.Icon active={isActive} />
                <span>{tab.label}</span>
              </>
            )}
          </NavLink>
        ))}
        <a href={REPLAY_DESK_HREF}>
          <ReplayIcon active={false} />
          <span>Desk</span>
        </a>
      </nav>
    </>
  );
}
