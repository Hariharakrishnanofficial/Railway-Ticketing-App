/**
 * TrainRoutesPage.jsx — Full CRUD for Train Sub-Stations (intermediate stops)
 *
 * SELECT a train → see all its stops in sequence order
 * ADD / EDIT / DELETE each stop (stored in Zoho Train_Routes form)
 *
 * Zoho fields: Train(lookup), Stations(lookup), Station_Name, Station_Code,
 *              Sequence, Arrival_Time, Departure_Time, Halt_Minutes, Distance_KM, Day_Count
 */
import { useState, useEffect, useCallback } from 'react';
import {
  trainsApi, stationsApi, trainRoutesApi,
  extractRecords, getRecordId,
} from '../services/api';
import { useApi }   from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Spinner } from '../components/UI';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
const iS = {
  boxSizing:'border-box', width:'100%', padding:'9px 12px',
  background:'#0a0d14', border:'1px solid #1e2433', borderRadius:8,
  color:'#d1d5db', fontSize:13, fontFamily:FONT, outline:'none',
};
const lS = {
  display:'block', fontSize:10, fontWeight:600, color:'#6b7280',
  textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4, fontFamily:FONT,
};
const BLANK = {
  Stations:'', Station_Name:'', Station_Code:'',
  Sequence:'', Arrival_Time:'', Departure_Time:'',
  Halt_Minutes:'', Distance_KM:'', Day_Count:'1',
};

function stationLabel(field) {
  if (!field) return '—';
  if (typeof field === 'object') return (field.display_value || field.ID || '—').trim();
  return String(field).trim();
}
function safeId(row) { return row?.ID || row?.id || null; }

