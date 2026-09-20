import { NavLink } from 'react-router-dom';
import { FuturesIcon, AlertsIcon } from './TabIcons';

const TABS = [
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
        </nav>
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
