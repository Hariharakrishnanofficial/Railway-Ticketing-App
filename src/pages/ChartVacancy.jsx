/**
 * ChartVacancy.jsx — Seat Availability Chart
 * IRCTC-style seat availability viewer.
 * Calls GET /api/trains/<id>/vacancy?date=YYYY-MM-DD
 * Color coding: Green >50% | Yellow 10-50% | Red <10% | Grey = 0
 * Blocks past dates. Shows per-class breakdown.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  trainsApi, trainInfoApi, coachApi,
  extractRecords, getRecordId,
} from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Icon, Spinner } from '../components/UI';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

function today() { return new Date().toISOString().split('T')[0]; }

function pct(avail, total) {
  if (!total) return 0;
  return Math.round((avail / total) * 100);
}

function availColor(avail, total) {
  if (!total || avail === 0) return { fg: '#6b7280', bg: 'rgba(107,114,128,0.10)', bar: '#374151' };
  const p = pct(avail, total);
  if (p > 50) return { fg: '#22c55e', bg: 'rgba(34,197,94,0.10)',  bar: '#22c55e' };
  if (p > 10) return { fg: '#f59e0b', bg: 'rgba(245,158,11,0.10)', bar: '#f59e0b' };
  return       { fg: '#f87171',    bg: 'rgba(239,68,68,0.10)',    bar: '#ef4444' };
}

function availLabel(avail, total) {
  if (!total)     return 'Not Configured';
  if (avail === 0) return 'Not Available';
  const p = pct(avail, total);
  if (p > 50) return 'Available';
  if (p > 10) return 'Filling Fast';
  return 'Almost Full';
}

// ─── Class row card ───────────────────────────────────────────────────────────
function ClassCard({ cls, info, layout }) {
  const { total, booked, available, fare, label } = info;
  const col = availColor(available, total);
  const p   = pct(available, total);

  // Coach map toggle
  const [showMap, setShowMap] = useState(false);
  let parsedRule = {};
  if (layout?.Coach_Configuration_Rule) {
      try { parsedRule = JSON.parse(layout.Coach_Configuration_Rule); } catch { parsedRule = {}; }
  } else {
      // Fallback simple sequential if no rule
      for(let i=1; i<=(layout?.Total_Seats || total); i++) parsedRule[i] = 'Seat';
  }

  return (
    <div style={{
      border: `1px solid ${col.fg}30`,
      background: col.bg,
      borderRadius: 14, padding: '18px 20px',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: MONO }}>{cls}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT, marginTop: 2 }}>{label}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {fare > 0 && (
            <div style={{ fontSize: 18, fontWeight: 800, color: '#22c55e', fontFamily: FONT }}>₹{Number(fare).toLocaleString('en-IN')}</div>
          )}
          <span style={{
            fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 20,
            background: `${col.fg}20`, color: col.fg, border: `1px solid ${col.fg}40`, fontFamily: FONT,
          }}>
            {availLabel(available, total)}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ height: 8, borderRadius: 10, background: '#1e2433', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${100 - p}%`, // booked percentage
              background: col.bar,
              borderRadius: 10,
              transition: 'width 0.8s ease',
            }} />
          </div>
        </div>
      )}

      {/* Numbers */}
      <div style={{ display: 'flex', gap: 20 }}>
        {[
          { label: 'Total',    val: total     || '—', col: 'var(--text-muted)' },
          { label: 'Booked',   val: booked    || 0,   col: '#f87171' },
          { label: 'Available',val: available || 0,   col: col.fg   },
          ...(info.rac > 0 ? [{ label: 'RAC', val: info.rac, col: '#f59e0b' }] : []),
          ...(info.waitlist > 0 ? [{ label: 'Waitlist', val: info.waitlist, col: '#f87171' }] : []),
        ].map((item, idx) => (
          <div key={item.label + idx}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>{item.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: item.col, fontFamily: MONO, lineHeight: 1.2 }}>{item.val}</div>
          </div>
        ))}
        {total > 0 && (
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-end' }}>
             {layout && (
                 <button onClick={() => setShowMap(!showMap)} 
                         style={{ padding: '4px 10px', background: showMap ? '#2563eb' : 'transparent', border: '1px solid #2563eb', color: showMap ? '#fff' : '#60a5fa', borderRadius: 6, fontSize: 11, fontFamily: FONT, cursor: 'pointer', marginBottom: 4 }}>
                     {showMap ? 'Hide Layout' : 'View Coach Layout'}
                 </button>
             )}
            <div style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT }}>Occupied</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: col.fg, fontFamily: MONO }}>{100 - p}%</div>
          </div>
        )}
      </div>

      {/* Coach Layout visual map expansion */}
      {showMap && layout && (
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 11, color: '#9ca3af', fontFamily: FONT, marginBottom: 10 }}>Standard {cls} Layout ({layout.Total_Seats} Berths)</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(65px, 1fr))', gap: 8 }}>
                  {Array.from({length: layout.Total_Seats}, (_, i) => i + 1).map(seatNum => {
                      const berthType = parsedRule[String(seatNum)] || parsedRule[seatNum] || 'Seat';
                      return (
                          <div key={seatNum} style={{ background: '#0a0d14', border: '1px solid #1e2433', borderRadius: 6, padding: '6px 4px', textAlign: 'center' }}>
                              <div style={{ fontSize: 14, fontWeight: 700, color: '#e2e8f0', fontFamily: MONO }}>{seatNum}</div>
                              <div style={{ fontSize: 9, color: '#60a5fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{berthType}</div>
                          </div>
                      );
                  })}
              </div>
          </div>
      )}
    </div>
  );
}

