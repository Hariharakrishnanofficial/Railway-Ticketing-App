/**
 * PassengerHome.jsx
 * Landing page shown to logged-in passengers at "/".
 * Quick-access cards for all passenger features.
 */

import { useNavigate } from 'react-router-dom';
import { Icon } from '../components/UI';

const CARDS = [
  { path: '/ai-assistant',   icon: 'zap',     label: 'AI Assistant',   desc: 'AI-powered booking & logs',       color: '#10b981' },
  { path: '/search',         icon: 'search',  label: 'Search Trains',  desc: 'Find trains between stations',    color: '#f43f5e' },
  { path: '/my-bookings',    icon: 'ticket',  label: 'My Bookings',    desc: 'View all your bookings',          color: '#f59e0b' },
  { path: '/pnr-status',     icon: 'health',  label: 'PNR Status',     desc: 'Track your booking by PNR',       color: '#06b6d4' },
  { path: '/train-schedule', icon: 'map',     label: 'Train Schedule', desc: 'Check train timetables',          color: '#8b5cf6' },
  { path: '/cancel-ticket',  icon: 'x',       label: 'Cancel Ticket',  desc: 'Cancel a booking & get refund',   color: '#f87171' },
];

export default function PassengerHome({ user }) {
  const navigate = useNavigate();
  const name = user?.Full_Name || user?.Email?.split('@')[0] || 'Passenger';

  return (
    <div>
      {/* Welcome banner */}
      <div style={{ marginBottom: 32, padding: '28px 32px', borderRadius: 16, background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.08))', border: '1px solid rgba(59,130,246,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              Welcome back, {name}!
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3 }}>
              {user?.Email} · Passenger Account
            </div>
          </div>
        </div>
      </div>

      {/* Quick access cards */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: '0 0 18px', fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
          Quick Actions
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {CARDS.map(card => (
            <button key={card.path} onClick={() => navigate(card.path)}
              style={{ padding: '22px 20px', borderRadius: 14, border: `1px solid ${card.color}22`, background: `${card.color}0a`, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = `${card.color}18`; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 8px 24px ${card.color}20`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${card.color}0a`; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}>
              <div style={{ width: 40, height: 40, borderRadius: 11, background: `${card.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                <Icon name={card.icon} size={20} style={{ color: card.color }} />
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 5 }}>{card.label}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{card.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
