import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Icon, Spinner } from './UI';
import { authApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const USER_NAV = [
  { path: '/',               label: 'Home',           icon: 'dashboard', end: true },
  { path: '/search',         label: 'Search Trains',  icon: 'search'              },
  { path: '/my-bookings',    label: 'My Bookings',    icon: 'ticket'              },
  { path: '/train-schedule', label: 'Train Schedule', icon: 'map'                 },
  { path: '/chart-vacancy',  label: 'Seat Chart',     icon: 'seat'                },
  { path: '/pnr-status',     label: 'PNR Status',     icon: 'health'              },
  { path: '/cancel-ticket',  label: 'Cancel Ticket',  icon: 'x'                   },
];

const ADMIN_NAV = [
  { path: '/trains',       label: 'Trains',        icon: 'train'    },
  { path: '/train-routes', label: 'Train Routes',   icon: 'map'      },
  { path: '/stations',     label: 'Stations',      icon: 'station'  },
  { path: '/users',        label: 'Users',         icon: 'users'    },
  { path: '/bookings',     label: 'All Bookings',  icon: 'booking'  },
  { path: '/fares',        label: 'Fares',         icon: 'dollar'   },
  { path: '/settings',     label: 'Settings',      icon: 'settings' },
];

const ACCENT = {
  '/':               '#06b6d4',
  '/search':         '#f43f5e',
  '/my-bookings':    '#f59e0b',
  '/train-schedule': '#8b5cf6',
  '/chart-vacancy':  '#10b981',
  '/pnr-status':     '#06b6d4',
  '/cancel-ticket':  '#f87171',
  '/fares':          '#8b5cf6',
  '/trains':         '#3b82f6',
  '/train-routes':   '#f59e0b',
  '/stations':       '#8b5cf6',
  '/users':          '#10b981',
  '/bookings':       '#f59e0b',
  '/settings':       '#64748b',
};

const PROTECTED_PATHS = ['/bookings', '/cancel-ticket', '/my-bookings'];

// ─── Shared style tokens ──────────────────────────────────────────────────────
const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const iBase = {
  boxSizing: 'border-box', width: '100%', padding: '11px 14px',
  background: '#0a0d14', border: '1.5px solid #1e2433', borderRadius: 9,
  color: '#e2e8f0', fontSize: 13, fontFamily: FONT,
  outline: 'none', transition: 'border-color 0.15s',
};
const lBase = {
  display: 'block', fontSize: 10, fontWeight: 600, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
  fontFamily: FONT,
};

// ─── SignInModal — defined here so Layout can use it ─────────────────────────
function SignInModal({ onClose, onLogin }) {
  const { addToast } = useToast();
  const [mode, setMode]       = useState('login');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw]   = useState(false);
  const [form, setForm]       = useState({ Full_Name: '', Email: '', Password: '', Phone_Number: '' });
  const [errors, setErrors]   = useState({});

  const hc = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (mode === 'register' && !form.Full_Name.trim()) e.Full_Name = 'Required';
    if (!form.Email.trim() || !/\S+@\S+\.\S+/.test(form.Email)) e.Email = 'Valid email required';
    if (!form.Password || form.Password.length < 6) e.Password = 'Min 6 characters';
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await authApi.login({ Email: form.Email, Password: form.Password });
        if (res?.success === false) throw new Error(res.error || res.message || 'Login failed');
        // Handle all Zoho response shapes
        const userData = res?.user ?? res?.data?.data ?? res?.data ?? res;
        if (!userData || typeof userData !== 'object' || Array.isArray(userData)) {
          throw new Error('Unexpected server response. Please try again.');
        }
        sessionStorage.setItem('rail_user', JSON.stringify(userData));
        addToast(`Welcome back, ${userData.Full_Name || userData.Email || 'User'}!`, 'success');
        onLogin(userData);
        onClose();
      } else {
        const res = await authApi.register({
          Full_Name: form.Full_Name, Email: form.Email,
          Password: form.Password, Phone_Number: form.Phone_Number,
        });
        if (res?.success === false) throw new Error(res.error || res.message || 'Registration failed');
        addToast('Account created! Please sign in.', 'success');
        setMode('login');
        setForm(f => ({ ...f, Full_Name: '', Password: '', Phone_Number: '' }));
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false); // always resets — no frozen spinner
    }
  };

  return (
    // Backdrop — click outside to close
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, fontFamily: FONT,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 400, background: '#0e1117',
        border: '1px solid #1e2433', borderRadius: 14, padding: 28,
        boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9', fontFamily: FONT, marginBottom: 3 }}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </div>
            <div style={{ fontSize: 12, color: '#64748b', fontFamily: FONT }}>
              {mode === 'login' ? 'Sign in to book and manage tickets' : 'Register a new passenger account'}
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #1e2433', background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ×
          </button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#080b11', border: '1px solid #1e2433', borderRadius: 9, padding: 3, marginBottom: 20, gap: 3 }}>
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => { setMode(t); setErrors({}); }}
              style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, background: mode === t ? '#2563eb' : 'transparent', color: mode === t ? '#fff' : '#64748b', transition: 'all 0.15s' }}>
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <div>
              <label style={lBase}>Full Name</label>
              <input name="Full_Name" value={form.Full_Name} onChange={hc} placeholder="Rahul Sharma"
                style={{ ...iBase, borderColor: errors.Full_Name ? '#ef4444' : '#1e2433' }}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = errors.Full_Name ? '#ef4444' : '#1e2433'} />
              {errors.Full_Name && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Full_Name}</p>}
            </div>
          )}
          <div>
            <label style={lBase}>Email Address</label>
            <input name="Email" value={form.Email} onChange={hc} type="email" placeholder="you@example.com"
              style={{ ...iBase, borderColor: errors.Email ? '#ef4444' : '#1e2433' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'}
              onBlur={e => e.target.style.borderColor = errors.Email ? '#ef4444' : '#1e2433'} />
            {errors.Email && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Email}</p>}
          </div>
          <div>
            <label style={lBase}>Password</label>
            <div style={{ position: 'relative' }}>
              <input name="Password" value={form.Password} onChange={hc}
                type={showPw ? 'text' : 'password'} placeholder="Min. 6 characters"
                style={{ ...iBase, borderColor: errors.Password ? '#ef4444' : '#1e2433', paddingRight: 52 }}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = errors.Password ? '#ef4444' : '#1e2433'}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} />
              <button onClick={() => setShowPw(s => !s)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 11, fontFamily: FONT, padding: '2px 4px' }}>
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
            {errors.Password && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Password}</p>}
          </div>
          {mode === 'register' && (
            <div>
              <label style={lBase}>Phone Number</label>
              <input name="Phone_Number" value={form.Phone_Number} onChange={hc} type="tel" placeholder="9876543210"
                style={{ ...iBase, borderColor: '#1e2433' }}
                onFocus={e => e.target.style.borderColor = '#2563eb'}
                onBlur={e => e.target.style.borderColor = '#1e2433'} />
            </div>
          )}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 9, border: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: loading ? '#1e2433' : '#2563eb', color: loading ? '#4b5563' : '#fff', transition: 'background 0.15s' }}>
          {loading
            ? <><Spinner size={15} color="#4b5563" />{mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
            : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#64748b', fontFamily: FONT }}>
          {mode === 'login'
            ? <>No account?{' '}<span onClick={() => { setMode('register'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Register here</span></>
            : <>Have an account?{' '}<span onClick={() => { setMode('login'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>}
        </p>
      </div>
    </div>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function Layout({ children, user, onLogin, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);

  const sidebarW     = collapsed ? '72px' : '240px';
  const avatarLetter = user?.Full_Name?.charAt(0)?.toUpperCase() || 'A';

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
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>RailAdmin</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Ticketing System</div>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto' }}>

          {/* ── Passenger section ── */}
          {!collapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '6px 12px 4px', fontFamily: FONT }}>
              Passenger
            </div>
          )}
          {USER_NAV.map(item => {
            const acc      = ACCENT[item.path] || '#3b82f6';
            const isLocked = PROTECTED_PATHS.includes(item.path) && !user;
            return (
              <NavLink key={item.path} to={item.path} end={item.end}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 11,
                  padding: '9px 12px', borderRadius: 10,
                  textDecoration: 'none',
                  background: isActive ? `${acc}18` : 'transparent',
                  color: isActive ? acc : isLocked ? 'var(--text-faint)' : 'var(--text-muted)',
                  fontWeight: isActive ? 700 : 500, fontSize: 13,
                  borderLeft: `2px solid ${isActive ? acc : 'transparent'}`,
                  overflow: 'hidden', whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                })}>
                <Icon name={item.icon} size={17} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {!collapsed && isLocked && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 6, background: '#1a1f2e', color: '#4a5568', border: '1px solid #2d3748', letterSpacing: '0.04em', flexShrink: 0 }}>
                    LOGIN
                  </span>
                )}
              </NavLink>
            );
          })}

          {/* ── Divider ── */}
          <div style={{ height: 1, background: 'var(--border)', margin: '10px 8px' }} />

          {/* ── Admin section ── */}
          {!collapsed && (
            <div style={{ fontSize: 9, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '2px 12px 4px', fontFamily: FONT }}>
              Admin
            </div>
          )}
          {ADMIN_NAV.map(item => {
            const acc = ACCENT[item.path] || '#3b82f6';
            return (
              <NavLink key={item.path} to={item.path}
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
              v1.0.0 · Flask / Zoho
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
            {/* API status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', boxShadow: '0 0 0 2px rgba(74,222,128,0.2)', display: 'inline-block', animation: 'pulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>API Connected</span>
            </div>

            <div style={{ width: 1, height: 22, background: 'var(--border)' }} />

            {/* Logged in */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff', fontFamily: 'var(--font-display)' }}>
                  {avatarLetter}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{user.Full_Name || 'User'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{user.Email || ''}</span>
                </div>
                <button onClick={onLogout} title="Logout"
                  style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: '#2a0f0f', border: '1px solid #ef444430', color: '#f87171', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '0.75'; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
                  <Icon name="logout" size={15} />
                </button>
              </div>
            ) : (
              /* Guest — Sign In button */
              <button
                onClick={() => setShowSignIn(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59,130,246,0.3)', transition: 'opacity 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
                <Icon name="users" size={14} />
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Page content */}
        <main style={{ flex: 1, padding: '32px', maxWidth: 1400, width: '100%', animation: 'fadeIn 0.2s ease' }}>
          {children}
        </main>
      </div>

      {/* Sign In modal — rendered at root so it overlays everything */}
      {showSignIn && (
        <SignInModal
          onClose={() => setShowSignIn(false)}
          onLogin={(userData) => { onLogin?.(userData); setShowSignIn(false); }}
        />
      )}
    </div>
  );
}

// ─── Breadcrumb ───────────────────────────────────────────────────────────────
function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const labels = {
    trains: 'Trains', 'train-routes': 'Train Routes',
    stations: 'Stations', users: 'Users',
    bookings: 'Bookings', search: 'Search Trains',
    'pnr-status': 'PNR Status', 'cancel-ticket': 'Cancel Ticket',
    'my-bookings': 'My Bookings', 'train-schedule': 'Train Schedule',
    'chart-vacancy': 'Seat Chart', fares: 'Fares', settings: 'Settings',
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}>RailAdmin</span>
      {segments.length === 0
        ? <><Icon name="chevronRight" size={12} style={{ color: 'var(--text-faint)' }} /><span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Overview</span></>
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