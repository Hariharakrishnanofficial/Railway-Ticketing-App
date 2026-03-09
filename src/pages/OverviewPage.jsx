import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { stationsApi, trainsApi, usersApi, bookingsApi, systemApi, extractRecords } from '../services/api';
import { StatCard, Card, Badge, Icon, Spinner } from '../components/UI';

const QUICK_LINKS = [
  { to: '/trains',   label: 'Manage Trains',   icon: 'train',   accent: 'var(--accent-blue)'   },
  { to: '/stations', label: 'Manage Stations', icon: 'station', accent: 'var(--accent-purple)' },
  { to: '/users',    label: 'Manage Users',    icon: 'users',   accent: 'var(--accent-green)'  },
  { to: '/bookings', label: 'Manage Bookings', icon: 'booking', accent: 'var(--accent-amber)'  },
  { to: '/search',   label: 'Train Search',    icon: 'search',  accent: 'var(--accent-rose)'   },
];

function resolveBookingField(row, pascal, snake) {
  return row[pascal] ?? row[snake] ?? '—';
}

export default function OverviewPage() {
  const [counts, setCounts] = useState({ stations: 0, trains: 0, users: 0, bookings: 0 });
  const [health, setHealth] = useState(null);
  const [recentBookings, setRecentBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [healthLoading, setHealthLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      const [s, t, u, b] = await Promise.allSettled([
        stationsApi.getAll(), trainsApi.getAll(),
        usersApi.getAll(), bookingsApi.getAll(),
      ]);
      const getCount = (r) => r.status === 'fulfilled' ? extractRecords(r.value).length : 0;
      const getRows  = (r) => r.status === 'fulfilled' ? extractRecords(r.value) : [];

      setCounts({
        stations: getCount(s), trains: getCount(t),
        users:    getCount(u), bookings: getCount(b),
      });
      setRecentBookings(getRows(b).slice(0, 6));
      setLoading(false);
    };

    const fetchHealth = async () => {
      try { setHealth(await systemApi.health()); }
      catch { setHealth(null); }
      setHealthLoading(false);
    };

    fetchAll();
    fetchHealth();
  }, []);

  const stats = [
    { label: 'Total Stations',   value: counts.stations, icon: 'station', accent: 'var(--accent-purple)' },
    { label: 'Active Trains',    value: counts.trains,   icon: 'train',   accent: 'var(--accent-blue)'   },
    { label: 'Registered Users', value: counts.users,    icon: 'users',   accent: 'var(--accent-green)'  },
    { label: 'Total Bookings',   value: counts.bookings, icon: 'booking', accent: 'var(--accent-amber)'  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
          System Overview
        </h1>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>
          Live metrics and quick access to all modules
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 16 }}>
        {stats.map((s) => <StatCard key={s.label} {...s} loading={loading} />)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Quick Links */}
        <Card>
          <h3 style={{ margin: '0 0 18px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Quick Access</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {QUICK_LINKS.map((link) => (
              <Link key={link.to} to={link.to} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                textDecoration: 'none', background: 'var(--bg-inset)', transition: 'border-color 0.15s, background 0.15s',
              }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = link.accent; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: `color-mix(in srgb, ${link.accent} 18%, transparent)`, color: link.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name={link.icon} size={17} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{link.label}</span>
                <Icon name="chevronRight" size={14} style={{ marginLeft: 'auto', color: 'var(--text-faint)' }} />
              </Link>
            ))}
          </div>
        </Card>

        {/* API Health */}
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>API Health</h3>
            {health && <Badge status={health.status} />}
          </div>
          {healthLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
          ) : health ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {health.zoho_credentials_present && Object.entries(health.zoho_credentials_present).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: 'var(--bg-inset)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: v ? '#4ade80' : '#f87171', boxShadow: v ? '0 0 6px rgba(74,222,128,0.5)' : '0 0 6px rgba(248,113,113,0.5)' }} />
                </div>
              ))}
              <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                Checked: {health.timestamp ? new Date(health.timestamp).toLocaleString() : '—'}
              </p>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>Unable to reach API</div>
          )}
        </Card>
      </div>

      {/* Recent Bookings */}
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Recent Bookings</h3>
          <Link to="/bookings" style={{ fontSize: 13, color: 'var(--accent-blue)', fontWeight: 600, textDecoration: 'none' }}>View all →</Link>
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
        ) : recentBookings.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>No bookings yet</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['PNR', 'Train ID', 'Date', 'Class', 'Pax', 'Status', 'Payment'].map(h => (
                    <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b, i) => (
                  <tr key={b.ID || i} style={{ borderBottom: '1px solid #0e1420' }}>
                    <td style={{ padding: '11px 12px', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-blue)' }}>
                      {resolveBookingField(b, 'Booking_Reference', 'booking_reference')}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {resolveBookingField(b, 'Train_ID', 'train_id')}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {resolveBookingField(b, 'Journey_Date', 'journey_date')}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                      {resolveBookingField(b, 'Seat_Class', 'seat_class')}
                    </td>
                    <td style={{ padding: '11px 12px', fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {resolveBookingField(b, 'Passenger_Count', 'passenger_count')}
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <Badge status={resolveBookingField(b, 'Booking_Status', 'booking_status')} />
                    </td>
                    <td style={{ padding: '11px 12px' }}>
                      <Badge status={resolveBookingField(b, 'Payment_Status', 'payment_status')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
