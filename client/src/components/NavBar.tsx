import { NavLink } from 'react-router-dom';
import { SearchBar } from './SearchBar';
import { WatchlistIcon, PortfolioIcon, OrdersIcon, ReplayIcon, FuturesIcon } from './TabIcons';

const TABS = [
  { to: '/', end: true, label: 'Watchlist', Icon: WatchlistIcon },
  { to: '/portfolio', end: false, label: 'Portfolio', Icon: PortfolioIcon },
  { to: '/orders', end: false, label: 'Orders', Icon: OrdersIcon },
  { to: '/replay', end: false, label: 'Replay', Icon: ReplayIcon },
  { to: '/futures', end: false, label: 'Futures', Icon: FuturesIcon },
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
      </nav>
    </>
  );
}
