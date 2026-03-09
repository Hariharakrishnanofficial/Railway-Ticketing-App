import { useState } from 'react';

// ─── Icon ─────────────────────────────────────────────────────────────────────
const ICONS = {
  train: (
    <><rect x="4" y="3" width="16" height="13" rx="2" /><path d="M4 10h16" /><path d="M8 19l-2 3" /><path d="M16 19l2 3" /><path d="M8 13v3" /><path d="M16 13v3" /></>
  ),
  station: (
    <><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></>
  ),
  users: (
    <><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" /></>
  ),
  settings: ( 
  <> <circle cx="12" cy="12" r="3" /> <path d="M19.4 15a1.65 1.65 0 000-6l2.1-1.6-2-3.5-2.5 1a6.5 6.5 0 00-3-1.7L13 1h-2l-.9 2.2a6.5 6.5 0 00-3 1.7l-2.5-1-2 3.5L4.6 9a1.65 1.65 0 000 6l-2.1 1.6 2 3.5 2.5-1a6.5 6.5 0 003 1.7L11 23h2l.9-2.2a6.5 6.5 0 003-1.7l2.5 1 2-3.5L19.4 15z" /> </> 
),
  booking: (
    <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></>
  ),
  dashboard: (
    <><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></>
  ),
  search: (
    <><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>
  ),
  plus: (
    <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>
  ),
  edit: (
    <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>
  ),
  trash: (
    <><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" /></>
  ),
  check: (
    <><polyline points="20 6 9 17 4 12" /></>
  ),
  x: (
    <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
  ),
  chevronRight: (
    <><polyline points="9 18 15 12 9 6" /></>
  ),
  chevronDown: (
    <><polyline points="6 9 12 15 18 9" /></>
  ),
  health: (
    <><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></>
  ),
  alert: (
    <><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>
  ),
  menu: (
    <><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></>
  ),
  logout: (
    <><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>
  ),
  filter: (
    <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>
  ),
  refresh: (
    <><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>
  ),
  calendar: (
    <><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></>
  ),
  arrowSwap: (
    <><path d="M7 16V4m0 0L3 8m4-4l4 4" /><path d="M17 8v12m0 0l4-4m-4 4l-4-4" /></>
  ),
  info: (
    <><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></>
  ),
  dollar: (
    <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></>
  ),
  clock: (
    <><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>
  ),
  map: (
    <><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></>
  ),
  seat: (
    <><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></>
  ),
  ticket: (
    <><path d="M2 9a3 3 0 010-6h20a3 3 0 010 6v2a3 3 0 010 6H2a3 3 0 010-6V9z" /><line x1="8" y1="12" x2="16" y2="12" /></>
  ),
  upcoming: (
    <><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></>
  ),
};

export function Icon({ name, size = 20, style }) {
  return (
    <svg
      width={size} height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {ICONS[name]}
    </svg>
  );
}

// ─── Badge ────────────────────────────────────────────────────────────────────
const BADGE_MAP = {
  confirmed:  { bg: '#0f2a1e', color: '#4ade80', border: '#22c55e30' },
  pending:    { bg: '#2a200f', color: '#fbbf24', border: '#f59e0b30' },
  cancelled:  { bg: '#2a0f0f', color: '#f87171', border: '#ef444430' },
  paid:       { bg: '#0f1e2a', color: '#60a5fa', border: '#3b82f630' },
  failed:     { bg: '#2a0f0f', color: '#f87171', border: '#ef444430' },
  healthy:    { bg: '#0f2a1e', color: '#4ade80', border: '#22c55e30' },
  misconfigured: { bg: '#2a0f0f', color: '#f87171', border: '#ef444430' },
};

