import { createContext, useContext, useState, useCallback } from 'react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'success', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const contextValue = {
    addToast,
    success: (msg, dur) => addToast(msg, 'success', dur),
    error: (msg, dur) => addToast(msg, 'error', dur),
    warning: (msg, dur) => addToast(msg, 'warning', dur),
    info: (msg, dur) => addToast(msg, 'info', dur),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};

function ToastContainer({ toasts, onRemove }) {
  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 10,
      pointerEvents: 'none',
    }}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onRemove={onRemove} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onRemove }) {
  const styles = {
    success: { bg: '#0f2a1e', color: '#4ade80', border: '#22c55e40', icon: '✓' },
    error: { bg: '#2a0f0f', color: '#f87171', border: '#ef444440', icon: '✕' },
    warning: { bg: '#2a1f0f', color: '#fbbf24', border: '#f59e0b40', icon: '!' },
    info: { bg: '#0f1e2a', color: '#60a5fa', border: '#3b82f640', icon: 'i' },
  };
  const s = styles[toast.type] || styles.info;

  return (
    <div
      onClick={() => onRemove(toast.id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 18px', borderRadius: 12,
        background: s.bg, border: `1px solid ${s.border}`,
        color: s.color, fontSize: 13, fontFamily: 'var(--font-body)',
        minWidth: 260, maxWidth: 380,
        boxShadow: 'var(--shadow-md)',
        animation: 'slideInRight 0.25s ease',
        pointerEvents: 'all', cursor: 'pointer',
      }}
    >
      <span style={{
        width: 20, height: 20, borderRadius: '50%',
        background: `${s.color}20`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 800, flexShrink: 0,
      }}>
        {s.icon}
      </span>
      <span style={{ flex: 1, fontWeight: 500 }}>{toast.message}</span>
    </div>
  );
}
