import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/futures', label: 'Heat Map' },
  { to: '/futures-guide', label: 'Guide' },
  { to: '/futures-portfolio', label: 'Positions' },
  { to: '/futures-orders', label: 'Orders' },
];

// Replay is a single standalone static page (not a client-side route) --
// a plain <a> so the browser does a real navigation instead of
// react-router swallowing it.
const REPLAY_HREF = '/replay-desk.html';

export function FuturesSubNav() {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/futures'} className={({ isActive }) => (isActive ? 'active' : '')}>
          {tab.label}
        </NavLink>
      ))}
      <a href={REPLAY_HREF}>Replay</a>
    </div>
  );
}
