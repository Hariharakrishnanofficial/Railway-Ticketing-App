/**
 * App.jsx — Role-based routing
 *
 * RULES:
 *  - admin@admin.com  → Role === 'Admin'  → AdminLayout + admin routes only
 *  - any other email  → Role === 'User'   → PassengerLayout + passenger routes only
 *  - Not logged in    → LoginPage (full-screen, no sidebar)
 */

import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { SettingsProvider } from './context/SettingsContext';

import AdminLayout from './components/AdminLayout';
import PassengerLayout from './components/PassengerLayout';
import LoginPage from './pages/LoginPage';

// Admin pages
import OverviewPage from './pages/OverviewPage';
import TrainsPage from './pages/TrainsPage';
import StationsPage from './pages/StationsPage';
import UsersPage from './pages/UsersPage';
import BookingsPage from './pages/BookingsPage';
import SettingsPage from './pages/SettingsPage';
import ReportsPage from './pages/ReportsPage';
import InventoryPage from './pages/InventoryPage';
import AdminLogsPage from './pages/AdminLogsPage';
import ZohoExplorerPage from './pages/ZohoExplorerPage';
import AdminDashboard from './pages/AdminDashboard';
import TrainRoutesPage from './pages/TrainRoutesPage';
import MasterDataAdmin from './pages/admin/MasterDataAdmin';

// Passenger pages
import SearchPage from './pages/SearchPage';
import PNRStatus from './pages/PNRStatus';
import CancelTicket from './pages/CancelTicket';
import MyBookings from './pages/MyBookings';
import TrainSchedule from './pages/TrainSchedule';
import ChartVacancy from './pages/ChartVacancy';
import PassengerHome from './pages/PassengerHome';
import ProfilePage from './pages/ProfilePage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import AIChatWidget from './components/AIChatWidget';
import PassengerExplorerPage from './pages/PassengerExplorerPage';
import MCPChatPage from './pages/MCPChatPage';

// ─── Role helper ────────────────────────────────────────
export function isAdmin(user) {
  if (!user) return false;

  const email = (user.Email || '').trim().toLowerCase();

  if (email.endsWith('@admin.com')) return true;
  if ((user.Role || '').toLowerCase() === 'admin') return true;

  return false;
}

import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <AppCore />
    </ErrorBoundary>
  );
}

function AppCore() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('rail_user'));
    } catch {
      return null;
    }
  });

  const handleLogin = (u) => {
    sessionStorage.setItem('rail_user', JSON.stringify(u));
    setUser(u);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('rail_user');
    setUser(null);
  };

  // Not logged in → full-screen login
  if (!user) {
    return (
      <BrowserRouter>
        <ToastProvider>
          <SettingsProvider>
            <Routes>
              <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
            </Routes>
          </SettingsProvider>
        </ToastProvider>
      </BrowserRouter>
    );
  }

  const admin = isAdmin(user);

  return (
    <BrowserRouter>
      <ToastProvider>
        <SettingsProvider>
          <div className="app-container">

            {admin ? (
              <AdminLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<AdminDashboard />} />
                  <Route path="/admin" element={<AdminDashboard />} />
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/routes" element={<TrainRoutesPage />} />
                  <Route path="/admin/routes/new" element={<TrainRoutesPage />} />
                  <Route path="/admin/quotas" element={<MasterDataAdmin />} />
                  <Route path="/admin/quotas/new" element={<MasterDataAdmin />} />
                  <Route path="/admin/fares" element={<MasterDataAdmin />} />
                  <Route path="/admin/fares/new" element={<MasterDataAdmin />} />
                  <Route path="/admin/inventory" element={<MasterDataAdmin />} />
                  <Route path="/admin/inventory/new" element={<MasterDataAdmin />} />
                  <Route path="/train-routes" element={<TrainRoutesPage />} />
                  <Route path="/quotas" element={<MasterDataAdmin />} />
                  <Route path="/fares" element={<MasterDataAdmin />} />
                  <Route path="/inventory" element={<MasterDataAdmin />} />
                  <Route path="/overview" element={<OverviewPage />} />
                  <Route path="/trains" element={<TrainsPage />} />
                  <Route path="/stations" element={<StationsPage />} />
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/bookings" element={<BookingsPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/reports" element={<ReportsPage />} />
                  <Route path="/inventory" element={<InventoryPage />} />
                  <Route path="/admin-logs" element={<AdminLogsPage />} />
                  <Route path="/zoho-explorer" element={<ZohoExplorerPage />} />
                  <Route path="/mcp-chat" element={<MCPChatPage user={user} />} />
                  <Route path="*" element={<Navigate to="/admin" />} />
                </Routes>
              </AdminLayout>
            ) : (
              <PassengerLayout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<PassengerHome user={user} />} />
                  <Route path="/search" element={<SearchPage />} />
                  <Route path="/pnr-status" element={<PNRStatus />} />
                  <Route path="/train-schedule" element={<TrainSchedule />} />
                  <Route path="/chart-vacancy" element={<ChartVacancy />} />
                  <Route path="/my-bookings" element={<MyBookings />} />
                  <Route path="/cancel-ticket" element={<CancelTicket />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  <Route path="/change-password" element={<ChangePasswordPage />} />
                  <Route path="/ai-assistant" element={<PassengerExplorerPage user={user} />} />
                  <Route path="/mcp-chat" element={<MCPChatPage user={user} />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </PassengerLayout>
            )}

            <AIChatWidget user={user} />

          </div>
        </SettingsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;