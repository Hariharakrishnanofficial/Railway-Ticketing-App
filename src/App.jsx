import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';

import OverviewPage   from './pages/OverviewPage';
import TrainsPage     from './pages/TrainsPage';
import StationsPage   from './pages/StationsPage';
import UsersPage      from './pages/UsersPage';
import BookingsPage   from './pages/BookingsPage';
import SearchPage     from './pages/SearchPage';
import PNRStatus      from './pages/PNRStatus';
import CancelTicket   from './pages/CancelTicket';
import SettingsPage   from './pages/SettingsPage';
import FaresPage      from './pages/FaresPage';
import MyBookings     from './pages/MyBookings';
import TrainSchedule  from './pages/TrainSchedule';
import ChartVacancy   from './pages/ChartVacancy';
import TrainRoutesPage from './pages/TrainRoutesPage';


export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('rail_user')); }
    catch { return null; }
  });

  const handleLogin  = (u) => { sessionStorage.setItem('rail_user', JSON.stringify(u)); setUser(u); };
  const handleLogout = ()  => { sessionStorage.removeItem('rail_user'); setUser(null); };

  return (
    <BrowserRouter>
      <ToastProvider>
        <Layout user={user} onLogin={handleLogin} onLogout={handleLogout}>
          <Routes>
            {/* ── Public routes ── */}
            <Route path="/"               element={<SearchPage />} />
            <Route path="/trains"         element={<TrainsPage />} />
            <Route path="/stations"       element={<StationsPage />} />
            <Route path="/users"          element={<UsersPage />} />
            <Route path="/settings"       element={<SettingsPage />} />
            <Route path="/fares"          element={<FaresPage />} />
            {/* <Route path="/search"         element={<SearchPage />} /> */}
            <Route path="/pnr-status"     element={<PNRStatus />} />
            <Route path="/train-schedule" element={<TrainSchedule />} />
            <Route path="/chart-vacancy"  element={<ChartVacancy />} />
            <Route path="/overview"  element={<OverviewPage />} />
            <Route path="/train-routes" element={<TrainRoutesPage />} />
            

            {/* ── Protected routes (require login) ── */}
            <Route path="/bookings"       element={<RequireAuth onLogin={handleLogin}><BookingsPage /></RequireAuth>} />
            <Route path="/cancel-ticket"  element={<RequireAuth onLogin={handleLogin}><CancelTicket /></RequireAuth>} />
            <Route path="/my-bookings"    element={<RequireAuth onLogin={handleLogin}><MyBookings /></RequireAuth>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </ToastProvider>
    </BrowserRouter>
  );
}
