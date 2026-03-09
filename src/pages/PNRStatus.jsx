/**
 * PNRStatus.jsx
 * Searches by PNR field (exact Zoho field name: "PNR")
 * Booking_Status values: pending | confirmed | cancelled
 * Payment_Status values: unpaid | paid | failed
 * Trains / Users are lookup objects: { ID, display_value }
 */
import { useState } from 'react';
import { bookingsApi, extractRecords, getLookupLabel } from '../services/api';

const STATUS_META = {
  pending:   { color: '#fbbf24', bg: '#2a200f', border: '#f59e0b25', icon: '⏳', label: 'Pending'   },
  confirmed: { color: '#4ade80', bg: '#0f2a1e', border: '#22c55e25', icon: '✓',  label: 'Confirmed' },
  cancelled: { color: '#f87171', bg: '#2a0f0f', border: '#ef444425', icon: '✕',  label: 'Cancelled' },
};
const PAYMENT_META = {
  unpaid:  { color: '#fbbf24', label: 'Unpaid'  },
  paid:    { color: '#4ade80', label: 'Paid'    },
  failed:  { color: '#f87171', label: 'Failed'  },
};

function StatusTimeline({ status }) {
  const isCancelled = status === 'cancelled';
  const steps = [
    { key: 'pending',   label: 'Pending',   icon: '⏳' },
    { key: 'confirmed', label: 'Confirmed', icon: '✓'  },
  ];
  const activeIdx = steps.findIndex(s => s.key === status);

  if (isCancelled) return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 3, background: '#2a0f0f', borderRadius: 2 }} />
      <span style={{ fontSize: 12, fontWeight: 700, color: '#f87171', background: '#2a0f0f', padding: '4px 16px', borderRadius: 20, border: '1px solid #ef444430', whiteSpace: 'nowrap' }}>✕ Ticket Cancelled</span>
      <div style={{ flex: 1, height: 3, background: '#2a0f0f', borderRadius: 2 }} />
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0' }}>
      {steps.map((step, i) => {
        const done = i <= activeIdx;
        const m = STATUS_META[step.key];
        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: done ? m.bg : 'var(--bg-inset)', border: `2px solid ${done ? m.color : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: done ? m.color : 'var(--text-faint)' }}>
                {done ? step.icon : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: done ? m.color : 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 3, margin: '0 10px', marginBottom: 22, background: done && activeIdx > i ? '#22c55e' : 'var(--border)', borderRadius: 2 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function InfoRow({ label, value, accent, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #0e1420' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent || 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit', maxWidth: '60%', textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}

export default function PNRStatus() {
  const [pnr, setPnr]             = useState('');
  const [result, setResult]       = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [notFound, setNotFound]   = useState(false);

  const handleSearch = async () => {
    const val = pnr.trim().toUpperCase();
    if (!val) { setError('Enter a PNR number'); return; }
    setLoading(true); setResult(null); setError(''); setNotFound(false);
    try {
      const res = await bookingsApi.getAll();
      const records = extractRecords(res);
      // Real Zoho field is "PNR" (uppercase)
      const found = records.find(b => String(b.PNR ?? '').toUpperCase() === val);
      if (found) setResult(found); else setNotFound(true);
    } catch (err) { setError(err.message || 'Failed to fetch bookings'); }
    finally { setLoading(false); }
  };

  const bStatus = result?.Booking_Status ?? '';
  const pStatus = result?.Payment_Status ?? '';
  const sm = STATUS_META[bStatus]  || STATUS_META.pending;
  const pm = PAYMENT_META[pStatus] || PAYMENT_META.unpaid;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>PNR Status</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Enter your PNR to check live booking status</p>
      </div>

      {/* Search box */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, marginBottom: 24 }}>
        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>PNR Number</label>
        <div style={{ display: 'flex', gap: 12 }}>
          <input
            value={pnr} maxLength={24}
            onChange={e => { setPnr(e.target.value.toUpperCase()); setError(''); setNotFound(false); setResult(null); }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g. PNR4F2A9B1C"
            style={{ boxSizing: 'border-box', flex: 1, padding: '12px 16px', background: '#090c12', border: `1.5px solid ${error ? '#ef4444' : '#1a1f2e'}`, borderRadius: 12, color: '#e8eaf0', fontSize: 15, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', outline: 'none' }}
            onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
            onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#1a1f2e'; }}
          />
          <button onClick={handleSearch} disabled={loading}
            style={{ flexShrink: 0, padding: '12px 24px', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(59,130,246,0.35)' }}>
            {loading
              ? <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Checking…</>
              : '🔍 Check Status'}
          </button>
        </div>
        {error && <p style={{ margin: '8px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
          Format: <span style={{ fontFamily: 'var(--font-mono)' }}>PNR</span> + 8 alphanumeric characters
        </p>
      </div>

      {/* Not found */}
      {notFound && (
        <div style={{ background: '#2a200f', border: '1px solid #f59e0b30', borderRadius: 16, padding: '36px 24px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🎫</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24', marginBottom: 6 }}>PNR Not Found</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            No booking for <span style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{pnr}</span>. Please check the PNR and try again.
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div style={{ background: 'var(--bg-elevated)', border: `1px solid ${sm.border}`, borderRadius: 16, overflow: 'hidden', animation: 'slideInUp 0.3s ease' }}>
          {/* Status banner */}
          <div style={{ background: sm.bg, borderBottom: `1px solid ${sm.border}`, padding: '18px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: sm.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Booking Status</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: sm.color, fontFamily: 'var(--font-display)' }}>{sm.icon} {sm.label}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PNR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: '#60a5fa', letterSpacing: '0.06em' }}>{result.PNR}</div>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            <StatusTimeline status={bStatus} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 32px' }}>
              <div>
                <InfoRow label="Train"        value={getLookupLabel(result.Trains)} />
                <InfoRow label="Journey Date" value={result.Journey_Date ?? '—'}    />
                <InfoRow label="Class"        value={result.Class        ?? '—'}    />
                {result.Coach_Number && <InfoRow label="Coach" value={result.Coach_Number} accent="#a78bfa" />}
              </div>
              <div>
                <InfoRow label="Passengers" value={String(result.Passenger_Count ?? '—')}   />
                <InfoRow label="Total Fare" value={result.Total_Fare ? `₹${result.Total_Fare}` : '—'} accent="#4ade80" />
                <InfoRow label="Payment"    value={pm.label} accent={pm.color}               />
              </div>
            </div>

            {result.Seat_Numbers && (
              <div style={{ marginTop: 16, padding: '12px 16px', background: '#0a1a0f', border: '1px solid #14532d', borderRadius: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>🪑 Assigned Seats</div>
                <div style={{ fontSize: 13, fontFamily: 'var(--font-mono)', color: '#d1fae5', wordBreak: 'break-word' }}>{result.Seat_Numbers}</div>
              </div>
            )}

            {bStatus === 'cancelled' && (
              <div style={{ marginTop: 20, padding: '14px 16px', background: '#0f1825', border: '1px solid #3b82f630', borderRadius: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 6 }}>💰 Refund Information</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {pStatus === 'paid'
                    ? 'Refund will be processed to the original payment method within 5–7 business days.'
                    : 'No payment was made — no refund applicable.'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}