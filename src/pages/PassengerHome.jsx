/**
 * PassengerHome v2 — Enhanced passenger dashboard.
 * New features:
 *  - Upcoming-trip countdown timer (updates every minute)
 *  - Swipeable carousel for upcoming journeys (CSS scroll-snap + arrow buttons)
 *  - Travel stats bar (trips, confirmed, spent, fav class)
 *  - Dismissable announcement banner
 */
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { aiApi, bookingsApi, extractRecords } from '../services/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  font:    "'Inter', system-ui, sans-serif",
  bg:      '#0a0d14',
  surface: '#111827',
  border:  '#1e2433',
  blue:    '#2E5FB3',
  green:   '#16a34a',
  orange:  '#d97706',
  red:     '#dc2626',
  purple:  '#7c3aed',
  teal:    '#0891b2',
  text:    '#f9fafb',
  muted:   '#9ca3af',
  faint:   '#6b7280',
};

// ─── Utilities ────────────────────────────────────────────────────────────────
function parseJourneyDate(jd) {
  if (!jd) return null;
  try {
    if (/^\d{4}-\d{2}-\d{2}/.test(jd)) return new Date(jd.slice(0, 10) + 'T00:00:00');
    const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
    const m = jd.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
    if (m) return new Date(+m[3], MONTHS[m[2]] ?? 0, +m[1]);
  } catch {}
  return null;
}

// ─── CountdownTimer ───────────────────────────────────────────────────────────
function CountdownTimer({ journeyDate }) {
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    const target = parseJourneyDate(journeyDate);
    if (!target) return;
    const tick = () => {
      const ms = target - Date.now();
      if (ms <= 0) { setDiff(null); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setDiff({ d, h, m });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [journeyDate]);

  if (!diff) return null;
  const urgent = diff.d === 0;
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: T.faint, fontFamily: T.font }}>Departs in</span>
      {diff.d > 0 && <Chip value={diff.d} unit="d" urgent={urgent} />}
      <Chip value={diff.h} unit="h" urgent={urgent} />
      <Chip value={diff.m} unit="m" urgent={urgent} />
    </div>
  );
}
function Chip({ value, unit, urgent }) {
  return (
    <span style={{
      background: urgent ? '#2a0f0f' : '#0f1a2a',
      border: `1px solid ${urgent ? T.red : T.blue}`,
      color: urgent ? '#f87171' : '#60a5fa',
      borderRadius: 6, padding: '2px 7px',
      fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
    }}>
      {String(value).padStart(2,'0')}<span style={{ fontSize: 9, opacity: 0.7 }}>{unit}</span>
    </span>
  );
}

