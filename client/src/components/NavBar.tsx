import { NavLink } from 'react-router-dom';
import { SearchBar } from './SearchBar';

export function NavBar() {
  return (
    <header className="navbar">
      <div className="brand">
        Yoo<span>Trade</span>
      </div>
      <nav>
        <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Watchlist
        </NavLink>
        <NavLink to="/portfolio" className={({ isActive }) => (isActive ? 'active' : '')}>
          Portfolio
        </NavLink>
        <NavLink to="/orders" className={({ isActive }) => (isActive ? 'active' : '')}>
          Orders
        </NavLink>
        <NavLink to="/replay" className={({ isActive }) => (isActive ? 'active' : '')}>
          Replay
        </NavLink>
      </nav>
      <SearchBar />
    </header>
  );
}