// ─── Mini train card ──────────────────────────────────────────────────────────
function TrainItem({ train, selected, onClick }) {
  const name   = train.Train_Name   || 'Unknown';
  const number = train.Train_Number || '—';
  const fromR  = train.From_Station;
  const toR    = train.To_Station;
  const from   = typeof fromR === 'object' ? (fromR?.display_value || '—') : (fromR || '—');
  const to     = typeof toR   === 'object' ? (toR?.display_value   || '—') : (toR   || '—');
  const isActive = selected;
  return (
    <div onClick={onClick}
      style={{ padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'rgba(16,185,129,0.08)' : 'transparent', borderLeft: `3px solid ${isActive ? '#10b981' : 'transparent'}`, transition: 'background 0.15s' }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-inset)'; }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT, marginBottom: 2 }}>{name}</div>
      <div style={{ fontSize: 10, fontFamily: MONO, color: '#10b981', marginBottom: 3 }}>#{number}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{from}</span>
        <Icon name="upcoming" size={10} style={{ flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 100 }}>{to}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function ChartVacancy() {
  const { addToast } = useToast();

  const [trains, setTrains]       = useState([]);
  const [trainsLoading, setTL]    = useState(true);
  const [layouts, setLayouts]     = useState([]);
  const [search, setSearch]       = useState('');
  const [date, setDate]           = useState(today());
  const [selected, setSelected]   = useState(null);
  const [vacancy, setVacancy]     = useState(null);
  const [vacLoading, setVL]       = useState(false);
  const [trainMeta, setTrainMeta] = useState(null);

  // Load trains and layouts
  useEffect(() => {
    setTL(true);
    const p1 = trainsApi.getAll({ limit: 500 })
      .then(res => setTrains(extractRecords(res)))
      .catch(() => addToast('Could not load trains', 'error'));

    const p2 = coachApi.getAll()
      .then(res => setLayouts(extractRecords(res)))
      .catch(() => console.error('Could not load coach layouts'));

    Promise.allSettled([p1, p2]).finally(() => setTL(false));
  }, []);

  // Load vacancy when train or date changes
  const loadVacancy = useCallback(async (train, d) => {
    if (!train || !d) return;
    const id = getRecordId(train);
    setVL(true);
    setVacancy(null);
    setTrainMeta(train);
    try {
      const res = await trainInfoApi.vacancy(id, d);
      if (res?.success && res?.data) {
        setVacancy(res.data);
      } else {
        addToast(res?.error || 'No vacancy data available', 'error');
      }
    } catch (err) {
      addToast(err.message || 'Failed to fetch vacancy', 'error');
    } finally {
      setVL(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadVacancy(selected, date);
  }, [selected, date, loadVacancy]);

  const filtered = trains.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.Train_Name || '').toLowerCase().includes(s) ||
           String(t.Train_Number || '').toLowerCase().includes(s);
  });

  // Class display order with labels
  const CLASS_META = {
    SL:  { label: 'Sleeper Class' },
    '3AC': { label: '3rd AC (3-Tier)' },
    '2AC': { label: '2nd AC (2-Tier)' },
    '1AC': { label: '1st AC (First Class)' },
    CC:  { label: 'Chair Car' },
  };

  const vacClasses = vacancy ? Object.entries(vacancy) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <PageHeader icon="seat" iconAccent="#10b981" title="Seat Availability"
        subtitle="Check real-time seat availability for any train" />

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 20, alignItems: 'start', marginTop: 24 }}>

        {/* ── Left panel: train list ── */}
        <Card padding={0}>
          {/* Date picker */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: 6 }}>
              Journey Date
            </label>
            <input
              type="date"
              value={date}
              min={today()}
              onChange={e => setDate(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: '#0a0d14', border: '1px solid #1e2433', borderRadius: 9, color: '#e2e8f0', fontSize: 13, fontFamily: FONT, outline: 'none', marginBottom: 10 }}
            />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search trains…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: '#0a0d14', border: '1px solid #1e2433', borderRadius: 9, color: '#e2e8f0', fontSize: 13, fontFamily: FONT, outline: 'none' }}
            />
          </div>

          {trainsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
              <Spinner size={22} color="#10b981" />
            </div>
          ) : (
            <div style={{ maxHeight: 560, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, fontFamily: FONT }}>No trains found</div>
              ) : filtered.map((t, i) => (
                <TrainItem key={getRecordId(t) || i} train={t} selected={selected && getRecordId(selected) === getRecordId(t)} onClick={() => setSelected(t)} />
              ))}
            </div>
          )}
        </Card>

        {/* ── Right panel: vacancy ── */}
        <div>
          {!selected ? (
            <Card style={{ textAlign: 'center', padding: '60px 24px' }}>
              <Icon name="seat" size={52} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 16px' }} />
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6, fontFamily: FONT }}>Select a Train</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: FONT }}>
                Choose a train from the list to view seat availability for{' '}
                <strong style={{ color: 'var(--text-secondary)' }}>{date}</strong>.
              </div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Train header */}
              <Card>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: FONT, marginBottom: 4 }}>{selected.Train_Name || '—'}</div>
                    <div style={{ fontSize: 12, fontFamily: MONO, color: '#10b981' }}>#{selected.Train_Number || '—'} · {selected.Train_Type || ''}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', fontFamily: FONT, textAlign: 'right' }}>
                    <div style={{ marginBottom: 4 }}>📅 {date}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Vacancy cards */}
              {vacLoading ? (
                <Card style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
                  <Spinner size={32} color="#10b981" />
                </Card>
              ) : vacClasses.length === 0 ? (
                <Card style={{ textAlign: 'center', padding: '40px 24px' }}>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', fontFamily: FONT }}>No vacancy data available for this train.</div>
                </Card>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
                    {vacClasses.map(([cls, info]) => {
                      const lyt = layouts.find(l => String(l.Class).toUpperCase() === String(cls).toUpperCase() || l.Class?.display_value === cls);
                      return <ClassCard key={cls} cls={cls} info={info} layout={lyt} />;
                    })}
                  </div>

                  {/* Legend */}
                  <Card style={{ padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT, marginBottom: 10 }}>Availability Legend</div>
                    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                      {[
                        { col: '#22c55e', label: '>50% — Available'     },
                        { col: '#f59e0b', label: '10–50% — Filling Fast' },
                        { col: '#f87171', label: '<10% — Almost Full'    },
                        { col: '#6b7280', label: '0 — Not Available'     },
                      ].map(({ col, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: col, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT }}>{label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}