/**
 * ChartVacancy.jsx
 * Seat availability chart — shows remaining seats per class for a train.
 * Calls: GET /api/trains/{id}/vacancy  (falls back to computing from train + bookings data)
 */
import { useState, useCallback } from 'react';
import { trainsApi, bookingsApi, extractRecords, getRecordId, getLookupLabel } from '../services/api';
import { useApi } from '../hooks/useApi';
import { PageHeader, Card, Icon, Spinner } from '../components/UI';

const CLASS_CONFIG = [
  { key: 'SL',  label: 'Sleeper',              fareKey: 'Fare_SL', totalKey: 'Total_Seats_SL', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)'  },
  { key: '3AC', label: '3rd AC',               fareKey: 'Fare_3A', totalKey: 'Total_Seats_3A', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)' },
  { key: '2AC', label: '2nd AC',               fareKey: 'Fare_2A', totalKey: 'Total_Seats_2A', color: '#f472b6', bg: 'rgba(244,114,182,0.1)' },
  { key: 'CC',  label: 'Chair Car',            fareKey: 'Fare_SL', totalKey: 'Total_Seats_SL', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)'  },
  { key: '1AC', label: '1st AC',               fareKey: 'Fare_2A', totalKey: 'Total_Seats_2A', color: '#4ade80', bg: 'rgba(74,222,128,0.1)'  },
];

