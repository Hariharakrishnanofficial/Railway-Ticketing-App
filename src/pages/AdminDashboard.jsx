import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { trainRoutesApi, quotasApi, faresApi, extractRecords } from '../services/api';
import { PageHeader, Spinner } from '../components/UI';
import './AdminDashboard.css';

const ACCENT_MAP = {
  'Train Routes':   '#f59e0b',
  'Quotas':         '#8b5cf6',
  'Fares':          '#3b82f6',
  'Inventory':      '#22c55e',
  'Reports':        '#06b6d4',
  'Announcements':  '#f43f5e',
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    totalRoutes: 0,
    totalQuotas: 0,
    totalFares: 0,
    totalInventory: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const [routes, quotas, fares] = await Promise.allSettled([
          trainRoutesApi.getAll(),
          quotasApi.getAll(),
          faresApi.getAll(),
        ]);

        setStats({
          totalRoutes: extractRecords(routes.status === 'fulfilled' ? routes.value : null).length,
          totalQuotas: extractRecords(quotas.status === 'fulfilled' ? quotas.value : null).length,
          totalFares: extractRecords(fares.status === 'fulfilled' ? fares.value : null).length,
          totalInventory: 0,
        });
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const adminModules = [
    {
      title: 'Train Routes',
      description: 'Manage train routes, stops, and schedule priorities',
      icon: '🚂',
      onClick: () => navigate('/admin/routes'),
      stats: `${stats.totalRoutes} routes`,
    },
    {
      title: 'Quotas',
      description: 'Configure passenger quotas and concession types',
      icon: '📋',
      onClick: () => navigate('/admin/quotas'),
      stats: `${stats.totalQuotas} quotas`,
    },
    {
      title: 'Fares',
      description: 'Set and manage ticket fares with dynamic pricing',
      icon: '💰',
      onClick: () => navigate('/admin/fares'),
      stats: `${stats.totalFares} fares`,
    },
    {
      title: 'Inventory',
      description: 'Daily seat ledger and coach availability',
      icon: '📦',
      onClick: () => navigate('/admin/inventory'),
      stats: `${stats.totalInventory} items`,
    },
    {
      title: 'Reports',
      description: 'Revenue analytics and occupancy reports',
      icon: '📊',
      onClick: () => navigate('/reports'),
      stats: 'Analytics',
    },
    {
      title: 'Announcements',
      description: 'Create and manage system announcements',
      icon: '📢',
      onClick: () => navigate('/announcements'),
      stats: 'Active',
    },
  ];

  return (
    <div className="admin-dashboard">
      <PageHeader
        icon="dashboard"
        iconAccent="#ef4444"
        title="Admin Dashboard"
        subtitle="Railway System Configuration & Master Data"
      />

      {loading && (
        <div className="loading">
          <Spinner size={22} /> Loading dashboard…
        </div>
      )}

      <div className="admin-modules-grid">
        {adminModules.map((module) => (
          <div
            key={module.title}
            className="admin-module-card"
            style={{ '--card-accent': ACCENT_MAP[module.title] || 'var(--accent-blue)' }}
            onClick={module.onClick}
          >
            <div className="module-icon">{module.icon}</div>
            <h3>{module.title}</h3>
            <p>{module.description}</p>
            <div className="module-stats">{module.stats}</div>
            <button className="module-btn">Manage →</button>
          </div>
        ))}
      </div>

      <div className="admin-quick-actions">
        <h2>Quick Actions</h2>
        <div className="quick-actions-grid">
          <button onClick={() => navigate('/admin/routes/new')} className="quick-action-btn">
            + New Route
          </button>
          <button onClick={() => navigate('/admin/quotas/new')} className="quick-action-btn">
            + New Quota
          </button>
          <button onClick={() => navigate('/admin/fares/new')} className="quick-action-btn">
            + New Fare
          </button>
        </div>
      </div>
    </div>
  );
}
