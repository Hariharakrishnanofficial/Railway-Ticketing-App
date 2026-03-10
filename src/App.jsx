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

import AdminLayout     from './components/AdminLayout';
import PassengerLayout from './components/PassengerLayout';
import LoginPage       from './pages/LoginPage';

// Admin pages
import OverviewPage    from './pages/OverviewPage';
import TrainsPage      from './pages/TrainsPage';
import StationsPage    from './pages/StationsPage';
import UsersPage       from './pages/UsersPage';
import BookingsPage    from './pages/BookingsPage';
import SettingsPage    from './pages/SettingsPage';
import FaresPage       from './pages/FaresPage';
import TrainRoutesPage from './pages/TrainRoutesPage';

// Passenger pages
import SearchPage      from './pages/SearchPage';
import PNRStatus       from './pages/PNRStatus';
import CancelTicket    from './pages/CancelTicket';
import MyBookings      from './pages/MyBookings';
import TrainSchedule   from './pages/TrainSchedule';
import ChartVacancy    from './pages/ChartVacancy';
import PassengerHome   from './pages/PassengerHome';

// ─── Role helper (exported for reuse) ────────────────────────────────────────
// Admin access is granted to:
//   1. Any email ending with @admin.com  (admin@admin.com, test@admin.com, etc.)
//   2. Any user whose Role field === 'Admin'
export function isAdmin(user) 
{
  if (!user) return false;
  const email = (user.Email || '').trim().toLowerCase();
  if (email.endsWith('@admin.com')) return true;
  if ((user.Role || '').toLowerCase() === 'admin') return true;
  return false;
}

export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('rail_user')); }
    catch { return null; }
  });

  const handleLogin  = (u) => { sessionStorage.setItem('rail_user', JSON.stringify(u)); setUser(u); };
  const handleLogout = ()  => { sessionStorage.removeItem('rail_user'); setUser(null); };

  // Not logged in → full-screen login
  if (!user) {
    return (
      <BrowserRouter>
        <ToastProvider>
          <Routes>
            <Route path="*" element={<LoginPage onLogin={handleLogin} />} />
          </Routes>
        </ToastProvider>
      </BrowserRouter>
    );
  }

  const admin = isAdmin(user);

  // Admin section
  if (admin) {
    return (
      <BrowserRouter>
        <ToastProvider>
          <AdminLayout user={user} onLogout={handleLogout}>
            <Routes>
              <Route path="/"             element={<OverviewPage />} />
              <Route path="/overview"     element={<OverviewPage />} />
              <Route path="/trains"       element={<TrainsPage />} />
              <Route path="/train-routes" element={<TrainRoutesPage />} />
              <Route path="/stations"     element={<StationsPage />} />
              <Route path="/users"        element={<UsersPage />} />
              <Route path="/bookings"     element={<BookingsPage />} />
              <Route path="/fares"        element={<FaresPage />} />
              <Route path="/settings"     element={<SettingsPage />} />
              <Route path="*"             element={<Navigate to="/" replace />} />
            </Routes>
          </AdminLayout>
        </ToastProvider>
      </BrowserRouter>
    );
  }

  // Passenger section
  return (
    <BrowserRouter>
      <ToastProvider>
        <PassengerLayout user={user} onLogout={handleLogout}>
          <Routes>
            <Route path="/"               element={<PassengerHome user={user} />} />
            <Route path="/search"         element={<SearchPage />} />
            <Route path="/pnr-status"     element={<PNRStatus />} />
            <Route path="/train-schedule" element={<TrainSchedule />} />
            {/* <Route path="/chart-vacancy"  element={<ChartVacancy />} /> */}
            <Route path="/my-bookings"    element={<MyBookings />} />
            <Route path="/cancel-ticket"  element={<CancelTicket />} />
            <Route path="*"               element={<Navigate to="/" replace />} />
          </Routes>
        </PassengerLayout>
      </ToastProvider>
    </BrowserRouter>
  );
}