// ── Stop Modal (Add / Edit) ────────────────────────────────────────────────────
function StopModal({ stop, trainId, stations, onSave, onClose, saving }) {
  const isEdit = !!safeId(stop);
  const [form, setForm] = useState(() => {
    if (stop && isEdit) {
      return {
        Stations:       typeof stop.Stations === 'object' ? (stop.Stations?.ID || '') : (stop.Stations || ''),
        Station_Name:   stop.Station_Name   || '',
        Station_Code:   stop.Station_Code   || '',
        Sequence:       stop.Sequence       ?? '',
        Arrival_Time:   stop.Arrival_Time   || '',
        Departure_Time: stop.Departure_Time || '',
        Halt_Minutes:   stop.Halt_Minutes   ?? '',
        Distance_KM:    stop.Distance_KM    ?? '',
        Day_Count:      stop.Day_Count      ?? '1',
      };
    }
    return { ...BLANK };
  });
  const [errors, setErrors] = useState({});

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }));
    if (errors[field]) setErrors(e => ({ ...e, [field]: '' }));
  };

  const pickStation = (id) => {
    const found = stations.find(s => getRecordId(s) === id);
    setForm(f => ({
      ...f, Stations: id,
      Station_Name: found?.Station_Name || f.Station_Name,
      Station_Code: found?.Station_Code || f.Station_Code,
    }));
    if (errors.Station_Name) setErrors(e => ({ ...e, Station_Name: '' }));
  };

  const validate = () => {
    const e = {};
    if (form.Sequence === '' || form.Sequence === null) e.Sequence = 'Sequence is required';
    else if (isNaN(Number(form.Sequence)) || Number(form.Sequence) < 0) e.Sequence = 'Must be ≥ 0';
    if (!form.Station_Name.trim() && !form.Stations) e.Station_Name = 'Station name or lookup required';
    return e;
  };

  const handleSubmit = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSave({
      Train:          trainId,
      Stations:       form.Stations     || undefined,
      Station_Name:   form.Station_Name.trim()  || undefined,
      Station_Code:   form.Station_Code.trim().toUpperCase() || undefined,
      Sequence:       Number(form.Sequence),
      Arrival_Time:   form.Arrival_Time   || undefined,
      Departure_Time: form.Departure_Time || undefined,
      Halt_Minutes:   form.Halt_Minutes !== '' ? Number(form.Halt_Minutes) : undefined,
      Distance_KM:    form.Distance_KM  !== '' ? Number(form.Distance_KM)  : undefined,
      Day_Count:      form.Day_Count    !== '' ? Number(form.Day_Count)    : 1,
    });
  };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', zIndex:1000,
               display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ width:'100%', maxWidth:520, background:'#0e1117', border:'1px solid #1e2433',
                    borderRadius:14, padding:28, fontFamily:FONT, maxHeight:'92vh', overflowY:'auto' }}>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div style={{ fontSize:16, fontWeight:700, color:'#f3f4f6' }}>
            {isEdit ? '✏ Edit Stop' : '➕ Add Stop'}
          </div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:7, border:'1px solid #1e2433',
            background:'transparent', color:'#6b7280', cursor:'pointer', fontSize:16 }}>×</button>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          <div>
            <label style={lS}>Station Lookup (auto-fills name & code)</label>
            <select value={form.Stations} onChange={e => pickStation(e.target.value)}
              style={{ ...iS, cursor:'pointer' }}>
              <option value="">— Select from saved stations (optional) —</option>
              {stations.map(s => (
                <option key={getRecordId(s)} value={getRecordId(s)}>
                  {s.Station_Code} — {s.Station_Name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div style={{ gridColumn:'span 2' }}>
              <label style={lS}>Station Name *</label>
              <input value={form.Station_Name} onChange={e => set('Station_Name', e.target.value)}
                placeholder="e.g. Chennai Central"
                style={{ ...iS, borderColor: errors.Station_Name ? '#ef4444' : '#1e2433' }} />
              {errors.Station_Name && <p style={{ margin:'3px 0 0', fontSize:11, color:'#f87171', fontFamily:FONT }}>{errors.Station_Name}</p>}
            </div>

            <div>
              <label style={lS}>Station Code</label>
              <input value={form.Station_Code} maxLength={8}
                onChange={e => set('Station_Code', e.target.value.toUpperCase())}
                placeholder="MAS" style={iS} />
            </div>

            <div>
              <label style={lS}>Sequence *</label>
              <input type="number" min={0} value={form.Sequence}
                onChange={e => set('Sequence', e.target.value)} placeholder="1, 2, 3…"
                style={{ ...iS, borderColor: errors.Sequence ? '#ef4444' : '#1e2433' }} />
              {errors.Sequence && <p style={{ margin:'3px 0 0', fontSize:11, color:'#f87171', fontFamily:FONT }}>{errors.Sequence}</p>}
            </div>

            <div>
              <label style={lS}>Arrival Time</label>
              <input type="time" value={form.Arrival_Time}
                onChange={e => set('Arrival_Time', e.target.value)} style={iS} />
            </div>

            <div>
              <label style={lS}>Departure Time</label>
              <input type="time" value={form.Departure_Time}
                onChange={e => set('Departure_Time', e.target.value)} style={iS} />
            </div>

            <div>
              <label style={lS}>Halt (minutes)</label>
              <input type="number" min={0} value={form.Halt_Minutes}
                onChange={e => set('Halt_Minutes', e.target.value)} placeholder="0" style={iS} />
            </div>

            <div>
              <label style={lS}>Distance from Origin (km)</label>
              <input type="number" min={0} step="0.1" value={form.Distance_KM}
                onChange={e => set('Distance_KM', e.target.value)} placeholder="0" style={iS} />
            </div>

            <div>
              <label style={lS}>Day Count</label>
              <input type="number" min={1} value={form.Day_Count}
                onChange={e => set('Day_Count', e.target.value)} placeholder="1" style={iS} />
              <p style={{ margin:'3px 0 0', fontSize:10, color:'#4b5563', fontFamily:FONT }}>1 = same day, 2 = next day</p>
            </div>
          </div>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:22 }}>
          <button onClick={onClose}
            style={{ padding:'10px 18px', borderRadius:8, border:'1px solid #1e2433',
                     background:'transparent', color:'#9ca3af', fontSize:13, fontWeight:600,
                     cursor:'pointer', fontFamily:FONT }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving}
            style={{ flex:1, padding:'10px', borderRadius:8, border:'none',
                     background: saving ? '#1e2433' : '#2563eb',
                     color: saving ? '#6b7280' : '#fff', fontSize:13, fontWeight:600,
                     cursor: saving ? 'not-allowed' : 'pointer', fontFamily:FONT,
                     display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving ? <><Spinner size={14} color="#6b7280" /> Saving…</> : isEdit ? '✔ Update Stop' : '➕ Add Stop'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function TrainRoutesPage() {
  const { addToast } = useToast();
  const [selectedTrainId, setSelectedTrainId] = useState('');
  const [stops,           setStops]           = useState([]);
  const [stopsLoading,    setStopsLoading]    = useState(false);
  const [modal,           setModal]           = useState(null);
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(null);
  const [trainSearch,     setTrainSearch]     = useState('');

  const fetchTrains   = useCallback(() => trainsApi.getAll(), []);
  const fetchStations = useCallback(() => stationsApi.getAll(), []);
  const { data: trainsData,   loading: trainsLoading } = useApi(fetchTrains);
  const { data: stationsData }                         = useApi(fetchStations);
  const allTrains   = extractRecords(trainsData);
  const allStations = extractRecords(stationsData);
  const selectedTrain = allTrains.find(t => getRecordId(t) === selectedTrainId);

  // Load stops
  useEffect(() => {
    if (!selectedTrainId) { setStops([]); return; }
    setStopsLoading(true);
    trainRoutesApi.getByTrain(selectedTrainId)
      .then(res => {
        const rows = res?.data?.data || res?.data || res || [];
        const arr  = Array.isArray(rows) ? rows : [];
        arr.sort((a, b) => Number(a.Sequence || 0) - Number(b.Sequence || 0));
        setStops(arr);
      })
      .catch(() => { addToast('Failed to load stops', 'error'); setStops([]); })
      .finally(() => setStopsLoading(false));
  }, [selectedTrainId]);

  const reloadStops = async () => {
    const fresh = await trainRoutesApi.getByTrain(selectedTrainId);
    const rows  = fresh?.data?.data || fresh?.data || fresh || [];
    const arr   = Array.isArray(rows) ? rows : [];
    arr.sort((a, b) => Number(a.Sequence || 0) - Number(b.Sequence || 0));
    setStops(arr);
  };

  // CREATE / UPDATE
  const handleSave = async (formData) => {
    setSaving(true);
    try {
      const isEdit = modal !== 'add' && safeId(modal);
      const res = isEdit
        ? await trainRoutesApi.update(safeId(modal), formData)
        : await trainRoutesApi.create(formData);
      if (res?.success === false || (res?.status_code && res.status_code >= 400))
        throw new Error(res?.error || res?.message || 'Save failed');
      addToast(isEdit ? 'Stop updated ✓' : 'Stop added ✓', 'success');
      setModal(null);
      await reloadStops();
    } catch (err) {
      addToast(err.message || 'Save failed', 'error');
    } finally { setSaving(false); }
  };

  // DELETE
  const handleDelete = async (stop) => {
    const id = safeId(stop);
    if (!id) { addToast('Record ID missing', 'error'); return; }
    if (!window.confirm(`Delete stop "${stop.Station_Name || stop.Station_Code || 'Seq ' + stop.Sequence}"?`)) return;
    setDeleting(id);
    try {
      const res = await trainRoutesApi.delete(id);
      if (res?.success === false || (res?.status_code && res.status_code >= 400))
        throw new Error(res?.error || res?.message || 'Delete failed');
      addToast('Stop deleted ✓', 'success');
      setStops(prev => prev.filter(s => safeId(s) !== id));
    } catch (err) {
      addToast(err.message || 'Delete failed', 'error');
    } finally { setDeleting(null); }
  };

  const filteredTrains = allTrains.filter(t => {
    if (!trainSearch) return true;
    const q = trainSearch.toLowerCase();
    return (t.Train_Name || '').toLowerCase().includes(q) || String(t.Train_Number || '').includes(q);
  });

  const thS = {
    padding:'8px 12px', fontSize:9, fontWeight:700, color:'#6b7280',
    textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:FONT,
    borderBottom:'1px solid #1e2433', background:'#080b11', textAlign:'left', whiteSpace:'nowrap',
  };
  const tdS = {
    padding:'10px 12px', fontSize:12, color:'#9ca3af', fontFamily:FONT,
    borderBottom:'1px solid #0d1017', verticalAlign:'middle',
  };

  return (
    <div>
      <PageHeader icon="map" iconAccent="#f59e0b"
        title="Train Routes"
        subtitle="Manage intermediate stops per train — powers connecting train search" />

      <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:20, alignItems:'start' }}>

        {/* Train list */}
        <Card padding={0}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase',
                          letterSpacing:'0.07em', marginBottom:8, fontFamily:FONT }}>Select Train</div>
            <input value={trainSearch} onChange={e => setTrainSearch(e.target.value)}
              placeholder="Search trains…" style={{ ...iS, padding:'8px 12px' }} />
          </div>
          {trainsLoading
            ? <div style={{ display:'flex', justifyContent:'center', padding:24 }}><Spinner size={20} /></div>
            : <div style={{ maxHeight:520, overflowY:'auto' }}>
                {filteredTrains.length === 0
                  ? <div style={{ padding:24, textAlign:'center', color:'#6b7280', fontSize:13, fontFamily:FONT }}>No trains found</div>
                  : filteredTrains.map(t => {
                      const id = getRecordId(t); const active = id === selectedTrainId;
                      return (
                        <div key={id} onClick={() => setSelectedTrainId(id)}
                          style={{ padding:'11px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                                   transition:'background 0.12s',
                                   background: active ? 'rgba(245,158,11,0.1)' : 'transparent',
                                   borderLeft: `3px solid ${active ? '#f59e0b' : 'transparent'}` }}
                          onMouseEnter={e => { if (!active) e.currentTarget.style.background='var(--bg-inset)'; }}
                          onMouseLeave={e => { if (!active) e.currentTarget.style.background='transparent'; }}>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', fontFamily:FONT }}>{t.Train_Name || '—'}</div>
                          <div style={{ fontSize:11, fontFamily:MONO, color:'#3b82f6', marginTop:1 }}>#{t.Train_Number || '—'}</div>
                          <div style={{ fontSize:10, color:'#6b7280', marginTop:2, fontFamily:FONT }}>
                            {stationLabel(t.From_Station)} → {stationLabel(t.To_Station)}
                          </div>
                        </div>
                      );
                    })
                }
              </div>
          }
        </Card>

        {/* Stops panel */}
        <div>
          {!selectedTrain ? (
            <Card>
              <div style={{ textAlign:'center', padding:'52px 24px' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🗺️</div>
                <div style={{ fontSize:15, fontWeight:700, color:'#9ca3af', fontFamily:FONT }}>Select a Train</div>
                <div style={{ fontSize:13, color:'#6b7280', marginTop:6, fontFamily:FONT }}>Choose a train from the left to manage its route stops.</div>
              </div>
            </Card>
          ) : (
            <Card padding={0}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)',
                            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
                <div>
                  <div style={{ fontSize:17, fontWeight:800, color:'var(--text-primary)', fontFamily:FONT }}>{selectedTrain.Train_Name}</div>
                  <div style={{ fontSize:11, fontFamily:MONO, color:'#3b82f6', marginTop:2 }}>
                    #{selectedTrain.Train_Number} · {stationLabel(selectedTrain.From_Station)} → {stationLabel(selectedTrain.To_Station)}
                  </div>
                  <div style={{ fontSize:11, color:'#6b7280', marginTop:3, fontFamily:FONT }}>
                    {stops.length} stop{stops.length !== 1 ? 's' : ''} configured
                  </div>
                </div>
                <button onClick={() => setModal('add')}
                  style={{ padding:'9px 18px', borderRadius:8, border:'none', background:'#2563eb',
                           color:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FONT,
                           display:'flex', alignItems:'center', gap:7 }}>
                  ➕ Add Stop
                </button>
              </div>

              {stopsLoading ? (
                <div style={{ display:'flex', justifyContent:'center', padding:40 }}><Spinner size={28} /></div>
              ) : stops.length === 0 ? (
                <div style={{ textAlign:'center', padding:'36px 24px' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>🛤️</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#6b7280', fontFamily:FONT }}>No stops yet</div>
                  <div style={{ fontSize:12, color:'#4b5563', marginTop:4, fontFamily:FONT }}>Add stops: origin (seq 1), intermediate, destination (last).</div>
                  <button onClick={() => setModal('add')}
                    style={{ marginTop:14, padding:'8px 18px', borderRadius:8,
                             border:'1px solid #2563eb', background:'rgba(37,99,235,0.1)',
                             color:'#60a5fa', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
                    ➕ Add First Stop
                  </button>
                </div>
              ) : (
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr>
                        {['Seq','Station','Code','Arrival','Departure','Halt','KM','Day','Actions'].map(h => (
                          <th key={h} style={thS}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {stops.map((stop, i) => {
                        const id = safeId(stop);
                        const isFirst = i === 0; const isLast = i === stops.length - 1;
                        const dotCol = isFirst ? '#3b82f6' : isLast ? '#22c55e' : '#6b7280';
                        const isDel  = deleting === id;
                        return (
                          <tr key={id || i}
                            onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                            onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                            <td style={{ ...tdS, width:50 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                                <div style={{ width:8, height:8, borderRadius:'50%', background:dotCol, flexShrink:0 }} />
                                <span style={{ fontFamily:MONO, fontWeight:700, color:dotCol, fontSize:13 }}>{stop.Sequence}</span>
                              </div>
                            </td>

                            <td style={tdS}>
                              <div style={{ fontSize:13, fontWeight: isFirst||isLast ? 700 : 500,
                                            color: isFirst||isLast ? 'var(--text-primary)' : '#9ca3af', fontFamily:FONT }}>
                                {stop.Station_Name || stationLabel(stop.Stations) || '—'}
                              </div>
                              {(isFirst || isLast) && (
                                <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:10,
                                               background:`${dotCol}22`, color:dotCol, textTransform:'uppercase',
                                               marginTop:2, display:'inline-block' }}>
                                  {isFirst ? 'Origin' : 'Destination'}
                                </span>
                              )}
                            </td>

                            <td style={{ ...tdS, fontFamily:MONO, fontSize:11, color:'#3b82f6' }}>{stop.Station_Code || '—'}</td>
                            <td style={{ ...tdS, fontFamily:MONO }}>{stop.Arrival_Time || '—'}</td>
                            <td style={{ ...tdS, fontFamily:MONO }}>{stop.Departure_Time || '—'}</td>
                            <td style={tdS}>{stop.Halt_Minutes != null && stop.Halt_Minutes !== '' ? `${stop.Halt_Minutes}m` : '—'}</td>
                            <td style={tdS}>{stop.Distance_KM != null && stop.Distance_KM !== '' ? `${stop.Distance_KM}km` : '—'}</td>
                            <td style={{ ...tdS, fontFamily:MONO }}>{stop.Day_Count || 1}</td>

                            <td style={{ ...tdS, whiteSpace:'nowrap' }}>
                              <div style={{ display:'flex', gap:6 }}>
                                <button onClick={() => setModal(stop)}
                                  style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #1e2433',
                                           background:'rgba(59,130,246,0.08)', color:'#60a5fa',
                                           fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT }}
                                  onMouseEnter={e => { e.currentTarget.style.background='rgba(59,130,246,0.2)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background='rgba(59,130,246,0.08)'; }}>
                                  ✏ Edit
                                </button>
                                <button onClick={() => handleDelete(stop)} disabled={isDel}
                                  style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #374151',
                                           background:'rgba(239,68,68,0.06)', color: isDel ? '#6b7280' : '#f87171',
                                           fontSize:11, fontWeight:600, cursor: isDel ? 'not-allowed' : 'pointer', fontFamily:FONT }}
                                  onMouseEnter={e => { if (!isDel) e.currentTarget.style.background='rgba(239,68,68,0.2)'; }}
                                  onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; }}>
                                  {isDel ? '…' : '✕ Del'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ padding:'10px 16px', borderTop:'1px solid #1e2433', fontSize:11, color:'#4b5563', fontFamily:FONT }}>
                    💡 Station_Code (e.g. MAS, NDLS) enables connecting train search. Origin = Seq 1, Destination = last.
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {modal !== null && (
        <StopModal
          stop={modal === 'add' ? null : modal}
          trainId={selectedTrainId}
          stations={allStations}
          onSave={handleSave}
          onClose={() => setModal(null)}
          saving={saving}
        />
      )}
    </div>
  );
}