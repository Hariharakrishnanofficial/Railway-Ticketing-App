/**
 * MyBookings.jsx
 * Shows logged-in user's booking history with Upcoming Journeys filter.
 * Calls: GET /api/users/{userId}/bookings  (falls back to GET /api/bookings?user_id=...)
 * Cancellation via: POST /api/bookings/{id}/cancel
 */
import { useState, useEffect, useCallback } from 'react';
import { bookingsApi, extractRecords, getRecordId, getLookupLabel } from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Badge, Icon, Spinner, Button } from '../components/UI';

const TODAY = new Date().toISOString().split('T')[0];

function parseDate(str) {
  if (!str) return null;
  // Handle "DD-MMM-YYYY HH:MM:SS" or "YYYY-MM-DD"
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  try {
    const months = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
    const [dd, mmm, yyyy] = str.split(' ')[0].split('-');
    return `${yyyy}-${String(months[mmm]+1).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
  } catch { return null; }
}

function isUpcoming(booking) {
  const d = parseDate(booking.Journey_Date);
  return d && d >= TODAY;
}

// IRCTC cancellation charge table
function calcRefund(booking) {
  const journeyDate = parseDate(booking.Journey_Date);
  if (!journeyDate) return { charge: 0, refund: Number(booking.Total_Fare || 0), rule: 'No date info' };
  const totalFare = Number(booking.Total_Fare || 0);
  const hoursLeft = (new Date(journeyDate) - new Date()) / 3600000;
  const cls = booking.Class || '';

  const flatCharge = { '2AC': 200, '2A': 200, '3AC': 120, '3A': 120, 'Sleeper': 60, 'SL': 60, 'CC': 90 }[cls] || 60;

  if (hoursLeft >= 48)       return { charge: flatCharge, refund: totalFare - flatCharge, rule: '>48h: flat fee' };
  if (hoursLeft >= 12)       return { charge: Math.max(totalFare * 0.25, flatCharge), refund: totalFare - Math.max(totalFare * 0.25, flatCharge), rule: '12–48h: 25%' };
  if (hoursLeft >= 4)        return { charge: Math.max(totalFare * 0.50, flatCharge), refund: totalFare - Math.max(totalFare * 0.50, flatCharge), rule: '4–12h: 50%' };
  return { charge: totalFare, refund: 0, rule: '<4h: no refund' };
}

function BookingCard({ booking, onCancel, cancelling }) {
  const id      = getRecordId(booking);
  const pnr     = booking.PNR || '—';
  const status  = booking.Booking_Status || 'pending';
  const payment = booking.Payment_Status || 'unpaid';
  const cls     = booking.Class || '—';
  const pax     = booking.Passenger_Count || '—';
  const fare    = booking.Total_Fare ? `₹${booking.Total_Fare}` : '—';
  const jDate   = booking.Journey_Date ? booking.Journey_Date.split(' ')[0] : '—';
  const train   = getLookupLabel(booking.Trains);
  const upcoming = isUpcoming(booking);
  const canCancel = status !== 'cancelled' && payment !== 'unpaid';
  const refundInfo = status !== 'cancelled' ? calcRefund(booking) : null;

  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 14, overflow: 'hidden', marginBottom: 12,
      borderLeft: `3px solid ${status === 'confirmed' ? '#22c55e' : status === 'cancelled' ? '#ef4444' : '#f59e0b'}`,
      transition: 'box-shadow 0.2s',
    }}>
      {/* Main row */}
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        
        {/* PNR + train */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 800, color: '#60a5fa', letterSpacing: '0.06em' }}>{pnr}</span>
            {upcoming && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(16,185,129,0.15)', color: '#4ade80', border: '1px solid #22c55e30' }}>UPCOMING</span>}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="train" size={13} />
            <span>{train}</span>
          </div>
        </div>

        {/* Journey date */}
        <div style={{ textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Journey</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{jDate}</div>
        </div>

        {/* Class + pax */}
        <div style={{ textAlign: 'center', minWidth: 70 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Class / Pax</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{cls} · {pax}</div>
        </div>

        {/* Fare */}
        <div style={{ textAlign: 'center', minWidth: 70 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Fare</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent-green)' }}>{fare}</div>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <Badge status={status} />
          <Badge status={payment} />
        </div>

        {/* Expand chevron */}
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={16} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '16px 20px', background: 'var(--bg-inset)', animation: 'slideInUp 0.2s ease' }}>
          {/* Passenger list */}
          {booking.Passengers && (() => {
            try {
              const pList = typeof booking.Passengers === 'string' ? JSON.parse(booking.Passengers) : booking.Passengers;
              if (Array.isArray(pList) && pList.length > 0) return (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Passengers</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {pList.map((p, i) => (
                      <div key={i} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12 }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: 6 }}>{p.age}y · {p.gender}</span>
                        {p.berthPref && p.berthPref !== 'No Preference' && <span style={{ color: 'var(--accent-blue)', marginLeft: 6 }}>{p.berthPref}</span>}
                        {p.seat && <span style={{ color: '#4ade80', marginLeft: 6, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 11 }}>🪑 {p.seat}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch {}
            return null;
          })()}

          {/* Seat allocation info */}
          {booking.Seat_Numbers && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#0a1a0f', border: '1px solid #14532d', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#4ade80', marginBottom: 4 }}>🪑 Seat Allocation</div>
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{booking.Seat_Numbers}</div>
              {booking.Coach_Number && <div style={{ color: '#a78bfa', marginTop: 3 }}>Coach: <strong>{booking.Coach_Number}</strong></div>}
            </div>
          )}

          {/* Refund info for cancellable tickets */}
          {refundInfo && status !== 'cancelled' && (
            <div style={{ marginBottom: 14, padding: '10px 14px', background: '#0f1825', border: '1px solid #1a2a3a', borderRadius: 8, fontSize: 12 }}>
              <div style={{ fontWeight: 700, color: '#60a5fa', marginBottom: 4 }}>💰 Cancellation Estimate</div>
              <div style={{ color: 'var(--text-muted)' }}>
                Rule: <strong style={{ color: 'var(--text-primary)' }}>{refundInfo.rule}</strong> &nbsp;·&nbsp;
                Charge: <strong style={{ color: '#fbbf24' }}>₹{Math.round(refundInfo.charge)}</strong> &nbsp;·&nbsp;
                Refund: <strong style={{ color: '#4ade80' }}>₹{Math.max(0, Math.round(refundInfo.refund))}</strong>
              </div>
            </div>
          )}

          {/* Actions */}
          {status !== 'cancelled' && (
            <div style={{ display: 'flex', gap: 10 }}>
              {canCancel && (
                <button
                  onClick={(e) => { e.stopPropagation(); onCancel(booking); }}
                  disabled={cancelling === id}
                  style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ef444430', background: '#2a0f0f', color: '#f87171', fontSize: 12, fontWeight: 700, cursor: cancelling === id ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  {cancelling === id ? <><Spinner size={12} color="#f87171" /> Cancelling…</> : '✕ Cancel Ticket'}
                </button>
              )}
              {payment === 'unpaid' && status !== 'cancelled' && (
                <span style={{ fontSize: 11, color: '#fbbf24', alignSelf: 'center' }}>⚠ Payment pending — cancellation not available</span>
              )}
            </div>
          )}
          {status === 'cancelled' && payment === 'paid' && (
            <div style={{ fontSize: 12, color: '#4ade80' }}>✓ Refund will be processed within 5–7 business days</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cancel Confirmation Modal ────────────────────────────────────────────────
function CancelModal({ booking, onConfirm, onClose, cancelling }) {
  if (!booking) return null;
  const refundInfo = calcRefund(booking);
  const refundAmt  = Math.max(0, Math.round(refundInfo.refund));
  const charge     = Math.round(refundInfo.charge);
  const totalFare  = Number(booking.Total_Fare || 0);
  const pax        = booking.Passenger_Count || 1;

  try {
    var pList = typeof booking.Passengers === 'string' ? JSON.parse(booking.Passengers) : (booking.Passengers || []);
  } catch { var pList = []; }

  const hoursLeft  = booking.Journey_Date
    ? Math.max(0, Math.round((new Date(parseDate(booking.Journey_Date)) - new Date()) / 3600000))
    : null;

  const iS = { background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 };
  const labelS = { fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
      onClick={onClose}>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, width: '100%', maxWidth: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#f87171' }}>Cancel Ticket</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>This action cannot be undone</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Booking summary */}
          <div style={{ ...iS, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={labelS}>PNR</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#60a5fa', fontSize: 14 }}>{booking.PNR}</div>
            </div>
            <div>
              <div style={labelS}>Train</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: 13 }}>
                {typeof booking.Trains === 'object' ? booking.Trains?.display_value : booking.Trains || '—'}
              </div>
            </div>
            <div>
              <div style={labelS}>Journey Date</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{booking.Journey_Date?.split(' ')[0] || '—'}</div>
            </div>
            <div>
              <div style={labelS}>Class / Passengers</div>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{booking.Class} · {pax} pax</div>
            </div>
            {hoursLeft !== null && (
              <div style={{ gridColumn: '1/-1' }}>
                <div style={labelS}>Time Until Journey</div>
                <div style={{ fontWeight: 700, color: hoursLeft < 4 ? '#ef4444' : hoursLeft < 12 ? '#f59e0b' : '#4ade80' }}>
                  {hoursLeft >= 24 ? `${Math.floor(hoursLeft/24)}d ${hoursLeft%24}h` : `${hoursLeft}h`} remaining
                </div>
              </div>
            )}
          </div>

          {/* Passenger list */}
          {pList.length > 0 && (
            <div>
              <div style={labelS}>Passengers Being Cancelled</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pList.map((p, i) => (
                  <div key={i} style={{ ...iS, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{p.name}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.age}y · {p.gender}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Refund breakdown */}
          <div style={{ background: '#0a1628', border: '1px solid #1e3a5f', borderRadius: 10, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', background: '#0f1e35', borderBottom: '1px solid #1e3a5f' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>💰 Refund Calculation</span>
            </div>
            <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { label: 'Total Fare Paid',      value: `₹${totalFare.toLocaleString()}`, color: 'var(--text-primary)' },
                { label: `Cancellation Charge (${refundInfo.rule})`, value: `− ₹${charge.toLocaleString()}`, color: '#fbbf24' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
              <div style={{ borderTop: '1px solid #1e3a5f', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: 14 }}>Refund Amount</span>
                <span style={{ fontWeight: 800, fontSize: 16, color: refundAmt > 0 ? '#4ade80' : '#ef4444' }}>
                  ₹{refundAmt.toLocaleString()}
                </span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Refund will be credited within 5–7 business days
              </div>
            </div>
          </div>

          {/* Warning for no-refund */}
          {refundAmt === 0 && (
            <div style={{ background: '#2a0f0f', border: '1px solid #ef444430', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#f87171' }}>
              ⚠ No refund applicable — journey is within 4 hours or already departed.
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            <button onClick={onClose} disabled={!!cancelling} style={{
              flex: 1, padding: '11px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'transparent', color: 'var(--text-muted)', fontSize: 13, fontWeight: 700,
              cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
            }}>
              Keep Ticket
            </button>
            <button onClick={() => onConfirm(booking, refundAmt)} disabled={!!cancelling} style={{
              flex: 1, padding: '11px', borderRadius: 9, border: '1px solid #ef444440',
              background: cancelling ? '#1a0808' : '#2a0f0f', color: '#f87171', fontSize: 13, fontWeight: 700,
              cursor: cancelling ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'background 0.15s',
            }}>
              {cancelling ? <><Spinner size={13} color="#f87171" /> Cancelling…</> : '✕ Confirm Cancellation'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyBookings() {
  const { addToast } = useToast();
  const [user]         = useState(() => { try { return JSON.parse(sessionStorage.getItem('rail_user')); } catch { return null; } });
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [filter, setFilter]     = useState('all'); // all | upcoming | past | confirmed | cancelled
  const [cancelling, setCancelling] = useState(null);
  const [search, setSearch]     = useState('');
  const [cancelTarget, setCancelTarget] = useState(null); // booking to cancel

  const loadBookings = useCallback(async () => {
    if (!user?.ID) return;
    setLoading(true);
    try {
      // Try user-specific endpoint first, fall back to filtered getAll
      let res;
      try {
        res = await fetch(`${(window.VITE_API_BASE_URL || 'http://127.0.0.1:4600/api')}/users/${user.ID}/bookings`, {
          headers: { 'Content-Type': 'application/json' }
        }).then(r => r.json());
      } catch {
        res = await bookingsApi.getAll({ user_id: user.ID });
      }
      const all = extractRecords(res);
      // Sort by journey_date descending
      all.sort((a, b) => {
        const da = parseDate(a.Journey_Date) || '';
        const db = parseDate(b.Journey_Date) || '';
        return db.localeCompare(da);
      });
      setBookings(all);
    } catch (err) {
      addToast(err.message || 'Failed to load bookings', 'error');
    }
    setLoading(false);
  }, [user?.ID]);

  useEffect(() => { loadBookings(); }, [loadBookings]);

  // Open cancel modal
  const handleCancel = (booking) => setCancelTarget(booking);

  // Called when user clicks Confirm inside modal
  const handleCancelConfirm = async (booking, refundAmt) => {
    const id = getRecordId(booking);
    setCancelling(id);
    try {
      const res = await bookingsApi.cancel(id, { Refund_Amount: refundAmt });
      if (res?.success === false) throw new Error(res.error || res.message);
      setBookings(prev => prev.map(b =>
        getRecordId(b) === id
          ? { ...b, Booking_Status: 'cancelled', Refund_Amount: refundAmt }
          : b
      ));
      addToast(`Ticket ${booking.PNR} cancelled. Refund ₹${refundAmt} initiated.`, 'success');
      setCancelTarget(null);
    } catch (err) {
      addToast(err.message || 'Cancellation failed', 'error');
      await loadBookings();
    }
    setCancelling(null);
  };

  // Filter
  const filtered = bookings.filter(b => {
    const matchSearch = !search || (b.PNR || '').toLowerCase().includes(search.toLowerCase()) ||
      getLookupLabel(b.Trains).toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'upcoming')  return isUpcoming(b) && b.Booking_Status !== 'cancelled';
    if (filter === 'past')      return !isUpcoming(b) || b.Booking_Status === 'cancelled';
    if (filter === 'confirmed') return b.Booking_Status === 'confirmed';
    if (filter === 'cancelled') return b.Booking_Status === 'cancelled';
    return true;
  });

  const upcomingCount  = bookings.filter(b => isUpcoming(b) && b.Booking_Status !== 'cancelled').length;
  const confirmedCount = bookings.filter(b => b.Booking_Status === 'confirmed').length;
  const cancelledCount = bookings.filter(b => b.Booking_Status === 'cancelled').length;

  const FILTERS = [
    { id: 'all',       label: `All (${bookings.length})` },
    { id: 'upcoming',  label: `Upcoming (${upcomingCount})`, accent: '#4ade80' },
    { id: 'past',      label: 'Past' },
    { id: 'confirmed', label: `Confirmed (${confirmedCount})`, accent: '#4ade80' },
    { id: 'cancelled', label: `Cancelled (${cancelledCount})`, accent: '#f87171' },
  ];

  if (!user) {
    return (
      <div>
        <PageHeader icon="ticket" iconAccent="var(--accent-amber)" title="My Bookings" subtitle="Your train ticket history" />
        <Card>
          <div style={{ textAlign: 'center', padding: '52px 24px' }}>
            <Icon name="ticket" size={48} style={{ color: 'var(--text-faint)', margin: '0 auto 16px', display: 'block' }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Please Sign In</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>You need to be logged in to view your bookings.</div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader icon="ticket" iconAccent="var(--accent-amber)" title="My Bookings"
        subtitle={`Welcome back, ${user.Full_Name || user.Email} — ${bookings.length} booking${bookings.length !== 1 ? 's' : ''} found`}>
        <button onClick={loadBookings} style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </PageHeader>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total', value: bookings.length, color: '#60a5fa' },
          { label: 'Upcoming', value: upcomingCount, color: '#4ade80' },
          { label: 'Confirmed', value: confirmedCount, color: '#4ade80' },
          { label: 'Cancelled', value: cancelledCount, color: '#f87171' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>{s.label}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.color, fontFamily: 'var(--font-display)' }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Filters + search */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 4 }}>
          {FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: '6px 14px', borderRadius: 7, border: 'none',
              background: filter === f.id ? (f.accent ? `${f.accent}20` : 'var(--bg-inset)') : 'transparent',
              color: filter === f.id ? (f.accent || 'var(--text-primary)') : 'var(--text-muted)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)',
              borderLeft: filter === f.id && f.accent ? `2px solid ${f.accent}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}>{f.label}</button>
          ))}
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search PNR or train…"
          style={{ flex: 1, maxWidth: 280, padding: '8px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spinner size={36} color="var(--accent-blue)" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <div style={{ textAlign: 'center', padding: '40px 24px' }}>
            <Icon name="ticket" size={40} style={{ color: 'var(--text-faint)', margin: '0 auto 12px', display: 'block' }} />
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {filter === 'upcoming' ? 'No upcoming journeys' : 'No bookings found'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {filter === 'upcoming' ? 'All your trips are in the past or cancelled.' : 'Book a train from the Search page to get started.'}
            </div>
          </div>
        </Card>
      ) : (
        filtered.map((b, i) => (
          <BookingCard key={getRecordId(b) || i} booking={b} onCancel={handleCancel} cancelling={cancelling} />
        ))
      )}

      {/* Cancel Confirmation Modal */}
      {cancelTarget && (
        <CancelModal
          booking={cancelTarget}
          cancelling={cancelling}
          onConfirm={handleCancelConfirm}
          onClose={() => !cancelling && setCancelTarget(null)}
        />
      )}
    </div>
  );
}