// ─── QuickAction tile ─────────────────────────────────────────────────────────
const QuickAction = ({ icon, label, color, onClick }) => (
  <button onClick={onClick}
    style={{
      background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: '18px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 8, transition: 'all 0.15s', flex: 1, minWidth: 88,
      borderTop: `3px solid ${color}`,
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 4px 16px ${color}20`; }}
    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
  >
    <span style={{ fontSize: 26 }}>{icon}</span>
    <span style={{ fontSize: 11, color: T.muted, fontFamily: T.font, fontWeight: 500, textAlign: 'center' }}>{label}</span>
  </button>
);

// ─── Stat tile ────────────────────────────────────────────────────────────────
const Stat = ({ value, label, color = T.blue }) => (
  <div style={{ textAlign: 'center', padding: '14px 20px', flex: 1 }}>
    <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: T.font }}>{value}</div>
    <div style={{ fontSize: 11, color: T.faint, fontFamily: T.font, marginTop: 2 }}>{label}</div>
  </div>
);

// ─── RecommendedTrain ─────────────────────────────────────────────────────────
const RecommendedTrain = ({ rec, onBook }) => {
  const train = rec.train || {};
  const from  = (typeof train.From_Station === 'object' ? train.From_Station?.display_value : train.From_Station || '').split('-')[0];
  const to    = (typeof train.To_Station   === 'object' ? train.To_Station?.display_value   : train.To_Station   || '').split('-')[0];
  return (
    <div style={{
      background: T.bg, border: `1px solid ${T.border}`, borderRadius: 10,
      padding: '11px 14px', marginBottom: 8,
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10,
      transition: 'border-color 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = T.blue}
      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>{train.Train_Name || 'Train'}</div>
        <div style={{ fontSize: 11, color: T.faint, fontFamily: T.font }}>{from} → {to}</div>
        <div style={{ fontSize: 10, color: T.blue, marginTop: 2, fontFamily: T.font }}>{rec.reason}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.green, fontFamily: T.font }}>₹{train.Fare_SL || '—'}</div>
        <button onClick={() => onBook(train)} style={{
          marginTop: 5, padding: '4px 12px', borderRadius: 6, background: T.blue,
          border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: T.font,
        }}>Book</button>
      </div>
    </div>
  );
};

// ─── Journey card for carousel ───────────────────────────────────────────────
const JourneyCard = ({ booking, active }) => {
  const trainName = typeof booking.Trains === 'object'
    ? booking.Trains?.display_value : (booking.Trains || 'Train');
  const statusColor = {
    confirmed: T.green, cancelled: T.red, waitlisted: T.orange,
  }[(booking.Booking_Status || '').toLowerCase()] || T.muted;

  return (
    <div style={{
      minWidth: '100%', background: T.bg,
      border: `1px solid ${active ? T.blue : T.border}`,
      borderRadius: 12, padding: '14px 16px',
      boxShadow: active ? `0 0 0 1px ${T.blue}40` : 'none',
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>{trainName}</div>
          <div style={{ fontSize: 11, color: T.faint, fontFamily: T.font, marginTop: 2 }}>{booking.Journey_Date}</div>
        </div>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 12,
          background: `${statusColor}22`, color: statusColor, border: `1px solid ${statusColor}40`,
          fontFamily: T.font,
        }}>
          {booking.Booking_Status || 'Confirmed'}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <div style={{ fontSize: 11, fontFamily: T.font }}>
          <span style={{ color: T.faint }}>PNR: </span>
          <span style={{ color: T.text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{booking.PNR}</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: T.font }}>
          <span style={{ color: T.faint }}>Class: </span>
          <span style={{ color: T.muted, fontWeight: 600 }}>{booking.Class || '—'}</span>
        </div>
        <div style={{ fontSize: 11, fontFamily: T.font }}>
          <span style={{ color: T.faint }}>Fare: </span>
          <span style={{ color: T.green, fontWeight: 600 }}>₹{booking.Total_Fare || '—'}</span>
        </div>
      </div>
      <CountdownTimer journeyDate={booking.Journey_Date} />
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
export default function PassengerHome({ user }) {
  const navigate         = useNavigate();
  const carouselRef      = useRef(null);
  const [upcoming,  setUpcoming]    = useState([]);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [recs,      setRecs]        = useState([]);
  const [stats,     setStats]       = useState(null);
  const [loading,   setLoading]     = useState(true);
  const [banner,    setBanner]      = useState(null);  // { text, color }
  const [dismissed, setDismissed]   = useState(false);

  useEffect(() => {
    if (user?.ID) loadData(user.ID);
    else setLoading(false);
  }, [user?.ID]);

  async function loadData(userId) {
    setLoading(true);
    try {
      const [bookRes, recRes] = await Promise.allSettled([
        bookingsApi.getAll({ user_id: userId }),
        aiApi.recommendations(userId),
      ]);

      if (bookRes.status === 'fulfilled') {
        const all   = extractRecords(bookRes.value);
        const todayS = new Date().toISOString().slice(0, 10);
        const future = all.filter(b => {
          const jd = (b.Journey_Date || '');
          try {
            const d = jd.includes('-') && jd.length >= 10 ? jd.slice(0, 10)
              : new Date(jd).toISOString().slice(0, 10);
            return d >= todayS && (b.Booking_Status || '').toLowerCase() !== 'cancelled';
          } catch { return false; }
        }).sort((a, b) => (a.Journey_Date || '') < (b.Journey_Date || '') ? -1 : 1);
        setUpcoming(future.slice(0, 5));

        // Compute simple stats
        const confirmed  = all.filter(b => (b.Booking_Status||'').toLowerCase() === 'confirmed').length;
        const cancelled  = all.filter(b => (b.Booking_Status||'').toLowerCase() === 'cancelled').length;
        const spent      = all.reduce((s, b) => s + (Number(b.Total_Fare) || 0), 0);
        const classes    = all.map(b => b.Class).filter(Boolean);
        const favClass   = classes.length
          ? Object.entries(classes.reduce((acc, c) => { acc[c] = (acc[c]||0)+1; return acc; }, {}))
              .sort((a,b) => b[1]-a[1])[0][0]
          : '—';
        setStats({ total: all.length, confirmed, cancelled, spent, favClass });

        // Show banner if a journey is within 24 hours
        const soon = future.find(b => {
          const d = parseJourneyDate(b.Journey_Date);
          return d && d - Date.now() < 86400000;
        });
        if (soon) {
          setBanner({ text: `⏰ Reminder: Your journey "${typeof soon.Trains === 'object' ? soon.Trains?.display_value : soon.Trains}" departs tomorrow!`, color: T.orange });
        }
      }
      if (recRes.status === 'fulfilled') setRecs(recRes.value?.recommendations || []);
    } catch { /* fail silently */ }
    finally   { setLoading(false); }
  }

  const scrollCarousel = dir => {
    const next = Math.max(0, Math.min(upcoming.length - 1, carouselIdx + dir));
    setCarouselIdx(next);
    carouselRef.current?.children[next]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  };

  const qas = [
    { icon: '🔍', label: 'Search Trains',  path: '/search',        color: T.blue   },
    { icon: '📋', label: 'My Bookings',    path: '/my-bookings',   color: T.green  },
    { icon: '🔢', label: 'PNR Status',     path: '/pnr-status',    color: T.orange },
    { icon: '❌', label: 'Cancel Ticket',  path: '/cancel-ticket', color: T.red    },
    { icon: '📅', label: 'Schedule',       path: '/train-schedule',color: T.purple },
    { icon: '🤖', label: 'AI Assistant',   path: null,             color: T.teal   },
  ];

  return (
    <div style={{ fontFamily: T.font, paddingBottom: 60 }}>

      {/* ── Announcement Banner ── */}
      {banner && !dismissed && (
        <div style={{
          background: `${T.orange}18`, border: `1px solid ${T.orange}40`,
          borderRadius: 10, padding: '11px 16px', marginBottom: 16,
          display: 'flex', alignItems: 'center', gap: 10,
          animation: 'fadeIn 0.3s ease',
        }}>
          <span style={{ flex: 1, fontSize: 13, color: T.orange, fontFamily: T.font }}>{banner.text}</span>
          <button onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: T.faint, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            aria-label="Dismiss banner">×</button>
        </div>
      )}

      {/* ── Hero / Welcome ── */}
      <div style={{
        background: 'linear-gradient(135deg, #112240 0%, #1d3461 50%, #2E5FB3 100%)',
        borderRadius: 16, padding: '26px 28px', marginBottom: 20, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', right:-40, top:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.04)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', right:40, bottom:-60, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.03)', pointerEvents:'none' }} />
        <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 5 }}>
          Welcome back, {user?.Full_Name?.split(' ')[0] || 'Traveller'} 👋
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 16 }}>
          {upcoming.length
            ? `You have ${upcoming.length} upcoming journey${upcoming.length > 1 ? 's' : ''} — keep rolling!`
            : 'No upcoming journeys. Ready to plan your next adventure?'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/search')} style={{
            padding: '8px 22px', background: '#fff', color: T.blue, border: 'none',
            borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: T.font,
          }}>Search Trains →</button>
          {upcoming.length > 0 && (
            <button onClick={() => navigate('/my-bookings')} style={{
              padding: '8px 18px', background: 'rgba(255,255,255,0.12)', color: '#fff',
              border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8,
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: T.font,
            }}>My Bookings</button>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {qas.map(a => (
          <QuickAction key={a.label} {...a} onClick={() => a.path ? navigate(a.path) : {}} />
        ))}
      </div>

      {/* ── Stats Bar ── */}
      {stats && stats.total > 0 && (
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap',
          marginBottom: 20, overflow: 'hidden',
        }}>
          {[
            { value: stats.total,                                    label: 'Total Trips',   color: T.blue   },
            { value: stats.confirmed,                                label: 'Confirmed',     color: T.green  },
            { value: stats.cancelled,                                label: 'Cancelled',     color: T.red    },
            { value: `₹${stats.spent.toLocaleString('en-IN')}`,     label: 'Total Spent',   color: T.orange },
            { value: stats.favClass,                                 label: 'Fav Class',     color: T.purple },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              flex: 1, borderRight: i < arr.length - 1 ? `1px solid ${T.border}` : 'none',
            }}>
              <Stat {...s} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Upcoming Journeys Carousel ── */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>🗓️ Upcoming Journeys</div>
            {upcoming.length > 1 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: T.faint, fontFamily: T.font }}>{carouselIdx + 1}/{upcoming.length}</span>
                <button onClick={() => scrollCarousel(-1)} disabled={carouselIdx === 0}
                  aria-label="Previous journey"
                  style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: 'none', color: carouselIdx === 0 ? T.faint : T.muted, cursor: carouselIdx === 0 ? 'default' : 'pointer', fontSize: 12 }}>‹</button>
                <button onClick={() => scrollCarousel(1)} disabled={carouselIdx === upcoming.length - 1}
                  aria-label="Next journey"
                  style={{ width: 26, height: 26, borderRadius: 6, border: `1px solid ${T.border}`, background: 'none', color: carouselIdx === upcoming.length - 1 ? T.faint : T.muted, cursor: carouselIdx === upcoming.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>›</button>
              </div>
            )}
          </div>
          {loading ? (
            <div style={{ color: T.faint, fontSize: 13 }}>Loading…</div>
          ) : upcoming.length > 0 ? (
            <>
              <div ref={carouselRef} style={{
                display: 'flex', gap: 12, overflowX: 'hidden',
                scrollSnapType: 'x mandatory', scrollBehavior: 'smooth',
              }}>
                {upcoming.map((b, i) => (
                  <JourneyCard key={b.ID || i} booking={b} active={i === carouselIdx} />
                ))}
              </div>
              {/* Dot indicators */}
              {upcoming.length > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginTop: 10 }}>
                  {upcoming.map((_, i) => (
                    <div key={i} onClick={() => scrollCarousel(i - carouselIdx)}
                      style={{
                        width: i === carouselIdx ? 16 : 6, height: 6, borderRadius: 3,
                        background: i === carouselIdx ? T.blue : T.border, cursor: 'pointer',
                        transition: 'all 0.2s',
                      }} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🚂</div>
              <div style={{ fontSize: 13, color: T.faint, fontFamily: T.font }}>No upcoming journeys</div>
              <button onClick={() => navigate('/search')} style={{
                marginTop: 10, padding: '6px 16px', background: T.blue, border: 'none',
                color: '#fff', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: T.font,
              }}>Plan a Trip →</button>
            </div>
          )}
          {upcoming.length > 0 && (
            <button onClick={() => navigate('/my-bookings')} style={{
              marginTop: 12, fontSize: 12, color: T.blue, background: 'none',
              border: 'none', cursor: 'pointer', fontFamily: T.font, padding: 0,
            }}>View all bookings →</button>
          )}
        </div>

        {/* ── AI Recommendations ── */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: T.text }}>✨ Recommended for You</span>
            <span style={{ fontSize: 9, fontWeight: 700, background: `${T.blue}22`, color: T.blue, border: `1px solid ${T.blue}40`, borderRadius: 8, padding: '2px 6px', fontFamily: T.font }}>
              AI
            </span>
          </div>
          {loading ? (
            <div style={{ color: T.faint, fontSize: 13 }}>Loading…</div>
          ) : recs.length > 0 ? recs.map((r, i) => (
            <RecommendedTrain key={i} rec={r} onBook={t => navigate('/search', { state: { train: t } })} />
          )) : (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>🤖</div>
              <div style={{ fontSize: 13, color: T.faint, fontFamily: T.font }}>
                Book a few trips and we'll personalise recommendations for you.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
