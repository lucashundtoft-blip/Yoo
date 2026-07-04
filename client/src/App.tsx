import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { WatchlistPage } from './pages/WatchlistPage';
import { StockDetailPage } from './pages/StockDetailPage';
import { PortfolioPage } from './pages/PortfolioPage';
import { OrdersPage } from './pages/OrdersPage';
import { ReplayPage } from './pages/ReplayPage';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <NavBar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<WatchlistPage />} />
            <Route path="/stock/:symbol" element={<StockDetailPage />} />
            <Route path="/portfolio" element={<PortfolioPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/replay" element={<ReplayPage />} />
            <Route path="/replay/:symbol" element={<ReplayPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
