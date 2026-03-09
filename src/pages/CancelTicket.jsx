/**
 * CancelTicket.jsx
 * Matches by PNR field (exact Zoho field: "PNR")
 * Updates via PUT /api/bookings/:id with { Booking_Status: "cancelled" }
 * Payment_Status values from real API: unpaid | paid | failed
 */
import { useState } from 'react';
import { bookingsApi, stationsApi, extractRecords, getRecordId, getLookupLabel } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useCallback } from 'react';

const CANCEL_CHARGES = { '1A': 500, '2A': 250, '3A': 150, 'SL': 60, 'Sleeper': 60, 'CC': 100, 'EC': 200, '2S': 10 };

function StepBar({ current }) {
  const steps = ['Find Booking', 'Confirm Cancel', 'Done'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {steps.map((label, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              border: `2px solid ${current > i ? '#22c55e' : current === i ? '#3b82f6' : '#1a1f2e'}`,
              background: current > i ? '#0f2a1e' : current === i ? '#0f1a2a' : 'var(--bg-inset)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700,
              color: current > i ? '#4ade80' : current === i ? '#60a5fa' : '#4a5568',
            }}>
              {current > i ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.06em', color: current > i ? '#4ade80' : current === i ? '#60a5fa' : '#4a5568' }}>
              {label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div style={{ flex: 1, height: 2, margin: '0 8px', marginBottom: 22, background: current > i ? '#22c55e' : '#1a1f2e', borderRadius: 1 }} />
          )}
        </div>
      ))}
    </div>
  );
}

function InfoRow({ label, value, accent, mono }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #0e1420' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: accent || 'var(--text-primary)', fontFamily: mono ? 'var(--font-mono)' : 'inherit' }}>{value}</span>
    </div>
  );
}

