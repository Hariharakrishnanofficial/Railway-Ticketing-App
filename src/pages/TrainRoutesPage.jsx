/**
 * TrainRoutesPage.jsx
 * Train sub-station management — IRCTC style
 *
 * Layout:
 *  TOP: Train selector dropdown + train info bar
 *  BELOW: Sub-stations table with inline Add row at bottom
 *         Every row has Edit (inline) and Delete buttons
 */
import { useState, useEffect, useCallback } from 'react';
import {
  trainsApi, stationsApi, trainRoutesApi,
  extractRecords, getRecordId,
} from '../services/api';
import { useApi }   from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Spinner } from '../components/UI';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

const cell = {
  padding:'0 8px', background:'#0a0d14', border:'1px solid #1e2433',
  borderRadius:6, color:'#d1d5db', fontSize:12, fontFamily:FONT,
  outline:'none', height:32, boxSizing:'border-box', width:'100%',
};
const BLANK_ROW = {
  Station_Name:'', Station_Code:'', Sequence:'',
  Arrival_Time:'', Departure_Time:'', Halt_Minutes:'',
  Distance_KM:'', Day_Count:'1', Stations:'',
};

function stLabel(f) {
  if (!f) return '—';
  if (typeof f === 'object') return (f.display_value || f.ID || '—').trim();
  return String(f).trim();
}
function sid(r) { return r?.ID || r?.id || null; }

