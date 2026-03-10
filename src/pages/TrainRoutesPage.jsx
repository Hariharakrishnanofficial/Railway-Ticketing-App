/**
 * TrainRoutesPage.jsx
 *
 * Fix: "Create Route Record" no longer creates an empty DB record.
 * Instead it opens an inline setup panel where the user adds all
 * stops first, then ONE API call creates the parent + all stops together.
 *
 * API model (Zoho subform):
 *   Train_Routes is the PARENT form (one record per train).
 *   Route_Stops  is the SUBFORM (many rows inside each Train_Routes record).
 *
 *   trainRoutesApi.create({ Train, stops[] })        → create parent + stops in ONE call
 *   trainRoutesApi.addStop(routeId, stopData)        → insert subform row (route already exists)
 *   trainRoutesApi.updateStop(routeId, stopId, data) → update subform row
 *   trainRoutesApi.deleteStop(routeId, stopId)       → delete subform row
 */

import { useState, useEffect, useCallback } from 'react';
import {
  trainsApi, stationsApi, trainRoutesApi,
  extractRecords, getRecordId,
} from '../services/api';
import { useApi }   from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { Spinner }  from '../components/UI';

const FONT = "'DM Sans','Inter','Segoe UI',system-ui,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";
const C = {
  bg:'#07090f', surface:'#0c0f1a', raised:'#101520',
  border:'#1a2035', hi:'#242d44',
  text:'#e2e8f0', muted:'#64748b', faint:'#334155',
  blue:'#3b82f6', amber:'#f59e0b', green:'#22c55e',
  red:'#ef4444',  purple:'#a78bfa', cyan:'#06b6d4',
};

const inp = {
  boxSizing:'border-box', width:'100%', padding:'8px 12px',
  background:C.bg, border:`1px solid ${C.border}`, borderRadius:8,
  color:C.text, fontSize:12, fontFamily:FONT, outline:'none',
};
const onFocus = e => (e.target.style.borderColor = C.blue);
const onBlur  = e => (e.target.style.borderColor = C.border);

const gid = r => r?.ID || r?.id || null;
const lbl = f => !f ? '—' : typeof f === 'object'
  ? (f.display_value || f.ID || '—').split('-')[0].trim()
  : String(f).trim();

function stopType(idx, total) {
  if (idx === 0)         return 'origin';
  if (idx === total - 1) return 'destination';
  return 'intermediate';
}
const TYPE_CFG = {
  origin:       { color: C.blue,  label: 'ORIGIN' },
  destination:  { color: C.green, label: 'DEST'   },
  intermediate: { color: C.amber, label: 'STOP'   },
};

function StopBadge({ type }) {
  const c = TYPE_CFG[type];
  return (
    <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:20,
                   background:`${c.color}18`, color:c.color, letterSpacing:'0.07em',
                   border:`1px solid ${c.color}30` }}>
      {c.label}
    </span>
  );
}

const blankStop = (seq) => ({
  Stations:'', Station_Name:'', Station_Code:'',
  Sequence: seq, Arrival_Time:'', Departure_Time:'',
  Halt_Minutes:'', Distance_KM:'', Day_Count:'1',
});

