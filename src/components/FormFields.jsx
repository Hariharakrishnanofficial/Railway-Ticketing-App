/**
 * FormFields.jsx — Robust form primitives for modals.
 * Every element uses box-sizing: border-box to prevent overflow.
 * Supports 1, 2, or 3 column grid rows.
 */

function Label({ children, required }) {
  return (
    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
      {children}{required && <span style={{ color: '#f59e0b', marginLeft: 3 }}>*</span>}
    </label>
  );
}

function FieldError({ msg }) {
  if (!msg) return null;
  return <p style={{ margin: '5px 0 0', fontSize: 12, color: '#f87171', lineHeight: 1.4 }}>{msg}</p>;
}

const baseInputStyle = (hasError) => ({
  boxSizing: 'border-box',
  width: '100%',
  padding: '10px 14px',
  background: '#090c12',
  border: `1.5px solid ${hasError ? '#ef4444' : '#1a1f2e'}`,
  borderRadius: 10,
  color: '#e2e8f0',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.2s',
  display: 'block',
  minWidth: 0,
});

export function Field({ label, name, value, onChange, type = 'text', placeholder, required, error, mono }) {
  return (
    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {label && <Label required={required}>{label}</Label>}
      <input
        name={name}
        value={value ?? ''}
        onChange={onChange}
        type={type}
        placeholder={placeholder || ''}
        required={required}
        style={{ ...baseInputStyle(!!error), fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)' }}
        onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
        onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#1a1f2e'; }}
      />
      <FieldError msg={error} />
    </div>
  );
}

export function Dropdown({ label, name, value, onChange, options = [], required, error, placeholder }) {
  return (
    <div style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {label && <Label required={required}>{label}</Label>}
      <select
        name={name}
        value={value ?? ''}
        onChange={onChange}
        required={required}
        style={{
          ...baseInputStyle(!!error),
          appearance: 'none',
          cursor: 'pointer',
          paddingRight: 36,
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          backgroundSize: '12px',
        }}
        onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
        onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#1a1f2e'; }}
      >
        {placeholder !== false && (
          <option value="">{placeholder || (label ? `Select ${label}` : 'Select…')}</option>
        )}
        {options.map(o => {
          const val = typeof o === 'object' ? o.value : o;
          const lbl = typeof o === 'object' ? o.label : o;
          return <option key={val} value={val}>{lbl}</option>;
        })}
      </select>
      <FieldError msg={error} />
    </div>
  );
}

/** cols: 1 | 2 | 3 — never overflows modal width */
export function FormRow({ children, cols = 2 }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: 14,
      width: '100%',
      boxSizing: 'border-box',
    }}>
      {children}
    </div>
  );
}

export function FormDivider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0' }}>
      <div style={{ flex: 1, height: 1, background: '#1a1f2e' }} />
      {label && <span style={{ fontSize: 10, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: '#1a1f2e' }} />
    </div>
  );
}

export function FormActions({ onCancel, onSubmit, submitLabel = 'Save', loading, accent = '#3b82f6' }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingTop: 20, borderTop: '1px solid #1a1f2e' }}>
      <button type="button" onClick={onCancel}
        style={{ flex: 1, padding: '11px 16px', borderRadius: 10, border: '1px solid #1a1f2e', background: 'transparent', color: '#94a3b8', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)', cursor: 'pointer', boxSizing: 'border-box' }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = '#334155'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#1a1f2e'; }}
      >
        Cancel
      </button>
      <button type="button" onClick={onSubmit} disabled={loading}
        style={{ flex: 2, padding: '11px 16px', borderRadius: 10, border: 'none', background: loading ? '#1a1f2e' : accent, color: loading ? '#4a5568' : '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)', cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxSizing: 'border-box', boxShadow: loading ? 'none' : `0 4px 14px ${accent}50` }}
      >
        {loading
          ? <><div style={{ width: 15, height: 15, border: '2px solid #334155', borderTopColor: '#94a3b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Saving…</>
          : submitLabel}
      </button>
    </div>
  );
}

export function FormApiError({ response }) {
  if (!response || response.success !== false) return null;
  return (
    <div style={{ padding: '10px 14px', background: '#2a0f0f', border: '1px solid #ef444430', borderRadius: 10, color: '#f87171', fontSize: 13, lineHeight: 1.5 }}>
      <strong>API Error:</strong> {response.error || response.message || 'Unknown error'}
      {response.status_code && <span style={{ marginLeft: 8, opacity: 0.7 }}>(HTTP {response.status_code})</span>}
    </div>
  );
}

export function DebugRecord({ row }) {
  if (!row) return null;
  // Only show in dev (import.meta.env.DEV)
  if (typeof import.meta !== 'undefined' && import.meta.env?.PROD) return null;
  return (
    <details style={{ borderRadius: 8, border: '1px solid #1a1f2e', overflow: 'hidden' }}>
      <summary style={{ padding: '8px 12px', background: '#090c12', color: '#4a5568', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--font-mono)', userSelect: 'none', listStyle: 'none' }}>
        🔍 Zoho raw record — click to expand
      </summary>
      <pre style={{ margin: 0, padding: '10px 14px', fontSize: 11, color: '#64748b', background: '#05070d', overflowX: 'auto', maxHeight: 200, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {JSON.stringify(row, null, 2)}
      </pre>
    </details>
  );
}
