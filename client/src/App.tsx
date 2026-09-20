import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { FuturesHeatmapPage } from './pages/FuturesHeatmapPage';
import { FuturesDetailPage } from './pages/FuturesDetailPage';
import { FuturesPortfolioPage } from './pages/FuturesPortfolioPage';
import { FuturesOrdersPage } from './pages/FuturesOrdersPage';
import { FuturesGuidePage } from './pages/FuturesGuidePage';
import { AlertsPage } from './pages/AlertsPage';

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <NavBar />
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Navigate to="/futures" replace />} />
            <Route path="/futures" element={<FuturesHeatmapPage />} />
            <Route path="/futures/:symbol" element={<FuturesDetailPage />} />
            <Route path="/futures-guide" element={<FuturesGuidePage />} />
            <Route path="/futures-portfolio" element={<FuturesPortfolioPage />} />
            <Route path="/futures-orders" element={<FuturesOrdersPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
