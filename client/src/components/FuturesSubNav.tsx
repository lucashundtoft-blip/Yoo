import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/futures', label: 'Heat Map' },
  { to: '/futures-portfolio', label: 'Positions' },
  { to: '/futures-orders', label: 'Orders' },
];

export function FuturesSubNav() {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      {TABS.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end className={({ isActive }) => (isActive ? 'active' : '')}>
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
