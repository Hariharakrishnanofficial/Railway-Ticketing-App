/**
 * PNRStatus.jsx — PNR Status Lookup
 * Fetches booking by PNR from /api/bookings/pnr/<pnr>
 * Shows full booking details, passenger list, seat numbers.
 * IRCTC-style timeline display.
 */
import { useState } from 'react';
import {
  displayZohoDate, displayZohoDateTime, parseZohoDateOnly,
} from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Icon, Badge, Spinner } from '../components/UI';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
const BASE  = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4600/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLookup(f) {
  if (!f) return '—';
  if (typeof f === 'object') return f.display_value || f.ID || '—';
  return String(f);
}

function parsePassengers(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function daysUntil(journeyDate) {
  if (!journeyDate) return null;
  const s = String(journeyDate).trim();
  let ymd = '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { ymd = s.slice(0, 10); }
  else {
    const MONTHS = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (m) ymd = `${m[3]}-${MONTHS[m[2]] || '01'}-${m[1]}`;
  }
  if (!ymd) return null;
  return Math.ceil((new Date(ymd) - new Date()) / 86400000);
}

// ─── Seat chip ────────────────────────────────────────────────────────────────
function SeatChip({ seat }) {
  const parts = String(seat).split('/');
  const coach = parts[0] || '';
  const num   = parts[1] || '';
  const berth = parts[2] || '';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 12px', borderRadius: 8,
      background: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.25)',
      fontFamily: MONO, fontSize: 12,
    }}>
      <span style={{ color: '#93c5fd', fontWeight: 700 }}>{coach}</span>
      {num && <><span style={{ color: '#4b5563' }}>·</span><span style={{ color: '#e2e8f0', fontWeight: 700 }}>{num}</span></>}
      {berth && <span style={{ color: '#a78bfa', fontSize: 10, fontWeight: 700 }}>{berth}</span>}
    </div>
  );
}

