/**
 * TrainsPage.jsx — Full CRUD for Trains
 * Self-contained table with Edit / Delete inline — no CRUDTable dependency.
 * Fixes: Edit and Delete buttons now always visible in the table.
 */
import { useState, useCallback } from 'react';
import {
  trainsApi, stationsApi,
  extractRecords, getRecordId,
  parseZohoDate, toZohoDateTime, extractTime,
} from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal, Spinner } from '../components/UI';
import { Field, Dropdown, FormRow, FormDivider, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Style tokens ──────────────────────────────────────────────────────────────
const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

// ─── Constants ─────────────────────────────────────────────────────────────────
const TRAIN_TYPES = [
  'Superfast', 'Express', 'Mail', 'Passenger',
  'Rajdhani', 'Shatabdi', 'Duronto', 'Vande Bharat',
  'Tejas', 'Garib Rath', 'Other',
];
const RUN_DAYS_OPTS = [
  { value: 'Daily', label: 'Daily' },
  { value: 'Mon', label: 'Monday' },
  { value: 'Tue', label: 'Tuesday' },
  { value: 'Wed', label: 'Wednesday' },
  { value: 'Thu', label: 'Thursday' },
  { value: 'Fri', label: 'Friday' },
  { value: 'Sat', label: 'Saturday' },
  { value: 'Sun', label: 'Sunday' },
  { value: 'Mon,Wed,Fri', label: 'Mon / Wed / Fri' },
  { value: 'Tue,Thu,Sat', label: 'Tue / Thu / Sat' },
  { value: 'Mon,Tue,Wed,Thu,Fri', label: 'Weekdays' },
  { value: 'Sat,Sun', label: 'Weekends' },
];

const BLANK = {
  Train_Number: '', Train_Name: '', Train_Type: 'Express',
  From_Station: '', To_Station: '',
  Departure_Time: '', Arrival_Time: '',
  Duration: '', Distance: '', Run_Days: 'Daily', Is_Active: true, Pantry_Car_Available: false,
  Fare_SL: '', Fare_3A: '', Fare_2A: '', Fare_1A: '',
  Fare_CC: '', Fare_EC: '', Fare_2S: '',
  Total_Seats_SL: '', Total_Seats_3A: '', Total_Seats_2A: '',
  Total_Seats_1A: '', Total_Seats_CC: '',
  Running_Status: 'On Time', Delay_Minutes: '0',
};

// Array ↔ String helpers for Zoho multi-select
function parseRunDays(val) {
  if (!val) return 'Daily';
  if (Array.isArray(val)) {
    if (val.length === 7) return 'Daily';
    if (val.length === 5 && !val.includes('Sat') && !val.includes('Sun')) return 'Mon,Tue,Wed,Thu,Fri';
    if (val.length === 2 && val.includes('Sat') && val.includes('Sun')) return 'Sat,Sun';
    return val.join(',');
  }
  return String(val);
}

function formatRunDays(str) {
  if (!str || str === 'Daily') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  if (str === 'Mon,Tue,Wed,Thu,Fri') return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  if (str === 'Sat,Sun') return ['Sat', 'Sun'];
  return str.split(',').map(s => s.trim());
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function getStation(field) {
  if (!field) return '—';
  if (typeof field === 'object') return (field.display_value || field.ID || '—').trim();
  return String(field).trim();
}

function rowToForm(row) {
  return {
    Train_Number: row.Train_Number ?? '',
    Train_Name: row.Train_Name ?? '',
    Train_Type: row.Train_Type ?? 'Express',
    From_Station: typeof row.From_Station === 'object' ? (row.From_Station?.ID ?? '') : (row.From_Station ?? ''),
    To_Station: typeof row.To_Station === 'object' ? (row.To_Station?.ID ?? '') : (row.To_Station ?? ''),
    Departure_Time: parseZohoDate(row.Departure_Time),
    Arrival_Time: parseZohoDate(row.Arrival_Time),
    Duration: row.Duration ?? '',
    Distance: row.Distance ?? '',
    Run_Days: parseRunDays(row.Run_Days),
    Is_Active: row.Is_Active === true || row.Is_Active === 'true',
    Pantry_Car_Available: row.Pantry_Car_Available === true || row.Pantry_Car_Available === 'true',
    Fare_SL: row.Fare_SL ?? '',
    Fare_3A: row.Fare_3A ?? '',
    Fare_2A: row.Fare_2A ?? '',
    Fare_1A: row.Fare_1A ?? '',
    Fare_CC: row.Fare_CC ?? '',
    Fare_EC: row.Fare_EC ?? '',
    Fare_2S: row.Fare_2S ?? '',
    Total_Seats_SL: row.Total_Seats_SL ?? '',
    Total_Seats_3A: row.Total_Seats_3A ?? '',
    Total_Seats_2A: row.Total_Seats_2A ?? '',
    Total_Seats_1A: row.Total_Seats_1A ?? '',
    Total_Seats_CC: row.Total_Seats_CC ?? '',
    Running_Status: row.Running_Status || 'On Time',
    Delay_Minutes: row.Delay_Minutes || '0',
  };
}

// ─── Inline Trains Table ───────────────────────────────────────────────────────
function TrainsTable({ rows, loading, onEdit, onDelete, onView, deleting }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size={28} />
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 24px', color: '#6b7280', fontFamily: FONT }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🚂</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>No trains found</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Add a train using the button above.</div>
      </div>
    );
  }

  const thS = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
    fontFamily: FONT, borderBottom: '1px solid var(--border)',
    background: 'var(--bg-inset)', textAlign: 'left',
  };
  const tdS = {
    padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)',
    fontFamily: FONT, borderBottom: '1px solid #0d1017', verticalAlign: 'middle',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['#', 'Number', 'Name', 'Type', 'From', 'To', 'Dep', 'Arr', 'SL Fare', 'Seats SL', 'Status', 'Actions'].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const id = getRecordId(row);
            const active = row.Is_Active === true || row.Is_Active === 'true';
            const isDel = deleting === id;
            return (
              <tr key={id || idx}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <td style={{ ...tdS, color: '#4b5563', width: 36 }}>{idx + 1}</td>
                <td style={{ ...tdS, fontFamily: MONO, color: 'var(--accent-blue)', fontWeight: 600 }}>
                  {row.Train_Number || '—'}
                </td>
                <td style={{ ...tdS, fontWeight: 600, color: 'var(--text-primary)', maxWidth: 180 }}>
                  {row.Train_Name || '—'}
                </td>
                <td style={{ ...tdS }}>
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 20,
                    background: 'rgba(139,92,246,0.12)', color: '#a78bfa', fontWeight: 600, fontFamily: FONT
                  }}>
                    {row.Train_Type || '—'}
                  </span>
                </td>
                <td style={{ ...tdS, fontFamily: MONO, fontSize: 11 }}>{getStation(row.From_Station)}</td>
                <td style={{ ...tdS, fontFamily: MONO, fontSize: 11 }}>{getStation(row.To_Station)}</td>
                <td style={{ ...tdS, fontFamily: MONO }}>{extractTime(row.Departure_Time)}</td>
                <td style={{ ...tdS, fontFamily: MONO }}>{extractTime(row.Arrival_Time)}</td>
                <td style={{ ...tdS, color: '#22c55e', fontWeight: 600 }}>
                  {row.Fare_SL ? `₹${row.Fare_SL}` : '—'}
                </td>
                <td style={{ ...tdS }}>{row.Total_Seats_SL || '—'}</td>
                <td style={{ ...tdS }}>
                  <span style={{
                    fontSize: 10, padding: '3px 8px', borderRadius: 20, fontWeight: 700, fontFamily: FONT,
                    background: active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                    color: active ? '#22c55e' : '#f87171',
                    border: `1px solid ${active ? '#14532d' : '#7f1d1d'}`,
                  }}>
                    {active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td style={{ ...tdS, whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* ── VIEW BUTTON ── */}
                    <button
                      onClick={() => onView(row)}
                      title="View train details"
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid #1e2433',
                        background: 'rgba(167,139,250,0.08)', color: '#c084fc',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.18)'; e.currentTarget.style.borderColor = '#a855f7'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; e.currentTarget.style.borderColor = '#1e2433'; }}
                    >
                      👁 View
                    </button>
                    {/* ── EDIT BUTTON ── */}
                    <button
                      onClick={() => onEdit(row)}
                      title="Edit train"
                      style={{
                        padding: '5px 12px', borderRadius: 6, border: '1px solid #1e2433',
                        background: 'rgba(59,130,246,0.08)', color: '#60a5fa',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.08)'; e.currentTarget.style.borderColor = '#1e2433'; }}
                    >
                      ✏ Edit
                    </button>
                    {/* ── DELETE BUTTON ── */}
                    <button
                      onClick={() => onDelete(row)}
                      disabled={isDel}
                      title="Delete train"
                      style={{
                        padding: '5px 10px', borderRadius: 6, border: '1px solid #374151',
                        background: 'rgba(239,68,68,0.06)', color: isDel ? '#6b7280' : '#f87171',
                        fontSize: 11, fontWeight: 600, cursor: isDel ? 'not-allowed' : 'pointer', fontFamily: FONT,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { if (!isDel) { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = '#ef4444'; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = '#374151'; }}
                    >
                      {isDel ? '…' : '✕ Del'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main TrainsPage ───────────────────────────────────────────────────────────
export default function TrainsPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'view' | 'delete'
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null); // record ID being deleted
  const [apiErr, setApiErr] = useState(null);

  // ── Load trains ──
  const fetchFn = useCallback(() => trainsApi.getAll(), []);
  const { data, loading, refetch } = useApi(fetchFn);
  const rows = extractRecords(data);

  // ── Load stations for dropdowns ──
  const fetchSt = useCallback(() => stationsApi.getAll(), []);
  const { data: stData } = useApi(fetchSt);
  const stations = extractRecords(stData);
  const stationOptions = stations.map(s => ({
    value: s.ID,
    label: `${s.Station_Code} – ${s.Station_Name}`,
  }));

  // ── Filter ──
  const filtered = rows.filter(r =>
    [r.Train_Number, r.Train_Name, r.Train_Type,
    getStation(r.From_Station), getStation(r.To_Station),
    ].some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate(f) {
    const e = {};
    if (!f.Train_Number.trim()) e.Train_Number = 'Required';
    if (!f.Train_Name.trim()) e.Train_Name = 'Required';
    if (!f.From_Station) e.From_Station = 'Required';
    if (!f.To_Station) e.To_Station = 'Required';
    if (f.From_Station && f.To_Station && f.From_Station === f.To_Station)
      e.To_Station = 'Cannot be same as From Station';
    return e;
  }

  const openCreate = () => { setForm(BLANK); setErrors({}); setEditRow(null); setApiErr(null); setModal('create'); };
  const openEdit = row => { setForm(rowToForm(row)); setErrors({}); setEditRow(row); setApiErr(null); setModal('edit'); };
  const openView = row => { setEditRow(row); setModal('view'); };
  const openDelete = row => { setEditRow(row); setModal('delete'); };

  const handleSave = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiErr(null);
    try {
      const payload = {
        Train_Number: form.Train_Number.trim(),
        Train_Name: form.Train_Name.trim(),
        Train_Type: form.Train_Type,
        From_Station: form.From_Station,
        To_Station: form.To_Station,
        Departure_Time: toZohoDateTime(form.Departure_Time),
        Arrival_Time: toZohoDateTime(form.Arrival_Time),
        Duration: form.Duration || null,
        Distance: form.Distance || null,
        Run_Days: formatRunDays(form.Run_Days),
        Is_Active: form.Is_Active ? 'true' : 'false',
        Pantry_Car_Available: form.Pantry_Car_Available ? 'true' : 'false',
        Fare_SL: form.Fare_SL || 0,
        Fare_3A: form.Fare_3A || 0,
        Fare_2A: form.Fare_2A || 0,
        Fare_1A: form.Fare_1A || 0,
        Fare_CC: form.Fare_CC || 0,
        Fare_EC: form.Fare_EC || 0,
        Fare_2S: form.Fare_2S || 0,
        Total_Seats_SL: form.Total_Seats_SL || 0,
        Total_Seats_3A: form.Total_Seats_3A || 0,
        Total_Seats_2A: form.Total_Seats_2A || 0,
        Total_Seats_1A: form.Total_Seats_1A || 0,
        Total_Seats_CC: form.Total_Seats_CC || 0,
        Running_Status: form.Running_Status || 'On Time',
        Delay_Minutes: form.Delay_Minutes || 0,
      };

      // Set initial available seats = total seats on creation
      if (modal === 'create') {
        payload.Available_Seats_SL = payload.Total_Seats_SL;
        payload.Available_Seats_3A = payload.Total_Seats_3A;
        payload.Available_Seats_2A = payload.Total_Seats_2A;
        payload.Available_Seats_1A = payload.Total_Seats_1A;
        payload.Available_Seats_CC = payload.Total_Seats_CC;
      }

      const res = modal === 'create'
        ? await trainsApi.create(payload)
        : await trainsApi.update(getRecordId(editRow), payload);

      if (res?.success === false) { setApiErr(res); }
      else {
        addToast(modal === 'create' ? 'Train created ✓' : 'Train updated ✓', 'success');
        setModal(null);
        refetch();
      }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const confirmDelete = async () => {
    if (!editRow) return;
    const id = getRecordId(editRow);
    setDeleting(id);
    setModal(null);
    try {
      const res = await trainsApi.delete(id);
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Train deleted ✓', 'success');
      refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
    finally { setDeleting(null); }
  };

  // ── Active count ──
  const activeCount = rows.filter(r => r.Is_Active === true || r.Is_Active === 'true').length;

  return (
    <div>
      <PageHeader icon="train" iconAccent="var(--accent-blue)"
        title="Trains"
        subtitle={`${rows.length} trains · ${activeCount} active`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-blue)" onClick={openCreate}>Add Train</Button>
      </PageHeader>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Trains', value: rows.length, color: '#3b82f6' },
          { label: 'Active', value: activeCount, color: '#22c55e' },
          { label: 'Inactive', value: rows.length - activeCount, color: '#f87171' },
          { label: 'Showing', value: filtered.length, color: '#a78bfa' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: MONO }}>{s.value}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontFamily: FONT }}>{s.label}</div>
          </div>
        ))}
      </div>

      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input icon="search" placeholder="Search by name, number, type, station…"
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360, flex: '1 1 220px' }} />
          <span style={{ fontSize: 12, color: '#6b7280', fontFamily: FONT, flexShrink: 0 }}>
            {filtered.length} of {rows.length} trains
          </span>
        </div>

        <TrainsTable
          rows={filtered}
          loading={loading}
          onEdit={openEdit}
          onDelete={openDelete}
          onView={openView}
          deleting={deleting}
        />

        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FONT }}>
            Showing {filtered.length} of {rows.length} trains
          </span>
          <span style={{ fontSize: 11, color: '#4b5563', fontFamily: FONT }}>
            Click <strong style={{ color: '#60a5fa' }}>✏ Edit</strong> or <strong style={{ color: '#f87171' }}>✕ Del</strong> on any row
          </span>
        </div>
      </Card>

      {/* ── Create / Edit Modal ── */}
      {modal && (
        <Modal title={modal === 'create' ? '➕ Add New Train' : `✏ Edit: ${editRow?.Train_Name || 'Train'}`}
          onClose={() => setModal(null)} width={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Basic */}
            <FormRow cols={2}>
              <Field label="Train Number" name="Train_Number" value={form.Train_Number}
                onChange={handleChange} required placeholder="e.g. 12678"
                error={errors.Train_Number} mono />
              <Dropdown label="Train Type" name="Train_Type" value={form.Train_Type}
                onChange={handleChange} options={TRAIN_TYPES} placeholder={false} />
            </FormRow>
            <Field label="Train Name *" name="Train_Name" value={form.Train_Name}
              onChange={handleChange} required placeholder="e.g. Chennai Rajdhani Express"
              error={errors.Train_Name} />

            {/* Stations */}
            <FormDivider label="Route" />
            <FormRow cols={2}>
              <Dropdown label="From Station *" name="From_Station" value={form.From_Station}
                onChange={handleChange} required options={stationOptions}
                placeholder="Select departure station" error={errors.From_Station} />
              <Dropdown label="To Station *" name="To_Station" value={form.To_Station}
                onChange={handleChange} required options={stationOptions}
                placeholder="Select arrival station" error={errors.To_Station} />
            </FormRow>

            {/* Times */}
            <FormRow cols={2}>
              <Field label="Departure Date & Time" name="Departure_Time" value={form.Departure_Time}
                onChange={handleChange} type="datetime-local" />
              <Field label="Arrival Date & Time" name="Arrival_Time" value={form.Arrival_Time}
                onChange={handleChange} type="datetime-local" />
            </FormRow>

            {/* Operational */}
            <FormRow cols={3}>
              <Field label="Duration (hh:mm)" name="Duration" value={form.Duration}
                onChange={handleChange} placeholder="e.g. 06:30" />
              <Field label="Distance (km)" name="Distance" value={form.Distance}
                onChange={handleChange} type="number" placeholder="Optional" />
              <Dropdown label="Run Days" name="Run_Days" value={form.Run_Days}
                onChange={handleChange} options={RUN_DAYS_OPTS} placeholder={false} />
            </FormRow>

            {/* Running Status */}
            <FormRow cols={2}>
              <Dropdown label="Running Status" name="Running_Status" value={form.Running_Status}
                onChange={handleChange} options={[{ value: 'On Time', label: 'On Time' }, { value: 'Delayed', label: 'Delayed' }, { value: 'Cancelled', label: 'Cancelled' }]} placeholder={false} />
              <Field label="Delay (Minutes)" name="Delay_Minutes" value={form.Delay_Minutes}
                onChange={handleChange} type="number" placeholder="e.g. 15" />
            </FormRow>

            {/* Active toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '12px 16px', background: 'var(--bg-inset)', borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="train_is_active"
                  checked={form.Is_Active}
                  onChange={e => setForm(f => ({ ...f, Is_Active: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)', cursor: 'pointer' }} />
                <label htmlFor="train_is_active" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}>
                  Active
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" id="train_pantry"
                  checked={form.Pantry_Car_Available}
                  onChange={e => setForm(f => ({ ...f, Pantry_Car_Available: e.target.checked }))}
                  style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)', cursor: 'pointer' }} />
                <label htmlFor="train_pantry" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontFamily: FONT, fontWeight: 600 }}>
                  Pantry Car Available
                </label>
              </div>
            </div>

            {/* Fares */}
            <FormDivider label="Fares (₹ per passenger)" />
            <FormRow cols={4}>
              <Field label="SL Fare" name="Fare_SL" value={form.Fare_SL} onChange={handleChange} type="number" placeholder="0" />
              <Field label="3A Fare" name="Fare_3A" value={form.Fare_3A} onChange={handleChange} type="number" placeholder="0" />
              <Field label="2A Fare" name="Fare_2A" value={form.Fare_2A} onChange={handleChange} type="number" placeholder="0" />
              <Field label="1A Fare" name="Fare_1A" value={form.Fare_1A} onChange={handleChange} type="number" placeholder="0" />
            </FormRow>
            <FormRow cols={3}>
              <Field label="CC Fare" name="Fare_CC" value={form.Fare_CC} onChange={handleChange} type="number" placeholder="0" />
              <Field label="EC Fare" name="Fare_EC" value={form.Fare_EC} onChange={handleChange} type="number" placeholder="0" />
              <Field label="2S Fare" name="Fare_2S" value={form.Fare_2S} onChange={handleChange} type="number" placeholder="0" />
            </FormRow>

            {/* Seats */}
            <FormDivider label="Total Seats per Class" />
            <FormRow cols={5}>
              <Field label="SL" name="Total_Seats_SL" value={form.Total_Seats_SL} onChange={handleChange} type="number" placeholder="0" />
              <Field label="3A" name="Total_Seats_3A" value={form.Total_Seats_3A} onChange={handleChange} type="number" placeholder="0" />
              <Field label="2A" name="Total_Seats_2A" value={form.Total_Seats_2A} onChange={handleChange} type="number" placeholder="0" />
              <Field label="1A" name="Total_Seats_1A" value={form.Total_Seats_1A} onChange={handleChange} type="number" placeholder="0" />
              <Field label="CC" name="Total_Seats_CC" value={form.Total_Seats_CC} onChange={handleChange} type="number" placeholder="0" />
            </FormRow>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create Train' : 'Save Changes'}
              accent="var(--accent-blue)"
            />
          </div>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title={`👁 Train Details: ${editRow.Train_Number} - ${editRow.Train_Name}`} onClose={() => setModal(null)} width={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: FONT, color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Train Number:</strong> {editRow.Train_Number}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Train Name:</strong> {editRow.Train_Name}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Type:</strong> {editRow.Train_Type}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {editRow.Is_Active === 'true' || editRow.Is_Active === true ? 'Active' : 'Inactive'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>From Station:</strong> {getStation(editRow.From_Station)}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>To Station:</strong> {getStation(editRow.To_Station)}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Departure:</strong> {extractTime(editRow.Departure_Time)}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Arrival:</strong> {extractTime(editRow.Arrival_Time)}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Duration:</strong> {editRow.Duration || 'N/A'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Distance:</strong> {editRow.Distance || 'N/A'} km</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Run Days:</strong> {Array.isArray(editRow.Run_Days) ? editRow.Run_Days.join(', ') : editRow.Run_Days}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Running Status:</strong> {editRow.Running_Status}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Pantry Car:</strong> {editRow.Pantry_Car_Available === 'true' || editRow.Pantry_Car_Available === true ? 'Yes' : 'No'}</div>
            </div>

            <h4 style={{ margin: '10px 0 0', color: 'var(--text-primary)' }}>Fares (₹)</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, background: 'var(--bg-inset)', padding: 12, borderRadius: 8 }}>
              <div><strong>1A:</strong> {editRow.Fare_1A || '—'}</div>
              <div><strong>2A:</strong> {editRow.Fare_2A || '—'}</div>
              <div><strong>3A:</strong> {editRow.Fare_3A || '—'}</div>
              <div><strong>SL:</strong> {editRow.Fare_SL || '—'}</div>
              <div><strong>CC:</strong> {editRow.Fare_CC || '—'}</div>
              <div><strong>EC:</strong> {editRow.Fare_EC || '—'}</div>
              <div><strong>2S:</strong> {editRow.Fare_2S || '—'}</div>
            </div>

            <h4 style={{ margin: '10px 0 0', color: 'var(--text-primary)' }}>Seat Capacities</h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, background: 'var(--bg-inset)', padding: 12, borderRadius: 8 }}>
              <div><strong>1A:</strong> {editRow.Total_Seats_1A || '—'}</div>
              <div><strong>2A:</strong> {editRow.Total_Seats_2A || '—'}</div>
              <div><strong>3A:</strong> {editRow.Total_Seats_3A || '—'}</div>
              <div><strong>SL:</strong> {editRow.Total_Seats_SL || '—'}</div>
              <div><strong>CC:</strong> {editRow.Total_Seats_CC || '—'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Delete Modal ── */}
      {modal === 'delete' && editRow && (
        <Modal title="⚠️ Confirm Deletion" onClose={() => setModal(null)} width={400}>
          <div style={{ fontFamily: FONT, color: 'var(--text-secondary)', fontSize: 14 }}>
            <p>Are you sure you want to delete the train <strong style={{ color: 'var(--text-primary)' }}>{editRow.Train_Name || editRow.Train_Number}</strong>?</p>
            <p style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
              <Button variant="secondary" onClick={() => setModal(null)}>Cancel</Button>
              <Button style={{ background: '#dc2626', color: '#fff', border: 'none' }} onClick={confirmDelete}>Delete Train</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}