// ── Inline editable row ────────────────────────────────────────────────────────
function EditRow({ row, stations, onSave, onCancel, saving }) {
  const [f, setF] = useState({
    Stations:       typeof row?.Stations === 'object' ? (row.Stations?.ID||'') : (row?.Stations||''),
    Station_Name:   row?.Station_Name   || '',
    Station_Code:   row?.Station_Code   || '',
    Sequence:       row?.Sequence       ?? '',
    Arrival_Time:   row?.Arrival_Time   || '',
    Departure_Time: row?.Departure_Time || '',
    Halt_Minutes:   row?.Halt_Minutes   ?? '',
    Distance_KM:    row?.Distance_KM    ?? '',
    Day_Count:      row?.Day_Count      ?? '1',
  });

  const s = (k, v) => setF(p => ({ ...p, [k]: v }));

  const pickSt = id => {
    const found = stations.find(st => getRecordId(st) === id);
    setF(p => ({
      ...p, Stations: id,
      Station_Name: found?.Station_Name || p.Station_Name,
      Station_Code: found?.Station_Code || p.Station_Code,
    }));
  };

  const submit = () => {
    if (!f.Station_Name.trim() && !f.Stations) { alert('Station name or lookup required'); return; }
    if (f.Sequence === '' || f.Sequence === null) { alert('Sequence is required'); return; }
    onSave({
      Stations:       f.Stations     || undefined,
      Station_Name:   f.Station_Name.trim()  || undefined,
      Station_Code:   f.Station_Code.trim().toUpperCase() || undefined,
      Sequence:       Number(f.Sequence),
      Arrival_Time:   f.Arrival_Time   || undefined,
      Departure_Time: f.Departure_Time || undefined,
      Halt_Minutes:   f.Halt_Minutes !== '' ? Number(f.Halt_Minutes) : undefined,
      Distance_KM:    f.Distance_KM  !== '' ? Number(f.Distance_KM)  : undefined,
      Day_Count:      f.Day_Count    !== '' ? Number(f.Day_Count)    : 1,
    });
  };

  const inCell = { ...cell };

  return (
    <tr style={{ background:'rgba(37,99,235,0.06)' }}>
      {/* Seq */}
      <td style={{ padding:'6px 8px' }}>
        <input type="number" min={0} value={f.Sequence} placeholder="#"
          onChange={e => s('Sequence', e.target.value)}
          style={{ ...inCell, width:56 }} />
      </td>
      {/* Station lookup */}
      <td style={{ padding:'6px 8px', minWidth:140 }}>
        <select value={f.Stations} onChange={e => pickSt(e.target.value)}
          style={{ ...inCell, cursor:'pointer' }}>
          <option value="">— lookup —</option>
          {stations.map(st => (
            <option key={getRecordId(st)} value={getRecordId(st)}>
              {st.Station_Code} — {st.Station_Name}
            </option>
          ))}
        </select>
      </td>
      {/* Name */}
      <td style={{ padding:'6px 8px', minWidth:160 }}>
        <input value={f.Station_Name} placeholder="Station Name *"
          onChange={e => s('Station_Name', e.target.value)}
          style={inCell} />
      </td>
      {/* Code */}
      <td style={{ padding:'6px 8px' }}>
        <input value={f.Station_Code} placeholder="MAS" maxLength={8}
          onChange={e => s('Station_Code', e.target.value.toUpperCase())}
          style={{ ...inCell, width:70 }} />
      </td>
      {/* Arrival */}
      <td style={{ padding:'6px 8px' }}>
        <input type="time" value={f.Arrival_Time}
          onChange={e => s('Arrival_Time', e.target.value)}
          style={{ ...inCell, width:96 }} />
      </td>
      {/* Departure */}
      <td style={{ padding:'6px 8px' }}>
        <input type="time" value={f.Departure_Time}
          onChange={e => s('Departure_Time', e.target.value)}
          style={{ ...inCell, width:96 }} />
      </td>
      {/* Halt */}
      <td style={{ padding:'6px 8px' }}>
        <input type="number" min={0} value={f.Halt_Minutes} placeholder="0"
          onChange={e => s('Halt_Minutes', e.target.value)}
          style={{ ...inCell, width:60 }} />
      </td>
      {/* KM */}
      <td style={{ padding:'6px 8px' }}>
        <input type="number" min={0} step="0.1" value={f.Distance_KM} placeholder="0"
          onChange={e => s('Distance_KM', e.target.value)}
          style={{ ...inCell, width:70 }} />
      </td>
      {/* Day */}
      <td style={{ padding:'6px 8px' }}>
        <input type="number" min={1} value={f.Day_Count} placeholder="1"
          onChange={e => s('Day_Count', e.target.value)}
          style={{ ...inCell, width:50 }} />
      </td>
      {/* Actions */}
      <td style={{ padding:'6px 8px', whiteSpace:'nowrap' }}>
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={submit} disabled={saving}
            style={{ padding:'5px 12px', borderRadius:6, border:'none',
                     background: saving ? '#1e2433' : '#2563eb',
                     color: saving ? '#6b7280' : '#fff',
                     fontSize:11, fontWeight:700, cursor: saving ? 'not-allowed' : 'pointer', fontFamily:FONT,
                     display:'flex', alignItems:'center', gap:5 }}>
            {saving ? <Spinner size={11} color="#6b7280" /> : null}
            {saving ? 'Saving…' : '✔ Save'}
          </button>
          <button onClick={onCancel}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #374151',
                     background:'transparent', color:'#9ca3af',
                     fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function TrainRoutesPage() {
  const { addToast } = useToast();

  const [selectedTrainId, setSelectedTrainId] = useState('');
  const [stops,           setStops]           = useState([]);
  const [stopsLoading,    setStopsLoading]    = useState(false);
  const [editingId,       setEditingId]       = useState(null); // ID of row being edited
  const [addingRow,       setAddingRow]       = useState(false); // show add row at bottom
  const [saving,          setSaving]          = useState(false);
  const [deleting,        setDeleting]        = useState(null);

  const fetchTrains   = useCallback(() => trainsApi.getAll(), []);
  const fetchStations = useCallback(() => stationsApi.getAll(), []);
  const { data: trainsData,   loading: trainsLoading } = useApi(fetchTrains);
  const { data: stationsData }                         = useApi(fetchStations);
  const allTrains   = extractRecords(trainsData);
  const allStations = extractRecords(stationsData);
  const selectedTrain = allTrains.find(t => getRecordId(t) === selectedTrainId);

  // ── Load stops ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedTrainId) { setStops([]); return; }
    setStopsLoading(true);
    setEditingId(null); setAddingRow(false);
    trainRoutesApi.getByTrain(selectedTrainId)
      .then(res => {
        const rows = res?.data?.data || res?.data || res || [];
        const arr  = Array.isArray(rows) ? rows : [];
        arr.sort((a, b) => Number(a.Sequence||0) - Number(b.Sequence||0));
        setStops(arr);
      })
      .catch(() => { addToast('Failed to load stops', 'error'); setStops([]); })
      .finally(() => setStopsLoading(false));
  }, [selectedTrainId]);

  const reload = async () => {
    const res = await trainRoutesApi.getByTrain(selectedTrainId);
    const rows = res?.data?.data || res?.data || res || [];
    const arr  = Array.isArray(rows) ? rows : [];
    arr.sort((a, b) => Number(a.Sequence||0) - Number(b.Sequence||0));
    setStops(arr);
  };

  // ── CREATE ──────────────────────────────────────────────────────────────────
  const handleCreate = async (formData) => {
    setSaving(true);
    try {
      const res = await trainRoutesApi.create({ ...formData, Train: selectedTrainId });
      if (res?.success === false || (res?.status_code && res.status_code >= 400))
        throw new Error(res?.error || res?.message || 'Create failed');
      addToast('Sub-station added ✓', 'success');
      setAddingRow(false);
      await reload();
    } catch (err) { addToast(err.message || 'Create failed', 'error'); }
    finally { setSaving(false); }
  };

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  const handleUpdate = async (id, formData) => {
    setSaving(true);
    try {
      const res = await trainRoutesApi.update(id, { ...formData, Train: selectedTrainId });
      if (res?.success === false || (res?.status_code && res.status_code >= 400))
        throw new Error(res?.error || res?.message || 'Update failed');
      addToast('Sub-station updated ✓', 'success');
      setEditingId(null);
      await reload();
    } catch (err) { addToast(err.message || 'Update failed', 'error'); }
    finally { setSaving(false); }
  };

  // ── DELETE ──────────────────────────────────────────────────────────────────
  const handleDelete = async (stop) => {
    const id = sid(stop);
    if (!id) { addToast('Record ID missing', 'error'); return; }
    if (!window.confirm(`Delete "${stop.Station_Name || stop.Station_Code || 'Seq '+stop.Sequence}" from route?`)) return;
    setDeleting(id);
    try {
      const res = await trainRoutesApi.delete(id);
      if (res?.success === false || (res?.status_code && res.status_code >= 400))
        throw new Error(res?.error || res?.message || 'Delete failed');
      addToast('Sub-station deleted ✓', 'success');
      setStops(prev => prev.filter(s => sid(s) !== id));
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
    finally { setDeleting(null); }
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const thS = {
    padding:'9px 12px', fontSize:9, fontWeight:700, color:'#6b7280',
    textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:FONT,
    borderBottom:'1px solid #1e2433', background:'#060810',
    textAlign:'left', whiteSpace:'nowrap',
  };
  const tdS = {
    padding:'11px 12px', fontSize:12, color:'#9ca3af',
    fontFamily:FONT, borderBottom:'1px solid #0d1017', verticalAlign:'middle',
  };

  return (
    <div style={{ fontFamily:FONT }}>
      <PageHeader icon="map" iconAccent="#f59e0b"
        title="Train Routes — Sub-Station Management"
        subtitle="Add, edit and delete intermediate stops for each train" />

      {/* ── Train selector bar ── */}
      <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)',
                    borderRadius:12, padding:'16px 20px', marginBottom:20,
                    display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
        <div style={{ flex:'1 1 260px' }}>
          <label style={{ fontSize:10, fontWeight:700, color:'#6b7280', textTransform:'uppercase',
                          letterSpacing:'0.07em', display:'block', marginBottom:5 }}>
            Select Train *
          </label>
          {trainsLoading
            ? <div style={{ display:'flex', alignItems:'center', gap:8, color:'#6b7280', fontSize:13 }}>
                <Spinner size={14} /> Loading trains…
              </div>
            : <select value={selectedTrainId} onChange={e => setSelectedTrainId(e.target.value)}
                style={{ ...cell, height:38, fontSize:13, width:'100%', maxWidth:400, cursor:'pointer' }}>
                <option value="">— Choose a train to manage its stops —</option>
                {allTrains.map(t => (
                  <option key={getRecordId(t)} value={getRecordId(t)}>
                    #{t.Train_Number} — {t.Train_Name}
                    {t.From_Station || t.To_Station
                      ? ` (${stLabel(t.From_Station)} → ${stLabel(t.To_Station)})`
                      : ''}
                  </option>
                ))}
              </select>
          }
        </div>

        {selectedTrain && (
          <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
            <div style={{ padding:'8px 14px', background:'rgba(37,99,235,0.08)',
                          border:'1px solid rgba(37,99,235,0.2)', borderRadius:8 }}>
              <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em' }}>Train</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#f3f4f6', marginTop:1 }}>
                {selectedTrain.Train_Name}
              </div>
              <div style={{ fontSize:11, fontFamily:MONO, color:'#3b82f6' }}>
                #{selectedTrain.Train_Number} · {stLabel(selectedTrain.From_Station)} → {stLabel(selectedTrain.To_Station)}
              </div>
            </div>
            <div style={{ padding:'8px 14px', background:'rgba(245,158,11,0.08)',
                          border:'1px solid rgba(245,158,11,0.2)', borderRadius:8, textAlign:'center' }}>
              <div style={{ fontSize:22, fontWeight:800, color:'#f59e0b', fontFamily:MONO }}>{stops.length}</div>
              <div style={{ fontSize:10, color:'#6b7280', fontWeight:600, textTransform:'uppercase' }}>Stops</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Sub-stations table ── */}
      {!selectedTrainId ? (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:12,
                      padding:'60px 24px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🗺️</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#9ca3af' }}>Select a Train Above</div>
          <div style={{ fontSize:13, color:'#6b7280', marginTop:6 }}>
            Choose a train from the dropdown to view and manage its sub-stations.
          </div>
        </div>
      ) : (
        <div style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>

          {/* Table header bar */}
          <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border)',
                        display:'flex', justifyContent:'space-between', alignItems:'center', gap:12 }}>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:'var(--text-primary)' }}>
                Sub-Stations for {selectedTrain?.Train_Name}
              </div>
              <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>
                {stops.length} stop{stops.length !== 1 ? 's' : ''} — add origin (Seq 1), intermediate stops, then destination
              </div>
            </div>
            <button
              onClick={() => { setAddingRow(true); setEditingId(null); }}
              disabled={addingRow}
              style={{ padding:'8px 16px', borderRadius:8, border:'none',
                       background: addingRow ? '#1e2433' : '#2563eb',
                       color: addingRow ? '#6b7280' : '#fff',
                       fontSize:13, fontWeight:600,
                       cursor: addingRow ? 'not-allowed' : 'pointer', fontFamily:FONT,
                       display:'flex', alignItems:'center', gap:6 }}>
              ➕ Add Sub-Station
            </button>
          </div>

          {stopsLoading ? (
            <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
              <Spinner size={32} />
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:900 }}>
                <thead>
                  <tr>
                    <th style={{ ...thS, width:60 }}>Seq</th>
                    <th style={{ ...thS, width:140 }}>Lookup</th>
                    <th style={thS}>Station Name</th>
                    <th style={{ ...thS, width:80 }}>Code</th>
                    <th style={{ ...thS, width:100 }}>Arrival</th>
                    <th style={{ ...thS, width:100 }}>Departure</th>
                    <th style={{ ...thS, width:70 }}>Halt(m)</th>
                    <th style={{ ...thS, width:80 }}>KM</th>
                    <th style={{ ...thS, width:60 }}>Day</th>
                    <th style={{ ...thS, width:130 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>

                  {/* ── Data rows ── */}
                  {stops.length === 0 && !addingRow && (
                    <tr>
                      <td colSpan={10} style={{ padding:'40px 24px', textAlign:'center', color:'#6b7280', fontFamily:FONT }}>
                        <div style={{ fontSize:24, marginBottom:8 }}>🛤️</div>
                        <div style={{ fontSize:13, fontWeight:600 }}>No sub-stations yet</div>
                        <div style={{ fontSize:12, color:'#4b5563', marginTop:4 }}>
                          Click <strong style={{ color:'#60a5fa' }}>➕ Add Sub-Station</strong> above to start
                        </div>
                      </td>
                    </tr>
                  )}

                  {stops.map((stop, i) => {
                    const id      = sid(stop);
                    const isFirst = i === 0;
                    const isLast  = i === stops.length - 1;
                    const dotCol  = isFirst ? '#3b82f6' : isLast ? '#22c55e' : '#f59e0b';
                    const isDel   = deleting === id;

                    // ── Inline edit row ──
                    if (editingId === id) {
                      return (
                        <EditRow key={id} row={stop} stations={allStations}
                          onSave={fd => handleUpdate(id, fd)}
                          onCancel={() => setEditingId(null)}
                          saving={saving} />
                      );
                    }

                    // ── Read row ──
                    return (
                      <tr key={id || i}
                        onMouseEnter={e => e.currentTarget.style.background='rgba(255,255,255,0.025)'}
                        onMouseLeave={e => e.currentTarget.style.background='transparent'}>

                        {/* Seq */}
                        <td style={{ ...tdS, width:60 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <div style={{ width:9, height:9, borderRadius:'50%',
                                          background:dotCol, flexShrink:0, boxShadow:`0 0 6px ${dotCol}88` }} />
                            <span style={{ fontFamily:MONO, fontWeight:800, color:dotCol, fontSize:14 }}>
                              {stop.Sequence}
                            </span>
                          </div>
                        </td>

                        {/* Lookup display */}
                        <td style={{ ...tdS, fontSize:11, color:'#4b5563', fontFamily:MONO }}>
                          {stop.Stations && typeof stop.Stations === 'object'
                            ? stop.Stations.display_value || '—'
                            : stop.Stations || '—'}
                        </td>

                        {/* Name */}
                        <td style={tdS}>
                          <div style={{ fontWeight: isFirst||isLast ? 700 : 500,
                                        color: isFirst||isLast ? 'var(--text-primary)' : '#9ca3af',
                                        fontSize:13, fontFamily:FONT }}>
                            {stop.Station_Name || '—'}
                          </div>
                          {(isFirst || isLast) && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'1px 7px', borderRadius:20,
                                           background:`${dotCol}22`, color:dotCol, textTransform:'uppercase',
                                           marginTop:3, display:'inline-block', letterSpacing:'0.06em' }}>
                              {isFirst ? 'Origin' : 'Destination'}
                            </span>
                          )}
                        </td>

                        {/* Code */}
                        <td style={{ ...tdS, fontFamily:MONO, fontSize:12, fontWeight:700, color:'#60a5fa' }}>
                          {stop.Station_Code || '—'}
                        </td>

                        {/* Arrival */}
                        <td style={{ ...tdS, fontFamily:MONO, fontSize:12 }}>
                          {stop.Arrival_Time || '—'}
                        </td>

                        {/* Departure */}
                        <td style={{ ...tdS, fontFamily:MONO, fontSize:12 }}>
                          {stop.Departure_Time || '—'}
                        </td>

                        {/* Halt */}
                        <td style={tdS}>
                          {stop.Halt_Minutes != null && stop.Halt_Minutes !== ''
                            ? <span style={{ background:'rgba(245,158,11,0.1)', color:'#f59e0b',
                                             padding:'2px 7px', borderRadius:20, fontSize:11, fontWeight:600 }}>
                                {stop.Halt_Minutes}m
                              </span>
                            : '—'}
                        </td>

                        {/* KM */}
                        <td style={{ ...tdS, fontSize:11, color:'#6b7280' }}>
                          {stop.Distance_KM != null && stop.Distance_KM !== ''
                            ? `${stop.Distance_KM} km` : '—'}
                        </td>

                        {/* Day */}
                        <td style={{ ...tdS, fontFamily:MONO, fontSize:12, color:'#6b7280' }}>
                          {stop.Day_Count || 1}
                        </td>

                        {/* Actions */}
                        <td style={{ ...tdS, whiteSpace:'nowrap' }}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button
                              onClick={() => { setEditingId(id); setAddingRow(false); }}
                              style={{ padding:'5px 11px', borderRadius:6, border:'1px solid #1e2433',
                                       background:'rgba(59,130,246,0.08)', color:'#60a5fa',
                                       fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT }}
                              onMouseEnter={e => { e.currentTarget.style.background='rgba(59,130,246,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background='rgba(59,130,246,0.08)'; }}>
                              ✏ Edit
                            </button>
                            <button
                              onClick={() => handleDelete(stop)} disabled={isDel}
                              style={{ padding:'5px 8px', borderRadius:6, border:'1px solid #374151',
                                       background:'rgba(239,68,68,0.06)',
                                       color: isDel ? '#6b7280' : '#f87171',
                                       fontSize:11, fontWeight:600,
                                       cursor: isDel ? 'not-allowed' : 'pointer', fontFamily:FONT }}
                              onMouseEnter={e => { if (!isDel) e.currentTarget.style.background='rgba(239,68,68,0.2)'; }}
                              onMouseLeave={e => { e.currentTarget.style.background='rgba(239,68,68,0.06)'; }}>
                              {isDel ? '…' : '✕'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* ── Add new row at bottom ── */}
                  {addingRow && (
                    <EditRow row={null} stations={allStations}
                      onSave={handleCreate}
                      onCancel={() => setAddingRow(false)}
                      saving={saving} />
                  )}

                </tbody>
              </table>

              {/* Footer tip */}
              <div style={{ padding:'10px 16px', borderTop:'1px solid #1e2433',
                            fontSize:11, color:'#374151', fontFamily:FONT,
                            display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <span>
                  💡 <strong style={{ color:'#6b7280' }}>Station Code</strong> (e.g. MAS, NDLS, JP) is required for connecting train search to work.
                </span>
                <span style={{ color:'#374151' }}>
                  Seq 1 = Origin · Last Seq = Destination · Middle = Intermediate stops
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}   