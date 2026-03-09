/**
 * OverviewPage.jsx — Admin Dashboard
 * Live stats: trains, bookings, users, revenue
 * Recent bookings table + quick-action cards
 * Matches existing dark theme + Zoho data patterns
 */
import { useState, useEffect, useCallback } from 'react';
import {
  overviewApi, bookingsApi, trainsApi,
  extractRecords, getRecordId,
  displayZohoDate, displayZohoDateTime,
} from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Icon, Badge, Spinner } from '../components/UI';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getLookup(f) {
  if (!f) return '—';
  if (typeof f === 'object') return f.display_value || f.ID || '—';
  return String(f);
}

function fmtCurrency(n) {
  const num = Number(n) || 0;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000)   return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN')}`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, iconColor, iconBg, label, value, sub, loading, trend }) {
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border)',
      borderRadius: 14, padding: '20px 22px',
      display: 'flex', flexDirection: 'column', gap: 12,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow background */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 80, height: 80, borderRadius: '50%',
        background: `${iconBg}30`, filter: 'blur(20px)',
      }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon name={icon} size={19} style={{ color: iconColor }} />
        </div>
        {trend !== undefined && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 20,
            background: trend >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
            color: trend >= 0 ? '#22c55e' : '#f87171',
            fontFamily: FONT,
          }}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>

      <div>
        {loading ? (
          <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
            <Spinner size={18} color={iconColor} />
          </div>
        ) : (
          <div style={{
            fontSize: 28, fontWeight: 800, color: 'var(--text-primary)',
            fontFamily: FONT, lineHeight: 1,
          }}>
            {value ?? '—'}
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5, fontFamily: FONT }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 11, color: iconColor, marginTop: 4, fontWeight: 600, fontFamily: FONT }}>
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Mini progress bar ────────────────────────────────────────────────────────
function MiniBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: FONT }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color, fontFamily: MONO }}>{count} <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>({pct}%)</span></span>
      </div>
      <div style={{ height: 5, borderRadius: 10, background: '#1e2433', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 10, transition: 'width 0.8s ease' }} />
      </div>
    </div>
  );
}

