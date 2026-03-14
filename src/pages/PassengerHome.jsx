/**
 * PassengerHome — Passenger dashboard with AI recommendations + travel insights.
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi, usersApi, bookingsApi, extractRecords } from '../services/api';

const FONT  = "'Inter', system-ui, sans-serif";
const BLUE  = '#2E5FB3'; const GREEN = '#16a34a';
const ORANGE= '#d97706'; const GRAY  = '#6b7280';

const QuickAction = ({ icon, label, path, color, onClick }) => (
  <button onClick={onClick} style={{
    background: '#111827', border: `1px solid #1e2433`, borderRadius: 12,
    padding: '20px 16px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 8, transition: 'all 0.15s', flex: 1, minWidth: 100,
    borderTop: `3px solid ${color}`,
  }}
    onMouseOver={e => e.currentTarget.style.borderColor = color}
    onMouseOut={e => e.currentTarget.style.borderColor = '#1e2433'}
  >
    <span style={{ fontSize: 28 }}>{icon}</span>
    <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: FONT, fontWeight: 500 }}>{label}</span>
  </button>
);

const InsightStat = ({ value, label, color = BLUE }) => (
  <div style={{ textAlign: 'center', padding: '12px 16px' }}>
    <div style={{ fontSize: 26, fontWeight: 700, color, fontFamily: FONT }}>{value}</div>
    <div style={{ fontSize: 11, color: GRAY, fontFamily: FONT }}>{label}</div>
  </div>
);

const RecommendedTrain = ({ rec, onBook }) => {
  const train = rec.train || {};
  const from  = typeof train.From_Station === 'object'
    ? (train.From_Station?.display_value || '').split('-')[0] : train.From_Station || '';
  const to    = typeof train.To_Station === 'object'
    ? (train.To_Station?.display_value || '').split('-')[0] : train.To_Station || '';

  return (
    <div style={{
      background: '#0a0d14', border: '1px solid #1e2433', borderRadius: 10,
      padding: '12px 16px', marginBottom: 10,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb', fontFamily: FONT }}>
          {train.Train_Name || 'Train'}
        </div>
        <div style={{ fontSize: 12, color: GRAY, fontFamily: FONT }}>
          {from} → {to} &nbsp;|&nbsp; {train.Departure_Time || '—'}
        </div>
        <div style={{ fontSize: 11, color: BLUE, marginTop: 3, fontFamily: FONT }}>
          {rec.reason}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: GREEN, fontFamily: FONT }}>
          ₹{train.Fare_SL || '—'}
        </div>
        <button onClick={() => onBook(train)} style={{
          marginTop: 4, padding: '4px 12px', borderRadius: 6,
          background: BLUE, border: 'none', color: '#fff',
          fontSize: 11, cursor: 'pointer', fontFamily: FONT,
        }}>
          Book
        </button>
      </div>
    </div>
  );
};

export default function PassengerHome({ user }) {
  const navigate    = useNavigate();
  const [upcoming,  setUpcoming]  = useState([]);
  const [insights,  setInsights]  = useState(null);
  const [recs,      setRecs]      = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    if (user?.ID) loadData(user.ID);
    else setLoading(false);
  }, [user?.ID]);

  async function loadData(userId) {
    setLoading(true);
    try {
      const [bookRes, insRes, recRes] = await Promise.allSettled([
        bookingsApi.getAll({ user_id: userId }),
        usersApi.getById ? fetch(`/api/users/${userId}/insights`).then(r => r.json()) : Promise.resolve(null),
        aiApi.recommendations(userId),
      ]);

      if (bookRes.status === 'fulfilled') {
        const all    = extractRecords(bookRes.value);
        const today  = new Date().toISOString().slice(0, 10);
        const future = all.filter(b => {
          const jd = b.Journey_Date || '';
          try {
            const d = jd.includes('-') && jd.split('-')[0].length === 4
              ? jd.slice(0, 10)
              : new Date(jd).toISOString().slice(0, 10);
            return d >= today && (b.Booking_Status || '').toLowerCase() !== 'cancelled';
          } catch { return false; }
        });
        setUpcoming(future.slice(0, 3));
      }

      if (insRes.status === 'fulfilled' && insRes.value?.data) {
        setInsights(insRes.value.data);
      }

      if (recRes.status === 'fulfilled') {
        setRecs(recRes.value?.recommendations || []);
      }
    } catch (e) { /* fail silently */ }
    finally { setLoading(false); }
  }

  const quickActions = [
    { icon: '🔍', label: 'Search Trains', path: '/search',       color: BLUE },
    { icon: '📋', label: 'My Bookings',   path: '/my-bookings',  color: GREEN },
    { icon: '🔢', label: 'PNR Status',    path: '/pnr-status',   color: ORANGE },
    { icon: '❌', label: 'Cancel Ticket', path: '/cancel-ticket', color: '#dc2626' },
    { icon: '📅', label: 'Schedule',      path: '/train-schedule', color: '#7c3aed' },
    { icon: '🤖', label: 'AI Assistant',  path: '/ai-assistant',  color: '#0891b2' },
  ];

  return (
    <div style={{ fontFamily: FONT, paddingBottom: 60 }}>
      {/* Welcome */}
      <div style={{
        background: 'linear-gradient(135deg, #1a3a6b 0%, #2E5FB3 100%)',
        borderRadius: 16, padding: '24px 28px', marginBottom: 24,
      }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
          Welcome back, {user?.Full_Name?.split(' ')[0] || 'Traveller'} 👋
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 }}>
          {upcoming.length
            ? `You have ${upcoming.length} upcoming journey${upcoming.length > 1 ? 's' : ''}.`
            : 'No upcoming journeys. Ready to plan your next trip?'}
        </div>
        <button onClick={() => navigate('/search')} style={{
          marginTop: 14, padding: '8px 20px', background: '#fff',
          color: BLUE, border: 'none', borderRadius: 8, fontWeight: 600,
          fontSize: 13, cursor: 'pointer', fontFamily: FONT,
        }}>
          Search Trains →
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 24 }}>
        {quickActions.map(a => (
          <QuickAction key={a.label} {...a} onClick={() => navigate(a.path)} />
        ))}
      </div>

      {/* Travel insights row */}
      {insights && (
        <div style={{
          background: '#111827', border: '1px solid #1e2433', borderRadius: 12,
          padding: '16px 0', marginBottom: 24,
          display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap',
        }}>
          <InsightStat value={insights.total_bookings}          label="Total Trips"          />
          <InsightStat value={insights.confirmed}               label="Confirmed"   color={GREEN}  />
          <InsightStat value={insights.cancelled}               label="Cancelled"   color="#dc2626"/>
          <InsightStat value={`₹${(insights.total_spent||0).toLocaleString()}`} label="Total Spent" color={ORANGE} />
          <InsightStat value={insights.preferred_class || '—'}  label="Fav Class"   color="#7c3aed"/>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Upcoming journeys */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 14 }}>
            🗓️ Upcoming Journeys
          </div>
          {loading ? (
            <div style={{ color: GRAY, fontSize: 13 }}>Loading…</div>
          ) : upcoming.length ? upcoming.map((b, i) => (
            <div key={b.ID || i} style={{
              padding: '10px 0', borderBottom: i < upcoming.length - 1 ? '1px solid #1e2433' : 'none',
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f9fafb', fontFamily: FONT }}>
                PNR: {b.PNR}
              </div>
              <div style={{ fontSize: 12, color: GRAY, fontFamily: FONT }}>
                {typeof b.Trains === 'object' ? b.Trains?.display_value : b.Trains} &nbsp;|&nbsp; {b.Journey_Date}
              </div>
              <div style={{ fontSize: 11, color: GREEN, marginTop: 2, fontFamily: FONT }}>
                {b.Class} · {b.Booking_Status}
              </div>
            </div>
          )) : (
            <div style={{ color: GRAY, fontSize: 13 }}>No upcoming journeys.</div>
          )}
          <button onClick={() => navigate('/my-bookings')} style={{
            marginTop: 12, fontSize: 12, color: BLUE, background: 'none',
            border: 'none', cursor: 'pointer', fontFamily: FONT, padding: 0,
          }}>
            View all bookings →
          </button>
        </div>

        {/* AI Recommendations */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb' }}>✨ Recommended for You</span>
            <span style={{ fontSize: 10, background: '#1e2433', color: GRAY, borderRadius: 8, padding: '2px 6px' }}>
              AI
            </span>
          </div>
          {loading ? (
            <div style={{ color: GRAY, fontSize: 13 }}>Loading recommendations…</div>
          ) : recs.length ? recs.map((r, i) => (
            <RecommendedTrain key={i} rec={r} onBook={t => navigate('/search', { state: { train: t } })} />
          )) : (
            <div style={{ color: GRAY, fontSize: 13 }}>
              Book a few trips and we'll personalise recommendations for you.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