export default function CancelTicket() {
  const [step, setStep]             = useState(0);
  const [pnr, setPnr]               = useState('');
  const [booking, setBooking]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError]           = useState('');
  const [donePnr, setDonePnr]       = useState('');

  const handleSearch = async () => {
    const val = pnr.trim().toUpperCase();
    if (!val) { setError('Enter a PNR number'); return; }
    setLoading(true); setError(''); setBooking(null);
    try {
      const res = await bookingsApi.getAll();
      const records = extractRecords(res);
      // Exact Zoho field name: "PNR"
      const found = records.find(b => String(b.PNR ?? '').toUpperCase() === val);
      if (!found) {
        setError(`No booking found for PNR: ${val}`);
      } else if (found.Booking_Status === 'cancelled') {
        setError('This ticket is already cancelled.');
      } else {
        setBooking(found); setStep(1);
      }
    } catch (err) { setError(err.message || 'Failed to fetch bookings'); }
    finally { setLoading(false); }
  };

  const handleCancel = async () => {
    const id = getRecordId(booking);
    if (!id) { setError('Cannot identify record ID — contact support'); return; }
    setCancelling(true); setError('');
    try {
      // Use dedicated /cancel endpoint — backend fetches existing record and sets Booking_Status = cancelled
      const res = await bookingsApi.cancel(id);
      if (res?.success === false) { setError(res.error || res.message || 'Cancellation failed'); }
      else { setDonePnr(booking.PNR); setStep(2); }
    } catch (err) { setError(err.message || 'Cancellation failed'); }
    finally { setCancelling(false); }
  };

  const reset = () => { setStep(0); setPnr(''); setBooking(null); setError(''); setDonePnr(''); };

  const cls    = booking?.Class ?? '';
  const pax    = Number(booking?.Passenger_Count) || 1;
  const charge = (CANCEL_CHARGES[cls] || 100) * pax;
  const isPaid = booking?.Payment_Status === 'paid';
  const bStatus = booking?.Booking_Status ?? '';

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Cancel Ticket</h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>Find your booking by PNR and cancel it</p>
      </div>

      <StepBar current={step} />

      {/* ── Step 0: Search ── */}
      {step === 0 && (
        <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 24 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>PNR Number</label>
          <div style={{ display: 'flex', gap: 12 }}>
            <input
              value={pnr} maxLength={24}
              onChange={e => { setPnr(e.target.value.toUpperCase()); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="e.g. PNR4F2A9B1C"
              style={{ boxSizing: 'border-box', flex: 1, padding: '12px 16px', background: '#090c12', border: `1.5px solid ${error ? '#ef4444' : '#1a1f2e'}`, borderRadius: 12, color: '#e8eaf0', fontSize: 15, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', outline: 'none' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
              onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#1a1f2e'; }}
            />
            <button onClick={handleSearch} disabled={loading}
              style={{ flexShrink: 0, padding: '12px 24px', borderRadius: 12, border: 'none', background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 4px 14px rgba(59,130,246,0.3)' }}>
              {loading
                ? <><div style={{ width: 15, height: 15, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Finding…</>
                : '🔍 Find Booking'}
            </button>
          </div>
          {error && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: '#2a0f0f', border: '1px solid #ef444430', borderRadius: 10, color: '#f87171', fontSize: 13 }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* ── Step 1: Review + Confirm ── */}
      {step === 1 && booking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Booking summary card */}
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-inset)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>Booking Found</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700, color: '#60a5fa', letterSpacing: '0.05em' }}>{booking.PNR}</div>
              </div>
              <span style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                background: bStatus === 'confirmed' ? '#0f2a1e' : '#2a200f',
                color: bStatus === 'confirmed' ? '#4ade80' : '#fbbf24',
                border: `1px solid ${bStatus === 'confirmed' ? '#22c55e30' : '#f59e0b30'}`,
              }}>
                {bStatus}
              </span>
            </div>
            <div style={{ padding: '8px 24px 16px' }}>
              <InfoRow label="Train"        value={getLookupLabel(booking.Trains)}  />
              <InfoRow label="Journey Date" value={booking.Journey_Date ?? '—'}     />
              <InfoRow label="Class"        value={booking.Class        ?? '—'}     />
              <InfoRow label="Passengers"   value={String(pax)}                     />
              <InfoRow label="Total Fare"   value={booking.Total_Fare ? `₹${booking.Total_Fare}` : '—'} accent="#4ade80" />
              <InfoRow label="Payment"      value={booking.Payment_Status ?? '—'}   accent={isPaid ? '#4ade80' : '#fbbf24'} />
            </div>
          </div>

          {/* Cancellation policy */}
          <div style={{ background: '#0f1825', border: '1px solid #3b82f630', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 12 }}>💰 Cancellation & Refund Policy</div>
            <InfoRow label="Cancellation Charge" value={`₹${charge}  (₹${CANCEL_CHARGES[cls] || 100} × ${pax} pax)`} accent="#f87171" />
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 10, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
              {isPaid
                ? 'Refund (minus cancellation charge) will be credited within 5–7 business days.'
                : 'No payment was made — no refund applicable.'}
            </div>
          </div>

          {/* Warning */}
          <div style={{ background: '#2a0f0f', border: '1px solid #ef444430', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ fontSize: 13, color: '#f87171', lineHeight: 1.6 }}>
              <strong>This action cannot be undone.</strong> The booking status will be permanently set to cancelled.
            </div>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', background: '#2a0f0f', border: '1px solid #ef444430', borderRadius: 10, color: '#f87171', fontSize: 13 }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => { setStep(0); setBooking(null); setError(''); }}
              style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1px solid #1a1f2e', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-body)' }}>
              ← Go Back
            </button>
            <button onClick={handleCancel} disabled={cancelling}
              style={{ flex: 2, padding: '12px', borderRadius: 12, border: 'none', background: cancelling ? '#1a1f2e' : '#ef4444', color: cancelling ? '#4a5568' : '#fff', cursor: cancelling ? 'not-allowed' : 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: cancelling ? 'none' : '0 4px 16px rgba(239,68,68,0.35)' }}>
              {cancelling
                ? <><div style={{ width: 15, height: 15, border: '2px solid #334155', borderTopColor: '#94a3b8', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Cancelling…</>
                : '✕ Confirm Cancellation'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Done ── */}
      {step === 2 && (
        <div style={{ background: '#0f2a1e', border: '1px solid #22c55e30', borderRadius: 16, padding: '52px 32px', textAlign: 'center', animation: 'slideInUp 0.3s ease' }}>
          <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#4ade80', fontFamily: 'var(--font-display)', marginBottom: 8 }}>Ticket Cancelled Successfully</div>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }}>
            PNR <span style={{ fontFamily: 'var(--font-mono)', color: '#4ade80', fontWeight: 700 }}>{donePnr}</span> has been cancelled.
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
            {isPaid ? 'Your refund will be processed within 5–7 business days.' : 'No payment was made — no refund applicable.'}
          </div>
          <button onClick={reset}
            style={{ padding: '11px 28px', borderRadius: 12, border: '1px solid #22c55e30', background: 'transparent', color: '#4ade80', cursor: 'pointer', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)' }}>
            Cancel Another Ticket
          </button>
        </div>
      )}
    </div>
  );
}