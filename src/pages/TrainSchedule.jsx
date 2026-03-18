/**
 * TrainSchedule.jsx
 * Shows the full route and schedule for any train.
 * Calls: GET /api/trains/{id}/schedule  (falls back to GET /api/trains/{id})
 * Also lets users search trains by number/name.
 */
import { useState, useCallback } from 'react';
import { trainsApi, extractRecords, getRecordId, getLookupLabel } from '../services/api';
import { useApi } from '../hooks/useApi';
import { PageHeader, Card, Icon, Spinner } from '../components/UI';

function StopRow({ stop, index, isFirst, isLast, isOrigin, isDestination }) {
  const col = isOrigin ? '#3b82f6' : isDestination ? '#22c55e' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 40, flexShrink: 0 }}>
        <div style={{ width: isFirst || isLast ? 0 : 2, flex: '0 0 16px', background: 'var(--border)' }} />
        <div style={{
          width: isOrigin || isDestination ? 16 : 10, height: isOrigin || isDestination ? 16 : 10,
          borderRadius: '50%', flexShrink: 0,
          background: col, border: `2px solid ${col}`,
          boxShadow: isOrigin || isDestination ? `0 0 10px ${col}60` : 'none',
        }} />
        <div style={{ width: isFirst || isLast ? 0 : 2, flex: 1, minHeight: 16, background: 'var(--border)' }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1, marginBottom: 0, padding: '12px 0 12px 12px',
        borderBottom: isLast ? 'none' : '1px solid #0e1420',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: isOrigin || isDestination ? 800 : 600, color: isOrigin || isDestination ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              {stop.station_name || stop.Station_Name || stop.station || `Stop ${index + 1}`}
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginTop: 2 }}>
              {stop.station_code || stop.Station_Code || ''}
              {(isOrigin || isDestination) && (
                <span style={{ marginLeft: 8, padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${col}20`, color: col }}>
                  {isOrigin ? 'ORIGIN' : 'DESTINATION'}
                </span>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', display: 'flex', gap: 20 }}>
            {stop.arrival && stop.arrival !== '--' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Arrival</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{stop.arrival}</div>
              </div>
            )}
            {stop.departure && stop.departure !== '--' && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Departure</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{stop.departure}</div>
              </div>
            )}
            {stop.Departure_Time && !stop.departure && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Time</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{stop.Departure_Time}</div>
              </div>
            )}
          </div>
        </div>
        {stop.halt_mins > 0 && (
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-faint)' }}>
            <Icon name="clock" size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
            {stop.halt_mins} min halt
          </div>
        )}
      </div>
    </div>
  );
}

function buildScheduleFromTrain(train) {
  // If backend returns full schedule, use it
  // Otherwise build a minimal 2-stop schedule from train data
  const fromRaw = train.From_Station ?? train.Source_Station;
  const toRaw   = train.To_Station   ?? train.Destination_Station;
  const from    = typeof fromRaw === 'object' ? fromRaw?.display_value ?? '—' : fromRaw ?? '—';
  const to      = typeof toRaw   === 'object' ? toRaw?.display_value   ?? '—' : toRaw   ?? '—';

  return [
    { station_name: from, station_code: typeof fromRaw === 'object' ? fromRaw?.ID : '', departure: train.Departure_Time ?? '--', arrival: null },
    { station_name: to,   station_code: typeof toRaw   === 'object' ? toRaw?.ID   : '', arrival:   train.Arrival_Time   ?? '--', departure: null },
  ];
}

export default function TrainSchedule() {
  const [search, setSearch]       = useState('');
  const [selected, setSelected]   = useState(null);
  const [schedule, setSchedule]   = useState(null);
  const [schedLoading, setSchedLoading] = useState(false);

  // Load all trains for search
  const fetchTrains = useCallback(() => trainsApi.getAll(), []);
  const { data: trainsData, loading: trainsLoading } = useApi(fetchTrains);
  const allTrains = extractRecords(trainsData);

  const filtered = allTrains.filter(t => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (t.Train_Name ?? '').toLowerCase().includes(s) || String(t.Train_Number ?? '').toLowerCase().includes(s);
  });

  const loadSchedule = async (train) => {
    setSelected(train);
    setSchedule(null);
    setSchedLoading(true);
    const id = getRecordId(train);
    try {
      // Try the schedule endpoint first
      const BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4600/api';
      const res  = await fetch(`${BASE}/trains/${id}/schedule`).then(r => r.json());
      if (res?.success && res?.data?.stops?.length > 0) {
        setSchedule(res.data.stops);
      } else if (res?.data?.schedule?.length > 0) {
        setSchedule(res.data.schedule);
      } else {
        // Fallback: build from train data
        setSchedule(buildScheduleFromTrain(train));
      }
    } catch {
      setSchedule(buildScheduleFromTrain(train));
    }
    setSchedLoading(false);
  };

  return (
    <div>
      <PageHeader icon="map" iconAccent="var(--accent-purple)" title="Train Schedule" subtitle="View full route and stop-by-stop timings for any train" />

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Left: Train list */}
        <Card padding={0}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or number…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }} />
          </div>

          {trainsLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner size={24} color="var(--accent-blue)" /></div>
          ) : (
            <div style={{ maxHeight: 600, overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No trains found</div>
              ) : (
                filtered.map((t, i) => {
                  const id    = getRecordId(t);
                  const name  = t.Train_Name   ?? 'Unknown';
                  const num   = t.Train_Number ?? '—';
                  const fromR = t.From_Station ?? t.Source_Station;
                  const toR   = t.To_Station   ?? t.Destination_Station;
                  const from  = typeof fromR === 'object' ? fromR?.display_value ?? '—' : fromR ?? '—';
                  const to    = typeof toR   === 'object' ? toR?.display_value   ?? '—' : toR   ?? '—';
                  const isActive = selected && getRecordId(selected) === id;

                  return (
                    <div key={id || i} onClick={() => loadSchedule(t)}
                      style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isActive ? 'rgba(139,92,246,0.1)' : 'transparent', borderLeft: isActive ? '3px solid #8b5cf6' : '3px solid transparent', transition: 'background 0.15s' }}
                      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--bg-inset)'; }}
                      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 3 }}>{name}</div>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-blue)', marginBottom: 3 }}>#{num}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span>{from}</span>
                        <span>→</span>
                        <span>{to}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </Card>

        {/* Right: Schedule view */}
        <div>
          {!selected ? (
            <Card>
              <div style={{ textAlign: 'center', padding: '52px 24px' }}>
                <Icon name="map" size={48} style={{ color: 'var(--text-faint)', display: 'block', margin: '0 auto 16px' }} />
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Select a Train</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Choose a train from the list to see its full schedule and route.</div>
              </div>
            </Card>
          ) : (
            <Card>
              {/* Train header */}
              <div style={{ marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)', marginBottom: 4 }}>{selected.Train_Name ?? 'Train'}</div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-blue)' }}>#{selected.Train_Number ?? '—'} · {selected.Train_Type ?? ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    {[['Sleeper', selected.Fare_SL, '#60a5fa'], ['3AC', selected.Fare_3A, '#a78bfa'], ['2AC', selected.Fare_2A, '#f472b6']].map(([cls, fare, col]) =>
                      fare ? (
                        <div key={cls} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: col, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{cls}</div>
                          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>₹{fare}</div>
                        </div>
                      ) : null
                    )}
                  </div>
                </div>

                {/* Additional Train Details */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginTop: 12 }}>
                  {selected.Departure_Time && (
                    <div style={{ background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        <Icon name="clock" size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Departure
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.Departure_Time}</div>
                    </div>
                  )}
                  {selected.Arrival_Time && (
                    <div style={{ background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        <Icon name="clock" size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Arrival
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{selected.Arrival_Time}</div>
                    </div>
                  )}
                  {selected.Run_Days && (
                    <div style={{ background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>
                        <Icon name="calendar" size={10} style={{ marginRight: 4, verticalAlign: 'middle' }} />Runs On
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{selected.Run_Days}</div>
                    </div>
                  )}
                  {selected.Is_Active !== undefined && (
                    <div style={{ background: 'var(--bg-inset)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Status</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: selected.Is_Active ? '#22c55e' : '#ef4444' }}>
                        {selected.Is_Active ? '● Active' : '○ Inactive'}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {schedLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner size={32} color="var(--accent-purple)" /></div>
              ) : schedule ? (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
                    {schedule.length} Stop{schedule.length !== 1 ? 's' : ''}
                  </div>
                  <div>
                    {schedule.map((stop, i) => (
                      <StopRow
                        key={i} stop={stop} index={i}
                        isFirst={i === 0} isLast={i === schedule.length - 1}
                        isOrigin={i === 0} isDestination={i === schedule.length - 1}
                      />
                    ))}
                  </div>
                  {/* {schedule.length <= 2 && (
                    <div style={{ marginTop: 16, padding: '10px 14px', background: '#0f1825', borderRadius: 8, border: '1px solid #1a2a3a', fontSize: 12, color: 'var(--text-muted)' }}>
                      ℹ️ Intermediate stops not available. Only origin and destination shown. Add route data via the Train Schedule API endpoint.
                    </div>
                  )} */}
                </div>
              ) : null}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