export function Badge({ status }) {
  const s = BADGE_MAP[status?.toLowerCase()] || { bg: '#1a1f2e', color: '#94a3b8', border: '#334155' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 'var(--radius-full)',
      fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase',
      background: s.bg, color: s.color,
      border: `1px solid ${s.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, display: 'inline-block' }} />
      {status}
    </span>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────
export function Button({ children, variant = 'primary', size = 'md', icon, onClick, disabled, type = 'button', style, accent }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    borderRadius: 'var(--radius-md)', border: 'none',
    fontFamily: 'var(--font-body)', fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    transition: 'opacity 0.15s, transform 0.1s',
    whiteSpace: 'nowrap',
    ...style,
  };

  const color = accent || 'var(--accent-blue)';

  const variants = {
    primary: {
      background: color,
      color: '#fff',
      boxShadow: `0 4px 20px ${color}40`,
    },
    secondary: {
      background: 'var(--bg-elevated)',
      color: 'var(--text-secondary)',
      border: '1px solid var(--border)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid var(--border)',
    },
    danger: {
      background: '#2a0f0f',
      color: '#f87171',
      border: '1px solid #ef444430',
    },
    success: {
      background: '#0f2a1e',
      color: '#4ade80',
      border: '1px solid #22c55e30',
    },
  };

  const sizes = {
    sm: { padding: '6px 12px', fontSize: 12 },
    md: { padding: '10px 18px', fontSize: 14 },
    lg: { padding: '13px 24px', fontSize: 15 },
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{ ...base, ...variants[variant], ...sizes[size] }}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 14 : 16} />}
      {children}
    </button>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
export function Input({ label, name, value, onChange, type = 'text', placeholder, required, error, icon, style }) {
  return (
    <div style={{ ...style }}>
      {label && (
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.07em', marginBottom: 6,
        }}>
          {label}{required && <span style={{ color: 'var(--accent-amber)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {icon && (
          <div style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)',
            pointerEvents: 'none',
          }}>
            <Icon name={icon} size={15} />
          </div>
        )}
        <input
          name={name}
          value={value}
          onChange={onChange}
          type={type}
          placeholder={placeholder || (label ? `Enter ${label.toLowerCase()}` : '')}
          required={required}
          style={{
            width: '100%',
            padding: icon ? '10px 14px 10px 36px' : '10px 14px',
            background: 'var(--bg-inset)',
            border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)', fontSize: 14,
            fontFamily: 'var(--font-body)', outline: 'none',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => { e.target.style.borderColor = 'var(--accent-blue)'; }}
          onBlur={(e) => { e.target.style.borderColor = error ? '#ef4444' : 'var(--border)'; }}
        />
      </div>
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
    </div>
  );
}

// ─── Select ───────────────────────────────────────────────────────────────────
export function Select({ label, name, value, onChange, options = [], required, error, placeholder }) {
  return (
    <div>
      {label && (
        <label style={{
          display: 'block', fontSize: 11, fontWeight: 700,
          color: 'var(--text-muted)', textTransform: 'uppercase',
          letterSpacing: '0.07em', marginBottom: 6,
        }}>
          {label}{required && <span style={{ color: 'var(--accent-amber)', marginLeft: 3 }}>*</span>}
        </label>
      )}
      <select
        name={name} value={value} onChange={onChange} required={required}
        style={{
          width: '100%', padding: '10px 14px',
          background: 'var(--bg-inset)',
          border: `1px solid ${error ? '#ef4444' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontSize: 14, fontFamily: 'var(--font-body)', outline: 'none',
          appearance: 'none', cursor: 'pointer',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%234a5568' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center',
        }}
      >
        <option value="">{placeholder || `Select ${label || 'option'}`}</option>
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
      {error && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, padding = 24 }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding,
      ...style,
    }}>
      {children}
    </div>
  );
}

