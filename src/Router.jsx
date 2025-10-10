import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import OverviewPage from './pages/OverviewPage';
import PlatformStatsPage from './pages/PlatformStatsPage';
import AnalyticsPage from './pages/AnalyticsPage';
import AudiencePage from './pages/AudiencePage';
import GeographicPage from './pages/GeographicPage';
import EarningsPage from './pages/EarningsPage';
import App from './App';
import { useAuth } from './hooks/useAuth';

const AppRouter = () => {
  const { artistName, isAdmin, logout } = useAuth();

  return (
    <HashRouter>
      <Routes>
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route
          path="/dashboard"
          element={<DashboardLayout artistName={artistName} isAdmin={isAdmin} logout={logout} />}
        >
          <Route index element={<OverviewPage artistName={artistName} isAdmin={isAdmin} />} />
          <Route path="tracks" element={<App artistName={artistName} isAdmin={isAdmin} />} />
          <Route path="analytics" element={<AnalyticsPage artistName={artistName} isAdmin={isAdmin} />} />
          <Route path="audience" element={<AudiencePage artistName={artistName} isAdmin={isAdmin} />} />
          <Route path="geographic" element={<GeographicPage artistName={artistName} isAdmin={isAdmin} />} />
          <Route path="earnings" element={<EarningsPage artistName={artistName} isAdmin={isAdmin} />} />
          {isAdmin && (
            <Route path="platform" element={<PlatformStatsPage />} />
          )}
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default AppRouter;