/* ── StopRow: single editable row inside CreateRoutePanel ─── */
function StopRow({ stop, idx, total, stations, onChange, onRemove }) {
  const type   = stopType(idx, total);
  const dotCol = TYPE_CFG[type].color;
  const lbS    = { fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase',
                   letterSpacing:'0.07em', marginBottom:3, display:'block' };
  const set = (k, v) => onChange(idx, { ...stop, [k]: v });

  const pickStation = id => {
    const found = stations.find(s => getRecordId(s) === id);
    onChange(idx, {
      ...stop, Stations: id,
      Station_Name: found?.Station_Name || stop.Station_Name,
      Station_Code: found?.Station_Code || stop.Station_Code,
    });
  };

  return (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start',
                  background:C.raised, border:`1px solid ${C.hi}`,
                  borderLeft:`3px solid ${dotCol}`, borderRadius:10,
                  padding:'12px 14px', marginBottom:8, position:'relative' }}>

      <div style={{ width:28, height:28, borderRadius:'50%', background:dotCol,
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:11, fontWeight:800, color:'#fff', flexShrink:0, marginTop:4 }}>
        {stop.Sequence}
      </div>

      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 90px', gap:8, marginBottom:8 }}>
          <div>
            <span style={lbS}>Station Lookup</span>
            <select value={stop.Stations} onChange={e => pickStation(e.target.value)}
              style={{...inp, cursor:'pointer'}} onFocus={onFocus} onBlur={onBlur}>
              <option value="">— pick from master list —</option>
              {stations.map(s => (
                <option key={getRecordId(s)} value={getRecordId(s)}>
                  {s.Station_Code} – {s.Station_Name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span style={lbS}>Station Name *</span>
            <input value={stop.Station_Name} placeholder="e.g. Chennai Central"
              onChange={e => set('Station_Name', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <span style={lbS}>Code</span>
            <input value={stop.Station_Code} placeholder="MAS" maxLength={8}
              onChange={e => set('Station_Code', e.target.value.toUpperCase())}
              style={{...inp, fontFamily:MONO}} onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 72px 90px 56px', gap:8 }}>
          <div>
            <span style={lbS}>Arrival</span>
            <input type="time" value={stop.Arrival_Time}
              onChange={e => set('Arrival_Time', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <span style={lbS}>Departure</span>
            <input type="time" value={stop.Departure_Time}
              onChange={e => set('Departure_Time', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <span style={lbS}>Halt (m)</span>
            <input type="number" min={0} value={stop.Halt_Minutes} placeholder="0"
              onChange={e => set('Halt_Minutes', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <span style={lbS}>Dist (km)</span>
            <input type="number" min={0} step="0.1" value={stop.Distance_KM} placeholder="0"
              onChange={e => set('Distance_KM', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
          <div>
            <span style={lbS}>Day</span>
            <input type="number" min={1} value={stop.Day_Count} placeholder="1"
              onChange={e => set('Day_Count', e.target.value)}
              style={inp} onFocus={onFocus} onBlur={onBlur} />
          </div>
        </div>
      </div>

      {total > 1 && (
        <button onClick={() => onRemove(idx)}
          style={{ position:'absolute', top:10, right:10, padding:'3px 8px', borderRadius:6,
                   border:`1px solid ${C.faint}`, background:'transparent',
                   color:C.red, fontSize:11, cursor:'pointer', fontFamily:FONT }}>
          ✕
        </button>
      )}
    </div>
  );
}

/* ── CreateRoutePanel: add all stops FIRST, then create ────── */
function CreateRoutePanel({ train, stations, onCreated, onCancel }) {
  const { addToast } = useToast();
  const [stops,  setStops]  = useState([blankStop(1), blankStop(2)]);
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const addStop = () =>
    setStops(prev => [...prev, blankStop(prev.length + 1)]);

  const changeStop = (idx, updated) =>
    setStops(prev => prev.map((s, i) => i === idx ? updated : s));

  const removeStop = (idx) =>
    setStops(prev =>
      prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, Sequence: i + 1 }))
    );

  const buildPayload = s => {
    const p = { Sequence: Number(s.Sequence), Day_Count: s.Day_Count !== '' ? Number(s.Day_Count) : 1 };
    if (s.Stations)           p.Stations       = s.Stations;
    if (s.Station_Name?.trim()) p.Station_Name = s.Station_Name.trim();
    if (s.Station_Code?.trim()) p.Station_Code = s.Station_Code.trim().toUpperCase();
    if (s.Arrival_Time)       p.Arrival_Time   = s.Arrival_Time;
    if (s.Departure_Time)     p.Departure_Time = s.Departure_Time;
    if (s.Halt_Minutes !== '') p.Halt_Minutes  = Number(s.Halt_Minutes);
    if (s.Distance_KM  !== '') p.Distance_KM   = Number(s.Distance_KM);
    return p;
  };

  const handleSubmit = async () => {
    setErr('');
    const missing = stops.findIndex(s => !s.Station_Name.trim() && !s.Stations);
    if (missing >= 0) { setErr(`Stop ${missing + 1}: Station Name is required.`); return; }
    if (stops.length < 2) { setErr('Add at least 2 stops: an origin and a destination.'); return; }

    setSaving(true);
    try {
      const res = await trainRoutesApi.create({
        Train: getRecordId(train),
        stops: stops.map(buildPayload),
      });
      if (res?.success === false)
        throw new Error(res?.error || res?.message || 'Create failed');
      addToast(`Route created with ${stops.length} stops ✓`, 'success');
      onCreated();
    } catch(e) {
      setErr(e.message || 'Failed to create route');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background:'rgba(245,158,11,0.03)', border:`1px solid rgba(245,158,11,0.22)`,
                  borderRadius:14, padding:20 }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:14, fontWeight:800, color:C.amber }}>
            🛤️ Set Up Route — {train?.Train_Name}
          </div>
          <div style={{ fontSize:11, color:C.muted, marginTop:4, lineHeight:1.6 }}>
            Add <strong style={{color:C.text}}>all stops</strong> below (origin → intermediates → destination),
            then click <strong style={{color:C.green}}>Create Route</strong>.
            <br/>
            <span style={{color:C.faint}}>Nothing is written to the database until you submit.</span>
          </div>
        </div>
        <button onClick={onCancel}
          style={{ padding:'5px 12px', borderRadius:7, border:`1px solid ${C.hi}`,
                   background:'transparent', color:C.muted,
                   fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT, flexShrink:0 }}>
          Cancel
        </button>
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:14, marginBottom:14, flexWrap:'wrap' }}>
        {[['Seq 1 = Origin', C.blue], ['Middle = Intermediate', C.amber], ['Last = Destination', C.green]].map(([l,c]) => (
          <div key={l} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:c }} />
            <span style={{ fontSize:10, color:C.muted }}>{l}</span>
          </div>
        ))}
      </div>

      {/* Stop rows */}
      {stops.map((stop, idx) => (
        <StopRow key={idx} stop={stop} idx={idx} total={stops.length}
          stations={stations} onChange={changeStop} onRemove={removeStop} />
      ))}

      {/* Add stop */}
      <button onClick={addStop}
        style={{ width:'100%', padding:'9px 0', borderRadius:8,
                 border:`1px dashed ${C.faint}`, background:'transparent',
                 color:C.muted, fontSize:12, fontWeight:600, fontFamily:FONT,
                 cursor:'pointer', marginBottom:16 }}
        onMouseEnter={e=>{e.target.style.borderColor=C.blue;e.target.style.color=C.blue;}}
        onMouseLeave={e=>{e.target.style.borderColor=C.faint;e.target.style.color=C.muted;}}>
        ＋ Add Another Stop
      </button>

      {/* Error */}
      {err && (
        <div style={{ padding:'8px 12px', borderRadius:8,
                      background:'rgba(239,68,68,0.08)', border:`1px solid rgba(239,68,68,0.2)`,
                      color:C.red, fontSize:12, marginBottom:12 }}>
          ⚠ {err}
        </div>
      )}

      {/* Submit */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <button onClick={handleSubmit} disabled={saving}
          style={{ padding:'10px 26px', borderRadius:9, border:'none',
                   background: saving ? C.faint : C.green,
                   color: saving ? C.muted : '#fff',
                   fontSize:13, fontWeight:800, fontFamily:FONT,
                   cursor: saving ? 'not-allowed' : 'pointer',
                   display:'flex', alignItems:'center', gap:8 }}>
          {saving && <Spinner size={13} color={C.muted} />}
          {saving ? 'Creating…' : `✔ Create Route (${stops.length} stop${stops.length !== 1 ? 's' : ''})`}
        </button>
        <span style={{ fontSize:11, color:C.faint }}>
          Route + all stops saved in one API call.
        </span>
      </div>
    </div>
  );
}

/* ── StopForm: add / edit a single stop on an existing route ─ */
function StopForm({ initial, stations, onSave, onCancel, saving, title }) {
  const init = initial || {};
  const [f, setF] = useState({
    Stations:       typeof init.Stations==='object' ? (init.Stations?.ID||'') : (init.Stations||''),
    Station_Name:   init.Station_Name   || '',
    Station_Code:   init.Station_Code   || '',
    Sequence:       init.Sequence       ?? '',
    Arrival_Time:   init.Arrival_Time   || '',
    Departure_Time: init.Departure_Time || '',
    Halt_Minutes:   init.Halt_Minutes   ?? '',
    Distance_KM:    init.Distance_KM    ?? '',
    Day_Count:      init.Day_Count      ?? '1',
  });
  const set = (k,v) => setF(p=>({...p,[k]:v}));

  const pickStation = id => {
    const found = stations.find(s => getRecordId(s) === id);
    setF(p => ({
      ...p, Stations: id,
      Station_Name: found?.Station_Name || p.Station_Name,
      Station_Code: found?.Station_Code || p.Station_Code,
    }));
  };

  const submit = () => {
    if (!f.Station_Name.trim() && !f.Stations) return alert('Station Name or lookup is required');
    if (f.Sequence === '' || f.Sequence === null) return alert('Sequence number is required');
    onSave({
      Stations:       f.Stations       || undefined,
      Station_Name:   f.Station_Name.trim() || undefined,
      Station_Code:   f.Station_Code.trim().toUpperCase() || undefined,
      Sequence:       Number(f.Sequence),
      Arrival_Time:   f.Arrival_Time   || undefined,
      Departure_Time: f.Departure_Time || undefined,
      Halt_Minutes:   f.Halt_Minutes !== '' ? Number(f.Halt_Minutes) : undefined,
      Distance_KM:    f.Distance_KM  !== '' ? Number(f.Distance_KM) : undefined,
      Day_Count:      f.Day_Count    !== '' ? Number(f.Day_Count)   : 1,
    });
  };

  const lbS = { fontSize:10, fontWeight:700, color:C.muted, textTransform:'uppercase',
                letterSpacing:'0.07em', marginBottom:4, display:'block' };

  return (
    <div style={{ background:'rgba(59,130,246,0.04)', border:`1px solid rgba(59,130,246,0.18)`,
                  borderRadius:12, padding:18, marginBottom:12 }}>
      <div style={{ fontSize:11, fontWeight:700, color:C.blue, textTransform:'uppercase',
                    letterSpacing:'0.07em', marginBottom:14 }}>{title}</div>

      <div style={{ display:'grid', gridTemplateColumns:'72px 1fr 1fr 90px', gap:10, marginBottom:10 }}>
        <div>
          <span style={lbS}>Seq *</span>
          <input type="number" min={0} value={f.Sequence} placeholder="1"
            onChange={e=>set('Sequence',e.target.value)} style={inp} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <span style={lbS}>Station Lookup</span>
          <select value={f.Stations} onChange={e=>pickStation(e.target.value)}
            style={{...inp,cursor:'pointer'}} onFocus={onFocus} onBlur={onBlur}>
            <option value="">— from master stations —</option>
            {stations.map(s=>(
              <option key={getRecordId(s)} value={getRecordId(s)}>
                {s.Station_Code} – {s.Station_Name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span style={lbS}>Station Name *</span>
          <input value={f.Station_Name} placeholder="e.g. Chennai Central"
            onChange={e=>set('Station_Name',e.target.value)} style={inp} onFocus={onFocus} onBlur={onBlur} />
        </div>
        <div>
          <span style={lbS}>Code</span>
          <input value={f.Station_Code} placeholder="MAS" maxLength={8}
            onChange={e=>set('Station_Code',e.target.value.toUpperCase())}
            style={{...inp,fontFamily:MONO}} onFocus={onFocus} onBlur={onBlur} />
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 80px 100px 60px', gap:10, marginBottom:14 }}>
        <div><span style={lbS}>Arrival</span>
          <input type="time" value={f.Arrival_Time} onChange={e=>set('Arrival_Time',e.target.value)}
            style={inp} onFocus={onFocus} onBlur={onBlur} /></div>
        <div><span style={lbS}>Departure</span>
          <input type="time" value={f.Departure_Time} onChange={e=>set('Departure_Time',e.target.value)}
            style={inp} onFocus={onFocus} onBlur={onBlur} /></div>
        <div><span style={lbS}>Halt (m)</span>
          <input type="number" min={0} value={f.Halt_Minutes} placeholder="0"
            onChange={e=>set('Halt_Minutes',e.target.value)} style={inp} onFocus={onFocus} onBlur={onBlur} /></div>
        <div><span style={lbS}>Distance (km)</span>
          <input type="number" min={0} step="0.1" value={f.Distance_KM} placeholder="0"
            onChange={e=>set('Distance_KM',e.target.value)} style={inp} onFocus={onFocus} onBlur={onBlur} /></div>
        <div><span style={lbS}>Day</span>
          <input type="number" min={1} value={f.Day_Count} placeholder="1"
            onChange={e=>set('Day_Count',e.target.value)} style={inp} onFocus={onFocus} onBlur={onBlur} /></div>
      </div>

      <div style={{ display:'flex', gap:8 }}>
        <button onClick={submit} disabled={saving}
          style={{ padding:'8px 20px', borderRadius:8, border:'none',
                   background:saving?C.faint:C.blue, color:saving?C.muted:'#fff',
                   fontSize:12, fontWeight:700, fontFamily:FONT,
                   cursor:saving?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:6 }}>
          {saving && <Spinner size={12} color={C.muted}/>}
          {saving ? 'Saving…' : '✔ Save Stop'}
        </button>
        <button onClick={onCancel}
          style={{ padding:'8px 14px', borderRadius:8, border:`1px solid ${C.hi}`,
                   background:'transparent', color:C.muted,
                   fontSize:12, fontWeight:600, fontFamily:FONT, cursor:'pointer' }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── RouteTimeline ───────────────────────────────────────────── */
function RouteTimeline({ stops, connections, onEdit, onDelete, deleting }) {
  if (!stops.length) return null;
  const n = stops.length;
  return (
    <div style={{ position:'relative', paddingLeft:40 }}>
      <div style={{ position:'absolute', left:16, top:18, bottom:18, width:3,
                    background:`linear-gradient(to bottom,${C.blue},${C.amber},${C.green})`,
                    borderRadius:2 }} />
      {stops.map((stop, i) => {
        const type   = stopType(i, n);
        const dotCol = TYPE_CFG[type].color;
        const id     = gid(stop);
        const code   = (stop.Station_Code||'').trim().toUpperCase();
        const conns  = code ? (connections[code]?.trains||[]).filter(t=>t.train_id!==stop._train_id) : [];
        return (
          <div key={id||i} style={{ position:'relative', marginBottom: i<n-1 ? 6 : 0 }}>
            <div style={{ position:'absolute', left:-29, top:16, width:16, height:16, borderRadius:'50%',
                          background:dotCol, border:`2.5px solid ${C.surface}`,
                          boxShadow:`0 0 12px ${dotCol}99`, zIndex:2 }} />
            <div style={{ background:C.raised, border:`1px solid ${C.hi}`,
                          borderLeft:`3px solid ${dotCol}`, borderRadius:10, padding:'12px 16px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, flexWrap:'wrap' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
                    <span style={{ fontFamily:MONO, fontSize:11, fontWeight:800,
                                   background:`${dotCol}18`, color:dotCol,
                                   padding:'2px 9px', borderRadius:20, minWidth:30, textAlign:'center' }}>
                      {stop.Sequence}
                    </span>
                    <span style={{ fontSize:14, fontWeight:700, color:C.text }}>
                      {stop.Station_Name || lbl(stop.Stations) || '—'}
                    </span>
                    {stop.Station_Code && (
                      <span style={{ fontFamily:MONO, fontSize:11, color:C.cyan,
                                     background:'rgba(6,182,212,0.1)', padding:'2px 8px', borderRadius:6, fontWeight:700 }}>
                        {stop.Station_Code}
                      </span>
                    )}
                    <StopBadge type={type} />
                    {stop.Day_Count > 1 && <span style={{ fontSize:10, color:C.purple, fontWeight:600 }}>Day {stop.Day_Count}</span>}
                  </div>
                  <div style={{ display:'flex', gap:18, flexWrap:'wrap' }}>
                    {stop.Arrival_Time   && <span style={{ fontSize:11, fontFamily:MONO }}><span style={{color:C.faint}}>ARR </span><span style={{color:C.text}}>{stop.Arrival_Time}</span></span>}
                    {stop.Departure_Time && <span style={{ fontSize:11, fontFamily:MONO }}><span style={{color:C.faint}}>DEP </span><span style={{color:C.text}}>{stop.Departure_Time}</span></span>}
                    {stop.Halt_Minutes != null && stop.Halt_Minutes !== '' && <span style={{ fontSize:11, color:C.amber }}>⏱ {stop.Halt_Minutes}m</span>}
                    {stop.Distance_KM  != null && stop.Distance_KM  !== '' && <span style={{ fontSize:11, color:C.muted }}>📍 {stop.Distance_KM} km</span>}
                  </div>
                  {conns.length > 0 && (
                    <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:6 }}>
                      <span style={{ fontSize:10, color:C.muted, marginRight:2 }}>🔀 Connects:</span>
                      {conns.map((ct,ci) => (
                        <span key={ci} style={{ fontSize:10, fontWeight:700, padding:'2px 9px', borderRadius:20,
                                                background:'rgba(167,139,250,0.12)', color:C.purple,
                                                border:'1px solid rgba(167,139,250,0.2)' }}>
                          {ct.train_name} · #{ct.train_number}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                  <button onClick={()=>onEdit(stop)}
                    style={{ padding:'5px 11px', borderRadius:6, border:`1px solid ${C.hi}`,
                             background:'rgba(59,130,246,0.08)', color:'#60a5fa',
                             fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>✏ Edit</button>
                  <button onClick={()=>onDelete(stop)} disabled={deleting===id}
                    style={{ padding:'5px 9px', borderRadius:6, border:`1px solid ${C.faint}`,
                             background:'rgba(239,68,68,0.06)', color:deleting===id?C.muted:C.red,
                             fontSize:11, fontWeight:600, cursor:deleting===id?'not-allowed':'pointer',
                             fontFamily:FONT, display:'flex', alignItems:'center', gap:4 }}>
                    {deleting===id ? <Spinner size={10} color={C.muted}/> : '✕'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── ConnectionsView ─────────────────────────────────────────── */
function ConnectionsView({ connMap, loading }) {
  if (loading) return <div style={{padding:40,textAlign:'center'}}><Spinner size={32}/></div>;
  const stations = Object.values(connMap||{}).filter(s=>s.trains.length>=2);
  if (!stations.length) return (
    <div style={{padding:'48px 24px',textAlign:'center'}}>
      <div style={{fontSize:36,marginBottom:12}}>🔀</div>
      <div style={{fontSize:15,fontWeight:700,color:C.muted}}>No connections found</div>
      <div style={{fontSize:13,color:C.faint,marginTop:6}}>Add Station Code to each stop to enable connection detection.</div>
    </div>
  );
  stations.sort((a,b)=>b.trains.length-a.trains.length);
  return (
    <div style={{display:'flex',flexDirection:'column',gap:12}}>
      {stations.map(st=>(
        <div key={st.station_code} style={{background:C.raised,border:`1px solid ${C.hi}`,borderRadius:12,overflow:'hidden'}}>
          <div style={{padding:'10px 16px',background:'rgba(167,139,250,0.06)',borderBottom:`1px solid ${C.hi}`,display:'flex',alignItems:'center',gap:10}}>
            <span style={{fontFamily:MONO,fontSize:12,fontWeight:800,background:'rgba(167,139,250,0.15)',color:C.purple,padding:'3px 11px',borderRadius:20}}>{st.station_code}</span>
            <span style={{fontSize:13,fontWeight:700,color:C.text}}>{st.station_name||st.station_code}</span>
            <span style={{marginLeft:'auto',fontSize:11,color:C.muted}}>{st.trains.length} trains pass through</span>
          </div>
          <div style={{padding:'12px 16px',display:'flex',flexWrap:'wrap',gap:8}}>
            {st.trains.map((t,ti)=>(
              <div key={ti} style={{padding:'8px 14px',borderRadius:10,background:'rgba(59,130,246,0.07)',border:`1px solid rgba(59,130,246,0.18)`}}>
                <div style={{fontSize:12,fontWeight:700,color:'#60a5fa',marginBottom:3}}>{t.train_name}</div>
                <div style={{fontSize:10,color:C.muted,fontFamily:MONO,marginBottom:4}}>#{t.train_number}</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  <StopBadge type={t.stop_type}/>
                  {t.arrival   && <span style={{fontSize:10,color:C.muted,fontFamily:MONO}}>ARR {t.arrival}</span>}
                  {t.departure && <span style={{fontSize:10,color:C.muted,fontFamily:MONO}}>DEP {t.departure}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════════════ */
export default function TrainRoutesPage() {
  const { addToast } = useToast();

  const [selectedId,   setSelectedId]   = useState('');
  const [routeRecord,  setRouteRecord]  = useState(null);
  const [stops,        setStops]        = useState([]);
  const [connMap,      setConnMap]      = useState({});
  const [stopsLoading, setStopsLoading] = useState(false);
  const [connLoading,  setConnLoading]  = useState(false);
  const [editingStop,  setEditingStop]  = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [deleting,     setDeleting]     = useState(null);
  const [tab,          setTab]          = useState('route');
  const [trainSearch,  setTrainSearch]  = useState('');
  const [showCreate,   setShowCreate]   = useState(false);

  const fetchTrains   = useCallback(() => trainsApi.getAll(), []);
  const fetchStations = useCallback(() => stationsApi.getAll(), []);
  const { data: trainsData,   loading: trainsLoading } = useApi(fetchTrains);
  const { data: stationsData }                         = useApi(fetchStations);

  const allTrains     = extractRecords(trainsData);
  const allStations   = extractRecords(stationsData);
  const selectedTrain = allTrains.find(t => getRecordId(t) === selectedId);

  const filteredTrains = trainSearch.trim()
    ? allTrains.filter(t =>
        (t.Train_Name||'').toLowerCase().includes(trainSearch.toLowerCase()) ||
        (t.Train_Number||'').toString().includes(trainSearch))
    : allTrains;

  const loadRoute = useCallback(async (trainId) => {
    setStopsLoading(true); setEditingStop(null); setShowCreate(false);
    setRouteRecord(null); setStops([]);
    try {
      const res = await trainRoutesApi.getByTrain(trainId);
      const d   = res?.data || {};
      setRouteRecord(d.route_record || null);
      setStops((d.stops||[]).sort((a,b)=>Number(a.Sequence||0)-Number(b.Sequence||0)));
    } catch { addToast('Failed to load route','error'); }
    finally  { setStopsLoading(false); }
  }, []);

  const loadConnections = useCallback(async () => {
    setConnLoading(true);
    try {
      const res = await trainRoutesApi.allConnections();
      const d   = res?.data || {};
      setConnMap(d.all_stations || d.connection_stations || {});
    } catch {}
    finally { setConnLoading(false); }
  }, []);

  useEffect(() => {
    if (!selectedId) { setRouteRecord(null); setStops([]); setShowCreate(false); return; }
    loadRoute(selectedId);
  }, [selectedId]);

  useEffect(() => { if (tab==='connections') loadConnections(); }, [tab]);

  const reload = () => loadRoute(selectedId);

  const handleAddStop = async (formData) => {
    if (!routeRecord) return addToast('Create route record first','error');
    setSaving(true);
    try {
      const res = await trainRoutesApi.addStop(gid(routeRecord), formData);
      if (res?.success===false) throw new Error(res?.error||res?.message||'Add stop failed');
      addToast('Stop added ✓','success'); setEditingStop(null); await reload();
    } catch(e) { addToast(e.message||'Add stop failed','error'); }
    finally    { setSaving(false); }
  };

  const handleUpdateStop = async (stopId, formData) => {
    setSaving(true);
    try {
      const res = await trainRoutesApi.updateStop(gid(routeRecord), stopId, formData);
      if (res?.success===false) throw new Error(res?.error||res?.message||'Update failed');
      addToast('Stop updated ✓','success'); setEditingStop(null); await reload();
    } catch(e) { addToast(e.message||'Update failed','error'); }
    finally    { setSaving(false); }
  };

  const handleDeleteStop = async (stop) => {
    const id = gid(stop);
    if (!id) return addToast('Stop ID missing','error');
    if (!window.confirm(`Delete "${stop.Station_Name||stop.Station_Code||'Seq '+stop.Sequence}" from route?`)) return;
    setDeleting(id);
    try {
      const res = await trainRoutesApi.deleteStop(gid(routeRecord), id);
      if (res?.success===false) throw new Error(res?.error||res?.message||'Delete failed');
      addToast('Stop deleted ✓','success');
      setStops(prev => prev.filter(s => gid(s)!==id));
    } catch(e) { addToast(e.message||'Delete failed','error'); }
    finally    { setDeleting(null); }
  };

  const tabBtn = active => ({
    padding:'7px 18px', borderRadius:8, border:'none',
    background: active ? C.blue : 'transparent',
    color: active ? '#fff' : C.muted,
    fontSize:12, fontWeight:700, fontFamily:FONT, cursor:'pointer', transition:'all 0.15s',
  });

  const localConn = {};
  stops.forEach(s => {
    const code = (s.Station_Code||'').toUpperCase();
    if (code && connMap[code]) localConn[code] = connMap[code];
  });

  return (
    <div style={{ fontFamily:FONT, display:'flex', gap:18, height:'calc(100vh - 120px)', overflow:'hidden' }}>

      {/* ════ LEFT: Train List ════════════════════════════════ */}
      <div style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', gap:10 }}>
        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:C.muted, textTransform:'uppercase',
                        letterSpacing:'0.07em', marginBottom:10 }}>🚂 All Trains</div>
          <input value={trainSearch} onChange={e=>setTrainSearch(e.target.value)}
            placeholder="Search name or number…" style={inp} onFocus={onFocus} onBlur={onBlur} />
        </div>

        <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12,
                      flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <div style={{ flex:1, overflowY:'auto', padding:8 }}>
            {trainsLoading
              ? <div style={{padding:24,textAlign:'center'}}><Spinner size={24}/></div>
              : filteredTrains.length===0
              ? <div style={{padding:20,textAlign:'center',color:C.muted,fontSize:12}}>No trains</div>
              : filteredTrains.map(t => {
                  const id = getRecordId(t);
                  const active = id===selectedId;
                  return (
                    <button key={id}
                      onClick={()=>{ setSelectedId(id); setTab('route'); setShowCreate(false); }}
                      style={{ width:'100%', textAlign:'left', padding:'10px 12px', borderRadius:9,
                               border:`1px solid ${active?C.blue:C.border}`,
                               background: active?'rgba(59,130,246,0.1)':'transparent',
                               cursor:'pointer', marginBottom:4, transition:'all 0.15s' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:active?'#60a5fa':C.text }}>{t.Train_Name}</div>
                      <div style={{ fontSize:10, fontFamily:MONO, color:C.muted, marginTop:1 }}>#{t.Train_Number}</div>
                      <div style={{ fontSize:10, color:C.faint, marginTop:2 }}>{lbl(t.From_Station)} → {lbl(t.To_Station)}</div>
                    </button>
                  );
                })
            }
          </div>
          <div style={{ padding:'6px 12px', borderTop:`1px solid ${C.border}`, fontSize:10, color:C.faint }}>
            {filteredTrains.length} train{filteredTrains.length!==1?'s':''}
          </div>
        </div>
      </div>

      {/* ════ RIGHT ═══════════════════════════════════════════ */}
      <div style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', gap:12, overflow:'hidden' }}>

        {!selectedId ? (
          <div style={{ flex:1, background:C.surface, border:`1px solid ${C.border}`, borderRadius:16,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        flexDirection:'column', gap:12, padding:48 }}>
            <div style={{fontSize:48}}>🗺️</div>
            <div style={{fontSize:17,fontWeight:700,color:C.muted}}>Select a Train</div>
            <div style={{fontSize:13,color:C.faint,textAlign:'center',maxWidth:300}}>
              Choose a train from the left panel to view and manage its route stops and connections.
            </div>
          </div>
        ) : (
          <>
            {/* ── Header ──────────────────────────────────── */}
            <div style={{ background:C.surface, border:`1px solid ${C.border}`, borderRadius:12,
                          padding:'14px 18px', display:'flex', justifyContent:'space-between',
                          alignItems:'center', gap:12, flexWrap:'wrap', flexShrink:0 }}>
              <div>
                <div style={{fontSize:16,fontWeight:800,color:C.text}}>{selectedTrain?.Train_Name}</div>
                <div style={{fontSize:11,color:C.muted,fontFamily:MONO,marginTop:2}}>
                  #{selectedTrain?.Train_Number} · {lbl(selectedTrain?.From_Station)} → {lbl(selectedTrain?.To_Station)}
                </div>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
                <span style={{padding:'4px 14px',borderRadius:20,fontSize:11,fontWeight:700,
                               background:'rgba(245,158,11,0.12)',color:C.amber}}>
                  {stops.length} stop{stops.length!==1?'s':''}
                </span>

                {routeRecord
                  ? <span style={{padding:'4px 12px',borderRadius:20,fontSize:11,fontWeight:700,
                                   background:'rgba(34,197,94,0.1)',color:C.green}}>✓ Route exists</span>
                  : !showCreate && (
                    <button onClick={()=>setShowCreate(true)}
                      style={{padding:'6px 16px',borderRadius:20,border:`1px solid ${C.amber}`,
                               background:'rgba(245,158,11,0.1)',color:C.amber,
                               fontSize:11,fontWeight:700,fontFamily:FONT,cursor:'pointer'}}>
                      ＋ Set Up Route
                    </button>
                  )
                }

                <div style={{display:'flex',background:C.bg,border:`1px solid ${C.border}`,borderRadius:9,padding:3,gap:3}}>
                  <button style={tabBtn(tab==='route')}       onClick={()=>setTab('route')}>Route</button>
                  <button style={tabBtn(tab==='connections')} onClick={()=>setTab('connections')}>Connections</button>
                </div>

                {tab==='route' && routeRecord && !showCreate && (
                  <button onClick={()=>setEditingStop('new')} disabled={editingStop==='new'}
                    style={{padding:'8px 16px',borderRadius:8,border:'none',
                             background:editingStop==='new'?C.faint:C.blue,
                             color:editingStop==='new'?C.muted:'#fff',
                             fontSize:12,fontWeight:700,fontFamily:FONT,
                             cursor:editingStop==='new'?'not-allowed':'pointer'}}>
                    ＋ Add Stop
                  </button>
                )}
              </div>
            </div>

            {/* ── Content ─────────────────────────────────── */}
            <div style={{flex:1,background:C.surface,border:`1px solid ${C.border}`,
                          borderRadius:12,overflow:'hidden',display:'flex',flexDirection:'column'}}>
              <div style={{flex:1,overflowY:'auto',padding:20}}>

                {tab==='route' ? (
                  stopsLoading
                    ? <div style={{textAlign:'center',padding:60}}><Spinner size={36}/></div>
                    : <>
                        {/* Create wizard — shown inline, no DB write yet */}
                        {showCreate && !routeRecord && (
                          <CreateRoutePanel
                            train={selectedTrain}
                            stations={allStations}
                            onCreated={()=>{ setShowCreate(false); reload(); }}
                            onCancel={()=>setShowCreate(false)}
                          />
                        )}

                        {/* No route, wizard closed */}
                        {!routeRecord && !showCreate && (
                          <div style={{textAlign:'center',padding:'52px 24px'}}>
                            <div style={{fontSize:44,marginBottom:14}}>🛤️</div>
                            <div style={{fontSize:15,fontWeight:800,color:C.muted,marginBottom:8}}>
                              No route set up for this train
                            </div>
                            <div style={{fontSize:12,color:C.faint,maxWidth:380,margin:'0 auto 20px',lineHeight:1.7}}>
                              Click <strong style={{color:C.amber}}>＋ Set Up Route</strong> to add all stops
                              at once. The route + stops are saved together in one API call —
                              no empty records in your database.
                            </div>
                            <button onClick={()=>setShowCreate(true)}
                              style={{padding:'10px 28px',borderRadius:10,border:`1px solid ${C.amber}`,
                                       background:'rgba(245,158,11,0.1)',color:C.amber,
                                       fontSize:13,fontWeight:800,fontFamily:FONT,cursor:'pointer'}}>
                              ＋ Set Up Route Stops
                            </button>
                          </div>
                        )}

                        {editingStop==='new' && (
                          <StopForm initial={null} stations={allStations} title="＋ New Stop"
                            onSave={handleAddStop} onCancel={()=>setEditingStop(null)} saving={saving} />
                        )}

                        {editingStop && editingStop!=='new' && (
                          <StopForm initial={editingStop} stations={allStations}
                            title={`✏ Editing: ${editingStop.Station_Name||'Stop'}`}
                            onSave={fd=>handleUpdateStop(gid(editingStop),fd)}
                            onCancel={()=>setEditingStop(null)} saving={saving} />
                        )}

                        {routeRecord && stops.length===0 && !editingStop && (
                          <div style={{textAlign:'center',padding:'40px 24px'}}>
                            <div style={{fontSize:36,marginBottom:10}}>📍</div>
                            <div style={{fontSize:14,fontWeight:700,color:C.muted}}>No stops yet</div>
                            <div style={{fontSize:12,color:C.faint,marginTop:6}}>
                              Click <strong style={{color:'#60a5fa'}}>＋ Add Stop</strong> above to add the first stop.
                            </div>
                          </div>
                        )}

                        {stops.length>0 && (
                          <>
                            <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
                              {[['Origin',C.blue],['Intermediate',C.amber],['Destination',C.green]].map(([l,c])=>(
                                <div key={l} style={{display:'flex',alignItems:'center',gap:6}}>
                                  <div style={{width:8,height:8,borderRadius:'50%',background:c,boxShadow:`0 0 6px ${c}88`}}/>
                                  <span style={{fontSize:11,color:C.muted}}>{l}</span>
                                </div>
                              ))}
                            </div>
                            <RouteTimeline stops={stops} connections={localConn}
                              onEdit={stop=>setEditingStop(stop)}
                              onDelete={handleDeleteStop} deleting={deleting} />
                          </>
                        )}
                      </>
                ) : (
                  <>
                    <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>
                      Stations where <strong style={{color:C.text}}>2 or more trains</strong> stop —
                      enabling passenger connections and transfers.
                      <span style={{color:C.faint}}> (Requires Station Code on each stop.)</span>
                    </div>
                    <ConnectionsView connMap={connMap} loading={connLoading}/>
                  </>
                )}
              </div>
            </div>

            <div style={{fontSize:11,color:C.faint,flexShrink:0}}>
              💡 <strong style={{color:C.muted}}>Station Code</strong> required for connection detection.
              Seq 1 = Origin · Last = Destination · Middle = Intermediate.
            </div>
          </>
        )}
      </div>
    </div>
  );
}