// ─── Journey status indicator ─────────────────────────────────────────────────
function JourneyBanner({ journeyDate, status }) {
  const days    = daysUntil(journeyDate);
  const bkStatus = (status || '').toLowerCase();

  if (bkStatus === 'cancelled') {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="x" size={16} style={{ color: '#f87171' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f87171', fontFamily: FONT }}>This ticket has been cancelled</span>
      </div>
    );
  }
  if (days === null) return null;
  if (days < 0) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="clock" size={16} style={{ color: '#94a3b8' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8', fontFamily: FONT }}>Journey completed — {Math.abs(days)} day{Math.abs(days) !== 1 ? 's' : ''} ago</span>
      </div>
    );
  }
  if (days === 0) {
    return (
      <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.25)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="train" size={16} style={{ color: '#f59e0b' }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', fontFamily: FONT }}>🚂 Journey is today!</span>
      </div>
    );
  }
  return (
    <div style={{ padding: '12px 16px', borderRadius: 10, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.20)', display: 'flex', alignItems: 'center', gap: 10 }}>
      <Icon name="calendar" size={16} style={{ color: '#4ade80' }} />
      <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80', fontFamily: FONT }}>
        Journey in <strong>{days} day{days !== 1 ? 's' : ''}</strong>
      </span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function PNRStatus() {
  const { addToast } = useToast();
  const [pnr, setPnr]         = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState('');

  const lookup = async () => {
    const trimmed = pnr.trim().toUpperCase();
    if (!trimmed) { setError('Please enter a PNR number'); return; }
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const res  = await fetch(`${BASE}/bookings/pnr/${trimmed}`).then(r => r.json());
      if (!res?.success) {
        setError(res?.error || `No booking found for PNR: ${trimmed}`);
      } else {
        const rec = res?.data?.data ?? res?.data ?? res;
        setResult(rec);
      }
    } catch (err) {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  };

  const passengers  = result ? parsePassengers(result.Passengers) : [];
  const seats       = result?.Seat_Numbers ? String(result.Seat_Numbers).split(',').map(s => s.trim()).filter(Boolean) : [];
  const trainName   = result ? getLookup(result.Trains) : '—';
  const userName    = result ? getLookup(result.Users)  : '—';
  const fareNum     = Number(result?.Total_Fare || 0);
  const status      = (result?.Booking_Status || '').toLowerCase();

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader icon="health" iconAccent="#06b6d4" title="PNR Status"
        subtitle="Enter your PNR number to check booking details" />

      {/* Search box */}
      <Card>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: 10 }}>
          PNR Number
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <input
            value={pnr}
            onChange={e => { setPnr(e.target.value.toUpperCase()); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') lookup(); }}
            placeholder="Enter 10-digit PNR e.g. PNR1A2B3C4D"
            maxLength={20}
            style={{
              flex: 1, padding: '11px 14px', borderRadius: 10,
              background: '#0a0d14', border: `1.5px solid ${error ? '#ef4444' : '#1e2433'}`,
              color: '#e2e8f0', fontSize: 14, fontFamily: MONO, outline: 'none',
              letterSpacing: '0.06em', transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = '#06b6d4'; }}
            onBlur={e => { e.target.style.borderColor = error ? '#ef4444' : '#1e2433'; }}
          />
          <button onClick={lookup} disabled={loading}
            style={{ padding: '11px 22px', borderRadius: 10, border: 'none', background: loading ? '#1e2433' : '#0891b2', color: loading ? '#6b7280' : '#fff', fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, boxShadow: loading ? 'none' : '0 4px 16px rgba(8,145,178,0.3)', transition: 'all 0.15s' }}>
            {loading ? <Spinner size={15} color="#6b7280" /> : <Icon name="search" size={15} />}
            {loading ? 'Searching…' : 'Check Status'}
          </button>
        </div>
        {error && (
          <div style={{ marginTop: 10, padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#f87171', fontSize: 13, fontFamily: FONT }}>
            {error}
          </div>
        )}
      </Card>

      {/* Result */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.25s ease' }}>

          {/* Journey banner */}
          <JourneyBanner journeyDate={result.Journey_Date} status={result.Booking_Status} />

          {/* Main info card */}
          <Card>
            {/* PNR header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT, marginBottom: 4 }}>PNR Number</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#06b6d4', fontFamily: MONO, letterSpacing: '0.05em' }}>{result.PNR}</div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                <Badge status={status} />
                {result.Payment_Status && (
                  <Badge status={(result.Payment_Status || '').toLowerCase()} />
                )}
              </div>
            </div>

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
              {[
                { label: 'Train',         value: trainName, icon: 'train',    color: '#60a5fa' },
                { label: 'Passenger',     value: userName,  icon: 'users',    color: '#a78bfa' },
                { label: 'Journey Date',  value: displayZohoDate(result.Journey_Date), icon: 'calendar', color: '#34d399' },
                { label: 'Class',         value: result.Class || '—',  icon: 'seat',     color: '#fb923c' },
                { label: 'Passengers',    value: `${Number(result.Passenger_Count) || 1} pax`, icon: 'users', color: '#f472b6' },
                { label: 'Total Fare',    value: fareNum > 0 ? `₹${fareNum.toLocaleString('en-IN')}` : '—', icon: 'dollar', color: '#22c55e' },
                { label: 'Quota',         value: result.Quota || 'GN', icon: 'booking', color: '#fbbf24' },
                { label: 'Booked On',     value: displayZohoDateTime(result.Booking_Time) || '—', icon: 'clock', color: '#94a3b8' },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: `${row.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={row.icon} size={15} style={{ color: row.color }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{row.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT, marginTop: 2 }}>{row.value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cancellation info if cancelled */}
            {status === 'cancelled' && result.Cancellation_Time && (
              <div style={{ marginTop: 18, padding: '12px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#f87171', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: FONT, marginBottom: 4 }}>Cancellation Details</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT }}>
                  Cancelled on: <strong style={{ color: 'var(--text-secondary)' }}>{displayZohoDateTime(result.Cancellation_Time)}</strong>
                  {Number(result.Refund_Amount) > 0 && (
                    <span style={{ marginLeft: 12, color: '#4ade80', fontWeight: 700 }}>
                      Refund: ₹{Number(result.Refund_Amount).toLocaleString('en-IN')}
                    </span>
                  )}
                </div>
              </div>
            )}
          </Card>

          {/* Seat assignments */}
          {seats.length > 0 && (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="seat" size={15} style={{ color: '#60a5fa' }} />
                Seat Assignments
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {seats.map((seat, i) => <SeatChip key={i} seat={seat} />)}
              </div>
            </Card>
          )}

          {/* Passengers */}
          {passengers.length > 0 && (
            <Card>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="users" size={15} style={{ color: '#a78bfa' }} />
                Passenger Details
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {passengers.map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', borderRadius: 10, background: 'var(--bg-inset)', border: '1px solid var(--border)' }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                      {(p.name || p.Name || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT }}>{p.name || p.Name || `Passenger ${i + 1}`}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: FONT, display: 'flex', gap: 10, marginTop: 2 }}>
                        {p.age && <span>{p.age} yrs</span>}
                        {p.gender && <span>· {p.gender}</span>}
                        {p.idType && <span>· {p.idType}: {p.idNumber}</span>}
                      </div>
                    </div>
                    {p.berthPref && p.berthPref !== 'No Preference' && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.2)', fontFamily: FONT }}>
                        {p.berthPref}
                      </span>
                    )}
                    {seats[i] && <SeatChip seat={seats[i]} />}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}