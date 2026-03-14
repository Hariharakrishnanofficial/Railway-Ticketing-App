/**
 * ReportsPage — Admin analytics with AI-generated insights.
 * Wired to /api/analytics/* and /api/ai/analyze.
 */
import { useState, useEffect } from 'react';
import { analyticsApi, aiApi } from '../services/api';

const FONT  = "'Inter', system-ui, sans-serif";
const BLUE  = '#2E5FB3'; const GREEN = '#16a34a'; const ORANGE = '#d97706';
const GRAY  = '#6b7280'; const RED   = '#dc2626';

const tabs = ['Overview', 'Trends', 'Top Trains', 'Routes', 'Revenue'];

const BarRow = ({ label, value, max, color = BLUE, suffix = '' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
    <div style={{ width: 90, fontSize: 12, color: '#9ca3af', textAlign: 'right', fontFamily: FONT,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    <div style={{ flex: 1, background: '#1e2433', borderRadius: 4, height: 20, overflow: 'hidden' }}>
      <div style={{ width: `${max > 0 ? Math.min((value / max) * 100, 100) : 0}%`,
                    height: '100%', background: color, borderRadius: 4, transition: 'width 0.7s ease' }} />
    </div>
    <div style={{ width: 70, fontSize: 12, color: '#e5e7eb', fontFamily: FONT, textAlign: 'right' }}>
      {typeof value === 'number' ? value.toLocaleString() : value}{suffix}
    </div>
  </div>
);

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('Overview');
  const [data,      setData]      = useState({});
  const [insight,   setInsight]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [trendDays, setTrendDays] = useState(30);

  useEffect(() => { loadTab(activeTab); }, [activeTab, trendDays]);

  async function loadTab(tab) {
    setLoading(true);
    setInsight('');
    try {
      let res;
      if (tab === 'Overview')   res = await analyticsApi.overview();
      else if (tab === 'Trends')     res = await analyticsApi.trends(trendDays);
      else if (tab === 'Top Trains') res = await analyticsApi.topTrains(10);
      else if (tab === 'Routes')     res = await analyticsApi.routes();
      else if (tab === 'Revenue')    res = await analyticsApi.revenue();
      setData(res?.data || res || {});
    } catch { setData({}); }
    finally { setLoading(false); }
  }

  async function generateInsight() {
    setAiLoading(true);
    const typeMap = {
      'Overview': 'overview', 'Trends': 'booking_trends',
      'Top Trains': 'top_trains', 'Routes': 'routes', 'Revenue': 'revenue',
    };
    try {
      const res = await aiApi.analyze(typeMap[activeTab] || 'overview', '', trendDays);
      setInsight(res?.insight || 'No insight returned.');
    } catch { setInsight('AI analysis unavailable. Check GEMINI_API_KEY.'); }
    finally { setAiLoading(false); }
  }

  function renderContent() {
    if (loading) return <div style={{ color: GRAY, fontSize: 14, padding: 20 }}>Loading…</div>;

    if (activeTab === 'Overview') {
      const d = data;
      const rows = [
        ['Total Bookings', d.total_bookings || 0, '#7c3aed'],
        ['Confirmed', (d.bookings_by_status?.confirmed || 0), GREEN],
        ['Cancelled', (d.bookings_by_status?.cancelled || 0), RED],
        ['Waitlisted', (d.bookings_by_status?.waitlisted || 0), ORANGE],
      ];
      const max = Math.max(...rows.map(r => r[1]));
      return (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              ['🎫 Bookings', d.total_bookings],
              ['💰 Revenue', `₹${(d.revenue_total || 0).toLocaleString()}`],
              ['📅 Today', d.bookings_today],
            ].map(([l, v]) => (
              <div key={l} style={{ background: '#0a0d14', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#f9fafb' }}>{v ?? '—'}</div>
                <div style={{ fontSize: 11, color: GRAY }}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 10 }}>Booking Status Breakdown</div>
          {rows.map(([label, value, color]) => (
            <BarRow key={label} label={label} value={value} max={max} color={color} />
          ))}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', margin: '16px 0 10px' }}>Class Breakdown</div>
          {Object.entries(d.bookings_by_class || {}).map(([cls, count]) => (
            <BarRow key={cls} label={cls} value={count}
                    max={Math.max(...Object.values(d.bookings_by_class || { x: 1 }))} color={BLUE} />
          ))}
        </div>
      );
    }

    if (activeTab === 'Trends') {
      const daily = data.daily || {};
      const sorted = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
      const maxConf = Math.max(...sorted.map(([, d]) => d.confirmed || 0), 1);
      return (
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: GRAY }}>Show last:</span>
            {[7, 14, 30, 60].map(d => (
              <button key={d} onClick={() => setTrendDays(d)} style={{
                padding: '4px 12px', borderRadius: 6, fontSize: 12, border: 'none', cursor: 'pointer',
                background: trendDays === d ? BLUE : '#1e2433', color: trendDays === d ? '#fff' : GRAY,
              }}>{d}d</button>
            ))}
          </div>
          {sorted.slice(-trendDays).map(([date, d]) => (
            <BarRow key={date} label={date.slice(5)} value={d.confirmed || 0} max={maxConf}
                    color={GREEN} suffix={` (₹${Math.round(d.revenue || 0).toLocaleString()})`} />
          ))}
        </div>
      );
    }

    if (activeTab === 'Top Trains') {
      const trains = Array.isArray(data) ? data : [];
      const max    = Math.max(...trains.map(t => t.count || 0), 1);
      return (
        <div>
          {trains.map((t, i) => (
            <div key={t.train_id} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#f9fafb', fontFamily: FONT }}>
                  <span style={{ color: i < 3 ? ORANGE : GRAY, marginRight: 6, fontWeight: 700 }}>#{i + 1}</span>
                  {t.name || t.train_id}
                </span>
                <span style={{ fontSize: 12, color: GREEN }}>₹{(t.revenue || 0).toLocaleString()}</span>
              </div>
              <BarRow label={`${t.count} bookings`} value={t.count} max={max} color={BLUE} />
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === 'Routes') {
      const routes = Array.isArray(data) ? data : [];
      const max    = Math.max(...routes.map(r => r.count || 0), 1);
      return (
        <div>
          {routes.map(r => (
            <BarRow key={r.route} label={r.route} value={r.count} max={max} color="#7c3aed" />
          ))}
        </div>
      );
    }

    if (activeTab === 'Revenue') {
      const byClass = data.revenue_by_class || {};
      const max     = Math.max(...Object.values(byClass), 1);
      return (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 12 }}>Revenue by Class</div>
          {Object.entries(byClass).sort(([, a], [, b]) => b - a).map(([cls, rev]) => (
            <BarRow key={cls} label={cls} value={rev} max={max} color={ORANGE} suffix=" ₹" />
          ))}
        </div>
      );
    }
    return null;
  }

  return (
    <div style={{ fontFamily: FONT }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#f9fafb' }}>Analytics & Reports</div>
        <div style={{ fontSize: 13, color: GRAY, marginTop: 4 }}>Booking performance, trends, and AI-generated insights</div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: '1px solid #1e2433', paddingBottom: 1 }}>
        {tabs.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 16px', borderRadius: '8px 8px 0 0', border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
            background: activeTab === tab ? BLUE : 'transparent',
            color:      activeTab === tab ? '#fff' : GRAY,
            borderBottom: activeTab === tab ? `2px solid ${BLUE}` : '2px solid transparent',
          }}>
            {tab}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20 }}>
          {renderContent()}
        </div>

        {/* AI Insight panel */}
        <div style={{ background: '#111827', border: '1px solid #1e2433', borderRadius: 12, padding: 20,
                      display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>🤖</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#f9fafb' }}>AI Insight</span>
          </div>
          <div style={{
            flex: 1, background: '#0a0d14', borderRadius: 8, padding: 14,
            color: '#d1d5db', fontSize: 12, lineHeight: 1.7, minHeight: 120,
            whiteSpace: 'pre-wrap', overflowY: 'auto',
          }}>
            {insight || <span style={{ color: GRAY }}>Click Generate to get Gemini-powered analysis of this report.</span>}
          </div>
          <button onClick={generateInsight} disabled={aiLoading} style={{
            padding: '8px 0', borderRadius: 8, border: 'none',
            background: aiLoading ? '#1e2433' : BLUE,
            color: aiLoading ? GRAY : '#fff', cursor: aiLoading ? 'not-allowed' : 'pointer',
            fontSize: 13, fontFamily: FONT, fontWeight: 600,
          }}>
            {aiLoading ? '✨ Analyzing…' : '✨ Generate Insight'}
          </button>
        </div>
      </div>
    </div>
  );
}