// ─── Spinner ──────────────────────────────────────────────────────────────────
export function Spinner({ size = 28, color = 'var(--accent-blue)' }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      border: '2px solid var(--border)',
      borderTopColor: color,
      animation: 'spin 0.75s linear infinite',
      flexShrink: 0,
    }} />
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export function Modal({ title, onClose, children, width = 520 }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.2s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', padding: 32,
          width: '100%', maxWidth: width, maxHeight: '88vh', overflowY: 'auto',
          boxShadow: 'var(--shadow-lg)', animation: 'slideInUp 0.25s ease',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 8px',
              cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', transition: 'color 0.15s',
            }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ icon = 'info', title = 'No records found', description = 'Add a new record to get started.' }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '60px 24px', color: 'var(--text-muted)',
      gap: 12,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 'var(--radius-lg)',
        background: 'var(--bg-inset)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--text-faint)',
      }}>
        <Icon name={icon} size={24} />
      </div>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-muted)', margin: 0 }}>{title}</p>
        <p style={{ fontSize: 13, color: 'var(--text-faint)', margin: '4px 0 0' }}>{description}</p>
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
export function ConfirmDialog({ title, message, onConfirm, onCancel, danger = false, confirmLabel, accent }) {
  const btnAccent  = accent  ?? (danger ? undefined : '#22c55e');
  const iconColor  = danger  ? '#f87171' : (accent ?? '#22c55e');
  const iconBg     = danger  ? '#2a0f0f' : '#0f1a2a';
  const iconBorder = danger  ? '#ef444430' : `${(accent ?? '#22c55e')}30`;
  const iconName   = danger  ? 'trash' : (accent === '#60a5fa' ? 'dollar' : 'check');
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-elevated)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-xl)', padding: 32,
          width: '100%', maxWidth: 400,
          boxShadow: 'var(--shadow-lg)', animation: 'slideInUp 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <div style={{
            width: 42, height: 42, borderRadius: 'var(--radius-md)', flexShrink: 0,
            background: iconBg, border: `1px solid ${iconBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: iconColor,
          }}>
            <Icon name={iconName} size={18} />
          </div>
          <div>
            <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{title}</h4>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{message}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button variant="ghost" onClick={onCancel} style={{ flex: 1, justifyContent: 'center' }}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} accent={!danger ? btnAccent : undefined} onClick={onConfirm} style={{ flex: 1, justifyContent: 'center' }}>
            {confirmLabel ?? (danger ? 'Delete' : 'Confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────────────────────
export function SkeletonRow({ cols = 5 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '14px 16px' }}>
          <div className="skeleton" style={{ height: 14, width: `${60 + Math.random() * 30}%`, borderRadius: 4 }} />
        </td>
      ))}
      <td style={{ padding: '14px 16px' }}>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
          {[1,2].map(i => <div key={i} className="skeleton" style={{ width: 30, height: 28, borderRadius: 6 }} />)}
        </div>
      </td>
    </tr>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon, accent, trend, loading }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)', padding: '22px 26px',
      display: 'flex', alignItems: 'center', gap: 18,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        width: 50, height: 50, borderRadius: 'var(--radius-md)',
        background: `${accent}18`, color: accent, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon name={icon} size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {loading ? (
          <div className="skeleton" style={{ height: 28, width: '60%', borderRadius: 6, marginBottom: 6 }} />
        ) : (
          <div style={{
            fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
            fontFamily: 'var(--font-display)', lineHeight: 1,
          }}>{value}</div>
        )}
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, fontWeight: 500 }}>{label}</div>
      </div>
      {/* Decorative circle */}
      <div style={{
        position: 'absolute', right: -24, bottom: -24, width: 80, height: 80,
        borderRadius: '50%', background: `${accent}08`, pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─── Page Header ──────────────────────────────────────────────────────────────
export function PageHeader({ icon, iconAccent, title, subtitle, children }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'center', marginBottom: 28,
      flexWrap: 'wrap', gap: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 'var(--radius-md)',
          background: `${iconAccent}20`, color: iconAccent,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Icon name={icon} size={22} />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            {title}
          </h2>
          {subtitle && <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
      </div>
      {children && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>{children}</div>}
    </div>
  );
}// This file already has all needed exports
