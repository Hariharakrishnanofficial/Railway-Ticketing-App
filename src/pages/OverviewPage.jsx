/**
 * OverviewPage — Admin dashboard with live analytics + AI insights.
 * Uses /api/analytics/* endpoints and /api/ai/analyze for Gemini commentary.
 */
import { useState, useEffect } from 'react';
import { analyticsApi, aiApi } from '../services/api';
import { PageHeader, Card, Spinner } from '../components/UI';
import { useToast } from '../context/ToastContext';

const FONT = "'Inter', system-ui, sans-serif";
const BLUE = '#2E5FB3'; const GREEN = '#16a34a'; const ORANGE = '#d97706';
const RED  = '#dc2626'; const GRAY  = '#6b7280';

const StatCard = ({ label, value, sub, color = BLUE, icon }) => (
  <div style={{
    background: '#111827', border: '1px solid #1e2433', borderRadius: 12,
    padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6,
    borderTop: `3px solid ${color}`,
  }}>
    <div style={{ fontSize: 28, marginBottom: 2 }}>{icon}</div>
    <div style={{ fontSize: 28, fontWeight: 700, color: '#f9fafb', fontFamily: FONT }}>{value}</div>
    <div style={{ fontSize: 13, color: '#9ca3af', fontFamily: FONT }}>{label}</div>
    {sub && <div style={{ fontSize: 11, color: color, fontWeight: 600 }}>{sub}</div>}
  </div>
);

const BarChart = ({ data, title, colorFn }) => {
  if (!data || !Object.keys(data).length) return null;
  const max = Math.max(...Object.values(data));
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 13, color: '#9ca3af', marginBottom: 10, fontFamily: FONT }}>{title}</div>
      {Object.entries(data).map(([k, v]) => (
        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 60, fontSize: 11, color: '#9ca3af', textAlign: 'right', fontFamily: FONT }}>{k}</div>
          <div style={{ flex: 1, background: '#1e2433', borderRadius: 4, height: 18, overflow: 'hidden' }}>
            <div style={{
              width: `${max > 0 ? (v / max) * 100 : 0}%`, height: '100%',
              background: colorFn ? colorFn(k) : BLUE, borderRadius: 4,
              transition: 'width 0.6s ease',
            }} />
          </div>
          <div style={{ width: 32, fontSize: 11, color: '#e5e7eb', fontFamily: FONT }}>{v}</div>
        </div>
      ))}
    </div>
  );
};

