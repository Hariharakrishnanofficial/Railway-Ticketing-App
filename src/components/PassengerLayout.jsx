/**
 * PassengerLayout.jsx
 * Sidebar + topbar layout exclusively for Passenger (non-admin) users.
 */

import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon } from './UI';

const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

const PASSENGER_NAV = [
  { path: '/',               label: 'Home',           icon: 'dashboard', end: true },
  { path: '/ai-assistant',   label: 'AI Assistant',   icon: 'zap'                 },
  { path: '/search',         label: 'Search Trains',  icon: 'search'              },
  { path: '/my-bookings',    label: 'My Bookings',    icon: 'ticket'              },
  { path: '/train-schedule', label: 'Train Schedule', icon: 'map'                 },
  { path: '/pnr-status',     label: 'PNR Status',     icon: 'health'              },
  { path: '/cancel-ticket',  label: 'Cancel Ticket',  icon: 'x'                   },
  { path: '/profile',        label: 'My Profile',     icon: 'users'               },
  { path: '/change-password',label: 'Security',       icon: 'settings'            },
  { path: '/mcp-chat',      label: 'MCP Chat',       icon: 'search'              },
];

const ACCENT = {
  '/':               '#06b6d4',
  '/ai-assistant':   '#10b981',
  '/search':         '#f43f5e',
  '/my-bookings':    '#f59e0b',
  '/train-schedule': '#8b5cf6',
  '/pnr-status':     '#06b6d4',
  '/cancel-ticket':  '#f87171',
  '/profile':        '#10b981',
  '/change-password':'#64748b',
  '/mcp-chat':       '#06b6d4',
};

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const labels = {
    search: 'Search Trains', 'pnr-status': 'PNR Status',
    'cancel-ticket': 'Cancel Ticket', 'my-bookings': 'My Bookings',
    'train-schedule': 'Train Schedule', 'chart-vacancy': 'Seat Chart',
    'ai-assistant': 'AI Assistant Explorer',
    'mcp-chat': 'MCP Chat',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>Railway</span>
      {segments.length === 0
        ? <><Icon name="chevronRight" size={12} style={{ color: 'var(--text-faint)' }} /><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Home</span></>
        : segments.map((seg, i) => (
          <span key={seg} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="chevronRight" size={12} style={{ color: 'var(--text-faint)' }} />
            <span style={{ color: i === segments.length - 1 ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === segments.length - 1 ? 600 : 400, textTransform: 'capitalize' }}>
              {labels[seg] || seg}
            </span>
          </span>
        ))
      }
    </div>
  );
}

export default function PassengerLayout({ children, user, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const sidebarW     = collapsed ? '72px' : '240px';
  const avatarLetter = user?.Full_Name?.charAt(0)?.toUpperCase() || user?.Email?.charAt(0)?.toUpperCase() || 'P';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarW, flexShrink: 0,
        background: 'var(--bg-surface)', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 200,
        transition: 'width 0.25s cubic-bezier(.4,0,.2,1)', overflow: 'hidden',
      }}>

        {/* Logo */}
        <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(135deg,#3b82f6,#8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
            <Icon name="train" size={18} style={{ color: '#fff' }} />
          </div>
          {!collapsed && (
            <div style={{ overflow: 'hidden', whiteSpace: 'nowrap' }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>RailBook</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ticketing Portal</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>
          {!collapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 12px 4px', fontFamily: FONT }}>
              Passenger Services
            </div>
          )}
          {PASSENGER_NAV.map(item => {
            const acc = ACCENT[item.path] || '#3b82f6';
            return (
              <NavLink key={item.path} to={item.path} end={item.end}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: '9px 12px', borderRadius: 10,
                  textDecoration: 'none',
                  background: isActive ? `${acc}18` : 'transparent',
                  color: isActive ? acc : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 500, fontSize: 13,
                  borderLeft: `2px solid ${isActive ? acc : 'transparent'}`,
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                })}>
                <Icon name={item.icon} size={17} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)' }}>
          {!collapsed && (
            <div style={{ padding: '0 4px 8px', fontSize: 10, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
              v1.0.0 · RailBook
            </div>
          )}
          <button onClick={() => setCollapsed(c => !c)}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 10, cursor: 'pointer', fontSize: 13, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
            <Icon name="menu" size={16} style={{ flexShrink: 0 }} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', marginLeft: sidebarW, transition: 'margin-left 0.25s cubic-bezier(.4,0,.2,1)', minWidth: 0 }}>

        {/* Topbar */}
        <header style={{ height: 64, background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', position: 'sticky', top: 0, zIndex: 100 }}>
          <Breadcrumb />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.2)', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Live</span>
            </div>
            <div style={{ width: 1, height: 22, background: 'var(--border)' }} />
            {/* User info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>
                {avatarLetter}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{user?.Full_Name || 'Passenger'}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{user?.Email || ''}</span>
              </div>
              <button onClick={onLogout} title="Logout"
                style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: '#2a0f0f', border: '1px solid #ef444430', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="logout" size={15} />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '32px', maxWidth: 1400, width: '100%', animation: 'fadeIn 0.2s ease' }}>
          {children}
        </main>
      </div>
    </div>
  );
}
