import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProviders } from './shared/providers/AppProviders';
import { useAuth } from './shared/auth/AuthContext';
import { AuthLayout } from './layouts/AuthLayout';
import { MainLayout } from './layouts/MainLayout';
import { HomePage } from './routes/HomePage';
import { SearchPage } from './routes/SearchPage';
import { MapPage } from './routes/MapPage';
import { AdminPage } from './routes/AdminPage';

/**
 * Auth gate. Until the session resolves we show nothing decisive (avoids a
 * flash of the login screen for an already-signed-in user); with no session we
 * render the login card; otherwise the routed app. There is no signup route
 * (AGENTS.md §3.10).
 */
function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return <div role="status">Loading…</div>;
  }
  if (session === null) {
    return <AuthLayout />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<MainLayout />}>
          <Route index element={<HomePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="map" element={<MapPage />} />
          <Route path="admin" element={<AdminPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export function App() {
  return (
    <AppProviders>
      <Gate />
    </AppProviders>
  );
}

export default App;