// ─── Recent bookings row ──────────────────────────────────────────────────────
function BookingRow({ b, idx }) {
  const pnr      = b.PNR || '—';
  const trainRef = getLookup(b.Trains);
  const userRef  = getLookup(b.Users);
  const jd       = displayZohoDate(b.Journey_Date);
  const fare     = Number(b.Total_Fare || 0);
  const status   = (b.Booking_Status || 'pending').toLowerCase();

  return (
    <tr
      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '11px 14px', fontSize: 11, color: '#6b7280', fontFamily: MONO }}>{idx + 1}</td>
      <td style={{ padding: '11px 14px' }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: '#60a5fa' }}>{pnr}</span>
      </td>
      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-secondary)', fontFamily: FONT, maxWidth: 180 }}>
        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{trainRef}</div>
      </td>
      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT }}>{userRef}</td>
      <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--text-muted)', fontFamily: MONO }}>{jd}</td>
      <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: 700, color: '#22c55e', fontFamily: MONO }}>
        {fare > 0 ? `₹${fare.toLocaleString('en-IN')}` : '—'}
      </td>
      <td style={{ padding: '11px 14px' }}>
        <Badge status={status} />
      </td>
    </tr>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function OverviewPage() {
  const { addToast } = useToast();

  const [stats, setStats]         = useState(null);
  const [statsLoading, setSL]     = useState(true);
  const [recentBk, setRecentBk]   = useState([]);
  const [bkLoading, setBkL]       = useState(true);
  const [trainList, setTrainList] = useState([]);

  // ── Load stats
  useEffect(() => {
    setSL(true);
    overviewApi.stats()
      .then(res => setStats(res?.data ?? {}))
      .catch(() => addToast('Stats unavailable', 'error'))
      .finally(() => setSL(false));
  }, []);

  // ── Load recent bookings
  useEffect(() => {
    setBkL(true);
    bookingsApi.getAll({ limit: 200 })
      .then(res => {
        const all = extractRecords(res);
        // Sort by booking ID desc (newest first)
        const sorted = [...all].sort((a, b) => {
          const aid = String(a.ID || '');
          const bid = String(b.ID || '');
          return bid.localeCompare(aid);
        });
        setRecentBk(sorted.slice(0, 10));
      })
      .catch(() => {})
      .finally(() => setBkL(false));
  }, []);

  // ── Load trains for quick stats
  useEffect(() => {
    trainsApi.getAll({ limit: 500 })
      .then(res => setTrainList(extractRecords(res)))
      .catch(() => {});
  }, []);

  // ── Derived stats
  const totalRevenue = recentBk.reduce((s, b) => {
    if ((b.Booking_Status || '').toLowerCase() === 'confirmed')
      return s + Number(b.Total_Fare || 0);
    return s;
  }, 0);

  const confirmed  = recentBk.filter(b => (b.Booking_Status || '').toLowerCase() === 'confirmed').length;
  const pending    = recentBk.filter(b => (b.Booking_Status || '').toLowerCase() === 'pending').length;
  const cancelled  = recentBk.filter(b => (b.Booking_Status || '').toLowerCase() === 'cancelled').length;
  const totalBkNum = stats?.total_bookings || 0;
  const activeTrains = trainList.filter(t => String(t.Is_Active) !== 'false').length;

  const thStyle = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700,
    color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em',
    borderBottom: '1px solid var(--border)', background: 'var(--bg-inset)',
    textAlign: 'left', fontFamily: FONT, whiteSpace: 'nowrap',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <PageHeader
        icon="dashboard" iconAccent="#3b82f6"
        title="Dashboard Overview"
        subtitle="Real-time summary of railway operations"
      />

      {/* ── 4-stat row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        <StatCard
          icon="train"     iconColor="#60a5fa" iconBg="rgba(59,130,246,0.18)"
          label="Total Trains"   value={stats?.total_trains ?? '—'}
          sub={activeTrains ? `${activeTrains} active` : undefined}
          loading={statsLoading}
        />
        <StatCard
          icon="station"   iconColor="#a78bfa" iconBg="rgba(139,92,246,0.18)"
          label="Total Stations" value={stats?.total_stations ?? '—'}
          loading={statsLoading}
        />
        <StatCard
          icon="users"     iconColor="#34d399" iconBg="rgba(52,211,153,0.18)"
          label="Registered Users" value={stats?.total_users ?? '—'}
          loading={statsLoading}
        />
        <StatCard
          icon="booking"   iconColor="#fb923c" iconBg="rgba(251,146,60,0.18)"
          label="Total Bookings"  value={totalBkNum || '—'}
          sub={totalRevenue > 0 ? `${fmtCurrency(totalRevenue)} revenue (recent)` : undefined}
          loading={statsLoading}
        />
      </div>

      {/* ── Middle row: booking breakdown + top trains ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>

        {/* Booking status breakdown */}
        <Card>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 20, fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="booking" size={15} style={{ color: '#fb923c' }} />
            Booking Breakdown
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: MONO }}>last 10 loaded</span>
          </div>
          {bkLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={20} /></div>
          ) : (
            <>
              <MiniBar label="Confirmed" count={confirmed}  total={recentBk.length} color="#22c55e" />
              <MiniBar label="Pending"   count={pending}    total={recentBk.length} color="#f59e0b" />
              <MiniBar label="Cancelled" count={cancelled}  total={recentBk.length} color="#f87171" />

              {/* Revenue box */}
              <div style={{ marginTop: 20, padding: '14px 16px', borderRadius: 12, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: FONT }}>Confirmed Revenue</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', fontFamily: FONT, marginTop: 4 }}>
                  {fmtCurrency(totalRevenue)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: FONT }}>from recent bookings</div>
              </div>
            </>
          )}
        </Card>

        {/* Quick info cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          {[
            {
              icon: 'train', color: '#60a5fa', bg: 'rgba(59,130,246,0.08)',
              title: 'Train Fleet',
              lines: [
                { label: 'Total registered', val: trainList.length },
                { label: 'Active', val: activeTrains },
                { label: 'Inactive', val: trainList.length - activeTrains },
              ],
            },
            {
              icon: 'seat', color: '#a78bfa', bg: 'rgba(139,92,246,0.08)',
              title: 'Class Coverage',
              lines: [
                { label: 'Sleeper (SL)', val: trainList.filter(t => Number(t.Total_Seats_SL) > 0).length + ' trains' },
                { label: '3-Tier AC', val: trainList.filter(t => Number(t.Total_Seats_3A) > 0).length + ' trains' },
                { label: '2-Tier AC', val: trainList.filter(t => Number(t.Total_Seats_2A) > 0).length + ' trains' },
              ],
            },
            {
              icon: 'dollar', color: '#34d399', bg: 'rgba(52,211,153,0.08)',
              title: 'Avg Fare (per class)',
              lines: (() => {
                const sl  = trainList.filter(t => Number(t.Fare_SL) > 0);
                const a3  = trainList.filter(t => Number(t.Fare_3A) > 0);
                const a2  = trainList.filter(t => Number(t.Fare_2A) > 0);
                const avg = (arr, key) => arr.length ? Math.round(arr.reduce((s, t) => s + Number(t[key] || 0), 0) / arr.length) : 0;
                return [
                  { label: 'Sleeper avg', val: sl.length  ? `₹${avg(sl,  'Fare_SL')}` : '—' },
                  { label: '3AC avg',     val: a3.length  ? `₹${avg(a3,  'Fare_3A')}` : '—' },
                  { label: '2AC avg',     val: a2.length  ? `₹${avg(a2,  'Fare_2A')}` : '—' },
                ];
              })(),
            },
            {
              icon: 'clock', color: '#fb923c', bg: 'rgba(251,146,60,0.08)',
              title: 'System Status',
              lines: [
                { label: 'API Backend', val: '🟢 Connected' },
                { label: 'Zoho Creator', val: '🟢 Active' },
                { label: 'Last refresh', val: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) },
              ],
            },
          ].map(card => (
            <div key={card.title} style={{ background: card.bg, border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <Icon name={card.icon} size={15} style={{ color: card.color }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', fontFamily: FONT }}>{card.title}</span>
              </div>
              {card.lines.map(l => (
                <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT }}>{l.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', fontFamily: MONO }}>{l.val}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Bookings table ── */}
      <Card padding={0}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="booking" size={16} style={{ color: '#fb923c' }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT }}>Recent Bookings</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', fontFamily: FONT }}>latest 10</span>
        </div>

        {bkLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <Spinner size={28} color="#fb923c" />
          </div>
        ) : recentBk.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: 'var(--text-muted)', fontFamily: FONT }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>No bookings yet</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['#', 'PNR', 'Train', 'Passenger', 'Journey Date', 'Fare', 'Status'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBk.map((b, i) => (
                  <BookingRow key={b.ID || i} b={b} idx={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}