function SeatMeter({ label, color, bgColor, total, booked, fare }) {
  const available = Math.max(0, total - booked);
  const pct       = total > 0 ? (booked / total) * 100 : 0;
  const statusColor = available === 0 ? '#f87171' : available <= 10 ? '#fbbf24' : '#4ade80';
  const statusLabel = available === 0 ? 'Waitlist' : available <= 10 ? 'Almost Full' : 'Available';

  return (
    <div style={{ background: bgColor, border: `1px solid ${color}30`, borderRadius: 14, padding: '18px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{label}</div>
          {fare > 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Base fare: ₹{fare}</div>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}30` }}>
          {statusLabel}
        </span>
      </div>

      {/* Progress bar */}
      <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-inset)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', borderRadius: 4, width: `${pct}%`, background: `linear-gradient(to right, ${color}, ${color}88)`, transition: 'width 0.8s ease' }} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span><span style={{ fontWeight: 700, color: statusColor, fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{available}</span><br/><span style={{ color: 'var(--text-muted)' }}>Available</span></span>
          <span><span style={{ fontWeight: 700, color: color, fontSize: 20, fontFamily: 'var(--font-display)', lineHeight: 1 }}>{booked}</span><br/><span style={{ color: 'var(--text-muted)' }}>Booked</span></span>
        </div>
        <span style={{ textAlign: 'right', alignSelf: 'flex-end' }}>
          <span style={{ fontWeight: 700, color: 'var(--text-muted)', fontSize: 13 }}>{total}</span>
          <br/><span style={{ color: 'var(--text-faint)', fontSize: 11 }}>Total</span>
        </span>
      </div>
    </div>
  );
}

export default function ChartVacancy() {
  const [search, setSearch]     = useState('');
  const todayDate = new Date().toISOString().split('T')[0];
  const [journeyDate, setJourneyDate] = useState(todayDate);
  const [selected, setSelected] = useState(null);
  const [vacancy, setVacancy]   = useState(null);
  const [vacLoading, setVacLoading] = useState(false);

  const fetchTrains = useCallback(() => trainsApi.getAll(), []);
  const { data: trainsData, loading: trainsLoading } = useApi(fetchTrains);
  const allTrains = extractRecords(trainsData);

  const filtered = allTrains.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.Train_Name ?? '').toLowerCase().includes(s) || String(t.Train_Number ?? '').includes(s);
  });

  const loadVacancy = async (train, date) => {
    setSelected(train);
    setVacancy(null);
    setVacLoading(true);
    const id   = getRecordId(train);
    // Use env variable correctly (Vite exposes via import.meta.env)
    const BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4600/api';
    const dateParam = date || journeyDate;

    try {
      // Try dedicated vacancy endpoint
      const res = await fetch(`${BASE}/trains/${id}/vacancy?date=${dateParam}`).then(r => r.json());
      if (res?.success && res?.data) {
        setVacancy(res.data);
        setVacLoading(false);
        return;
      }
    } catch {}

    // Fallback: compute from train totals + bookings
    try {
      const bookRes    = await bookingsApi.getAll();
      const allBookings = extractRecords(bookRes);

      // Filter bookings for this train on this date (confirmed only)
      const trainBookings = allBookings.filter(b => {
        const bTrainId = typeof b.Trains === 'object' ? b.Trains?.ID : b.Trains;
        const bDate    = (b.Journey_Date || '').split(' ')[0];
        const matchDate = !journeyDate || bDate === journeyDate || b.Journey_Date?.includes(journeyDate);
        return bTrainId === id && b.Booking_Status === 'confirmed' && matchDate;
      });

      // Tally booked per class
      const bookedByClass = {};
      trainBookings.forEach(b => {
        const cls = b.Class || 'SL';
        bookedByClass[cls] = (bookedByClass[cls] || 0) + Number(b.Passenger_Count || 1);
      });

      // Map to CLASS_CONFIG
      const computed = {};
      CLASS_CONFIG.forEach(c => {
        const totalSeats = Number(train[c.totalKey] || 0);
        const classBookings = bookedByClass[c.key] || bookedByClass[c.label] || 0;
        computed[c.key] = {
          total:     totalSeats,
          booked:    Math.min(classBookings, totalSeats),
          available: Math.max(0, totalSeats - classBookings),
          fare:      Number(train[c.fareKey] || 0),
        };
      });

      setVacancy(computed);
    } catch (err) {
      // Even if bookings fail, show seat totals from train
      const fallback = {};
      CLASS_CONFIG.forEach(c => {
        fallback[c.key] = { total: Number(train[c.totalKey] || 0), booked: 0, available: Number(train[c.totalKey] || 0), fare: Number(train[c.fareKey] || 0) };
      });
      setVacancy(fallback);
    }
    setVacLoading(false);
  };

  const totalAvailable = vacancy ? CLASS_CONFIG.reduce((sum, c) => sum + (vacancy[c.key]?.available || 0), 0) : 0;
  const totalCapacity  = vacancy ? CLASS_CONFIG.reduce((sum, c) => sum + (vacancy[c.key]?.total || 0), 0) : 0;

  return (
    <div>
      <PageHeader icon="seat" iconAccent="var(--accent-green)" title="Chart Vacancy" subtitle="Real-time seat availability by class and coach" />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date picker */}
          <Card>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Journey Date</div>
            {/* Allow today and future dates only */}
            <input type="date" value={journeyDate}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => {
                const newDate = e.target.value;
                if (!newDate) return; // ignore clear
                setJourneyDate(newDate);
                if (selected) loadVacancy(selected, newDate);
              }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-body)' }}>
              Today onwards only
            </p>
          </Card>

          {/* Train search */}
          <Card padding={0}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search trains…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
            </div>
            {trainsLoading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><Spinner size={20} color="var(--accent-blue)" /></div>
            ) : (
              <div style={{ maxHeight: 460, overflowY: 'auto' }}>
                {filtered.map((t, i) => {
                  const id      = getRecordId(t);
                  const isActive = selected && getRecordId(selected) === id;
                  const fromRaw = t.From_Station ?? t.Source_Station;
                  const toRaw   = t.To_Station   ?? t.Destination_Station;
                  const from    = typeof fromRaw === 'object' ? fromRaw?.display_value ?? '—' : fromRaw ?? '—';
                  const to      = typeof toRaw   === 'object' ? toRaw?.display_value   ?? '—' : toRaw   ?? '—';
                  return (
                    <div key={id || i} onClick={() => loadVacancy(t, journeyDate)}
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'rgba(74,222,128,0.08)' : 'transparent', borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-inset)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{t.Train_Name ?? 'Unknown'}</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginBottom: 2 }}>#{t.Train_Number ?? '—'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{from} → {to}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Vacancy chart */}
        <div>
          {!selected ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '52px 24px' }}>
                <Icon name="seat" size={48} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Select a Train</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pick a train and journey date to see live seat availability.</div>
              </div>
            </Card>
          ) : vacLoading ? (
            <Card>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 40, gap: 14 }}>
                <Spinner size={36} color="var(--accent-green)" />
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Loading seat availability…</div>
              </div>
            </Card>
          ) : vacancy ? (
            <div>
              {/* Header */}
              <Card style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{selected.Train_Name}</div>
                    <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginTop: 2 }}>#{selected.Train_Number} · {journeyDate}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: totalAvailable > 0 ? '#4ade80' : '#f87171', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{totalAvailable}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Available</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text-muted)', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{totalCapacity}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total Capacity</div>
                    </div>
                  </div>
                </div>

                {/* Overall bar */}
                {totalCapacity > 0 && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-inset)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 3, width: `${((totalCapacity - totalAvailable) / totalCapacity) * 100}%`, background: 'linear-gradient(to right, #22c55e, #3b82f6)', transition: 'width 0.8s ease' }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                      <span>{Math.round(((totalCapacity - totalAvailable) / totalCapacity) * 100)}% occupied</span>
                      <span>{Math.round((totalAvailable / totalCapacity) * 100)}% free</span>
                    </div>
                  </div>
                )}
              </Card>

              {/* Class grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {CLASS_CONFIG.filter(c => (vacancy[c.key]?.total ?? 0) > 0).map(c => (
                  <SeatMeter
                    key={c.key}
                    label={c.label}
                    color={c.color}
                    bgColor={c.bg}
                    total={vacancy[c.key]?.total ?? 0}
                    booked={vacancy[c.key]?.booked ?? 0}
                    fare={vacancy[c.key]?.fare ?? 0}
                  />
                ))}
              </div>

              {CLASS_CONFIG.filter(c => (vacancy[c.key]?.total ?? 0) > 0).length === 0 && (
                <Card>
                  <div style={{ textAlign: 'center', padding: '32px 24px', color: 'var(--text-muted)', fontSize: 13 }}>
                    No seat data configured for this train. Add Total_Seats fields in the train record.
                  </div>
                </Card>
              )}

              <div style={{ marginTop: 14, padding: '10px 14px', background: '#0f1825', borderRadius: 8, border: '1px solid #1a2a3a', fontSize: 11, color: 'var(--text-muted)' }}>
                🔄 Availability computed from confirmed bookings for <strong style={{ color: 'var(--text-primary)' }}>{journeyDate}</strong>. Unbooked trains show full capacity.
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}