const TopTrainRow = ({ train, rank }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
    borderBottom: '1px solid #1e2433',
  }}>
    <div style={{ width: 24, height: 24, borderRadius: '50%', background: rank <= 3 ? ORANGE : '#1e2433',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
      {rank}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, color: '#f9fafb', fontWeight: 600, fontFamily: FONT,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {train.name || train.train_id}
      </div>
      <div style={{ fontSize: 11, color: GRAY, fontFamily: FONT }}>{train.count} bookings</div>
    </div>
    <div style={{ fontSize: 13, color: GREEN, fontWeight: 600, fontFamily: FONT }}>
      ₹{(train.revenue || 0).toLocaleString()}
    </div>
  </div>
);

export default function OverviewPage() {
  const [stats,     setStats]     = useState(null);
  const [topTrains, setTopTrains] = useState([]);
  const [trends,    setTrends]    = useState(null);
  const [insight,   setInsight]   = useState('');
  const [loading,   setLoading]   = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const toast = useToast?.();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [s, t, tr] = await Promise.all([
        analyticsApi.overview(),
        analyticsApi.topTrains(8),
        analyticsApi.trends(14),
      ]);
      setStats(s?.data || s);
      setTopTrains(t?.data || []);
      setTrends(tr?.data || null);
    } catch (e) {
      toast?.error?.('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }

  async function loadAiInsight() {
    setAiLoading(true);
    try {
      const res = await aiApi.analyze('overview', 'What are the key trends and any concerns?', 30);
      setInsight(res?.insight || 'No insight available');
    } catch (e) {
      setInsight('AI insight unavailable. Check GEMINI_API_KEY configuration.');
    } finally {
      setAiLoading(false);
    }
  }

  const statusColor = { confirmed: GREEN, cancelled: RED, waitlisted: ORANGE, pending: GRAY };

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
  );

  return (
    <div style={{ fontFamily: FONT, padding: '0 0 40px' }}>
      <PageHeader title="Dashboard Overview" subtitle="Live booking analytics and performance metrics" />

      {/* Stat grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatCard icon="🚉" label="Total Stations"  value={stats?.total_stations  ?? '—'} color={BLUE}   />
        <StatCard icon="🚂" label="Total Trains"    value={stats?.total_trains    ?? '—'} color={ORANGE} />
        <StatCard icon="👥" label="Registered Users" value={stats?.total_users    ?? '—'} color="#7c3aed"/>
        <StatCard icon="🎫" label="Total Bookings"  value={stats?.total_bookings  ?? '—'} color={GREEN}  />
        <StatCard icon="📅" label="Bookings Today"  value={stats?.bookings_today  ?? 0}   color={BLUE}   />
        <StatCard icon="💰" label="Revenue Today"   value={`₹${(stats?.revenue_today  || 0).toLocaleString()}`} color={GREEN} />
        <StatCard icon="📈" label="Total Revenue"   value={`₹${(stats?.revenue_total  || 0).toLocaleString()}`} color={ORANGE} sub="Non-cancelled bookings" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Booking status breakdown */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 16 }}>Booking Status</div>
          <BarChart data={stats?.bookings_by_status}
                    colorFn={k => statusColor[k] || BLUE} />
        </div>

        {/* Class breakdown */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 16 }}>Class Distribution</div>
          <BarChart data={stats?.bookings_by_class} colorFn={() => BLUE} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        {/* Top trains */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 16 }}>🏆 Top Trains</div>
          {topTrains.length ? topTrains.map((t, i) => (
            <TopTrainRow key={t.train_id} train={t} rank={i + 1} />
          )) : <div style={{ color: GRAY, fontSize: 13 }}>No data available</div>}
        </div>

        {/* 14-day trend */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb', marginBottom: 16 }}>📊 Last 14 Days</div>
          {trends?.daily ? (
            <BarChart
              data={Object.fromEntries(
                Object.entries(trends.daily)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .slice(-14)
                  .map(([date, d]) => [date.slice(5), (d.confirmed || 0)])
              )}
              title="Confirmed bookings per day"
              colorFn={() => GREEN}
            />
          ) : <div style={{ color: GRAY, fontSize: 13 }}>No trend data</div>}
        </div>
      </div>

      {/* AI Insights panel */}
      <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20 }}>🤖</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: '#f9fafb' }}>AI Insights</span>
            <span style={{ fontSize: 11, color: GRAY, background: '#1e2433', borderRadius: 10,
                           padding: '2px 8px' }}>Powered by Gemini</span>
          </div>
          <button
            onClick={loadAiInsight}
            disabled={aiLoading}
            style={{
              padding: '6px 16px', borderRadius: 8, fontSize: 12,
              background: aiLoading ? '#1e2433' : BLUE, color: '#fff',
              border: 'none', cursor: aiLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {aiLoading ? 'Analyzing…' : '✨ Generate Insight'}
          </button>
        </div>
        <div style={{
          background: '#0a0d14', borderRadius: 8, padding: 16,
          color: '#d1d5db', fontSize: 13, lineHeight: 1.7, fontFamily: FONT,
          minHeight: 60, whiteSpace: 'pre-wrap',
        }}>
          {insight || (
            <span style={{ color: GRAY }}>
              Click "Generate Insight" to get an AI-powered analysis of your booking data using Gemini.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
