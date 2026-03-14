import { useState, useCallback } from 'react';
import { faresApi, trainsApi, stationsApi, extractRecords, getRecordId, getLookupLabel } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal, Select } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormDivider, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Exact Zoho API field names for Fares ─────────────────────────────────────
// Train: { ID, display_value } (lookup)
// From_Station: { ID, display_value } (lookup)
// To_Station: { ID, display_value } (lookup)
// Class: "SL" | "3A" | "2A" | "1A" | "CC" | "EC"
// Base_Fare: "450.00"
// Dynamic_Fare: "550.00"
// Concession_Type: "General" | "Senior" | "Student" | "Disabled" | "Armed Forces"
// Concession_Percent: "40"
// Effective_From: "10-Mar-2026"
// Effective_To: "31-Dec-2026"
// Is_Active: true/false
// Distance_KM: "350"

const CLASS_OPTS = [
  { value: 'SL', label: 'Sleeper (SL)' },
  { value: '3A', label: '3rd AC (3A)' },
  { value: '2A', label: '2nd AC (2A)' },
  { value: '1A', label: '1st AC (1A)' },
  { value: 'CC', label: 'Chair Car (CC)' },
  { value: 'EC', label: 'Executive Chair Car (EC)' },
];

const CONCESSION_OPTS = [
  { value: 'General', label: 'General (No Discount)' },
  { value: 'Senior', label: 'Senior Citizen (40%)' },
  { value: 'Student', label: 'Student (50%)' },
  { value: 'Disabled', label: 'Person with Disability (50%)' },
  { value: 'Armed Forces', label: 'Armed Forces (50%)' },
];

const COLUMNS = [
  { key: '_train', label: 'Train' },
  { key: '_from_station', label: 'From' },
  { key: '_to_station', label: 'To' },
  { key: 'Class', label: 'Class', badge: true },
  { key: 'Base_Fare', label: 'Base ₹' },
  { key: 'Dynamic_Fare', label: 'Dynamic ₹' },
  { key: 'Concession_Type', label: 'Concession' },
  { key: '_effective', label: 'Effective Period' },
  { key: '_is_active', label: 'Status', badge: true },
];

const BLANK = {
  Train: '', From_Station: '', To_Station: '', Class: 'SL',
  Base_Fare: '', Dynamic_Fare: '', Concession_Type: 'General',
  Concession_Percent: '0', Effective_From: '', Effective_To: '',
  Is_Active: true, Distance_KM: '',
  GST_Percentage: '5', Tatkal_Premium_Percentage: '',
  Superfast_Surcharge: '', Catering_Charge: '',
};

function resolveValue(row, key) {
  if (key === '_train') return getLookupLabel(row.Train);
  if (key === '_from_station') return getLookupLabel(row.From_Station);
  if (key === '_to_station') return getLookupLabel(row.To_Station);
  if (key === '_effective') {
    const from = row.Effective_From ? row.Effective_From.split(' ')[0] : '—';
    const to = row.Effective_To ? row.Effective_To.split(' ')[0] : 'Ongoing';
    return `${from} → ${to}`;
  }
  if (key === '_is_active') {
    // Bug fix: Zoho returns boolean true/false — display accurately
    // Some Zoho boolean fields return string "true"/"false"
    const isActive = row.Is_Active === true || row.Is_Active === 'true';
    return isActive ? 'active' : 'inactive';
  }
  return row[key] ?? '—';
}

function rowToForm(row) {
  return {
    Train: typeof row.Train === 'object' ? (row.Train?.ID ?? '') : (row.Train ?? ''),
    From_Station: typeof row.From_Station === 'object' ? (row.From_Station?.ID ?? '') : (row.From_Station ?? ''),
    To_Station: typeof row.To_Station === 'object' ? (row.To_Station?.ID ?? '') : (row.To_Station ?? ''),
    Class: row.Class ?? 'SL',
    Base_Fare: row.Base_Fare ?? '',
    Dynamic_Fare: row.Dynamic_Fare ?? '',
    Concession_Type: row.Concession_Type ?? 'General',
    Concession_Percent: String(row.Concession_Percent ?? '0'),
    Effective_From: parseZohoDateOnly(row.Effective_From),
    Effective_To: parseZohoDateOnly(row.Effective_To),
    // Normalize Is_Active — Zoho may return boolean or string
    Is_Active: row.Is_Active === true || row.Is_Active === 'true',
    Distance_KM: row.Distance_KM ?? '',
    GST_Percentage: row.GST_Percentage ?? '5',
    Tatkal_Premium_Percentage: row.Tatkal_Premium_Percentage ?? '',
    Superfast_Surcharge: row.Superfast_Surcharge ?? '',
    Catering_Charge: row.Catering_Charge ?? '',
  };
}

// Import date helper from api.js
import { parseZohoDateOnly, toZohoDateTime } from '../services/api';

export default function FaresPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [modal, setModal] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);
  const [calcModal, setCalcModal] = useState(false);
  const [calcForm, setCalcForm] = useState({
    train_id: '', from_station: '', to_station: '', class: 'SL',
    passenger_count: '1', concession_type: 'General', journey_date: ''
  });
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Load data
  const fetchFn = useCallback(() => faresApi.getAll(), []);
  const { data, loading, refetch } = useApi(fetchFn);

  const { data: trainsData } = useApi(useCallback(() => trainsApi.getAll(), []));
  const { data: stationsData } = useApi(useCallback(() => stationsApi.getAll(), []));

  const rows = extractRecords(data);
  const trains = extractRecords(trainsData);
  const stations = extractRecords(stationsData);

  const trainOptions = trains.map(t => ({
    value: t.ID,
    label: `${t.Train_Number} – ${t.Train_Name}`,
  }));

  const stationOptions = stations.map(s => ({
    value: s.ID,
    label: `${s.Station_Code} – ${s.Station_Name}`,
  }));

  // Filter rows
  const filtered = rows.filter(r => {
    const matchSearch = !search || rowSearchText(r).includes(search.toLowerCase());
    const matchClass = !classFilter || r.Class === classFilter;
    return matchSearch && matchClass;
  });

  function rowSearchText(row) {
    const train = getLookupLabel(row.Train);
    const from = getLookupLabel(row.From_Station);
    const to = getLookupLabel(row.To_Station);
    return [train, from, to, row.Class, row.Concession_Type].join(' ').toLowerCase();
  }

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => {
      const updated = { ...f, [name]: value };
      // Auto-set concession percent based on type
      if (name === 'Concession_Type') {
        const map = { General: 0, Senior: 40, Student: 50, Disabled: 50, 'Armed Forces': 50 };
        updated.Concession_Percent = String(map[value] || 0);
      }
      return updated;
    });
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate(f) {
    const e = {};
    if (!f.Train) e.Train = 'Required';
    if (!f.From_Station) e.From_Station = 'Required';
    if (!f.To_Station) e.To_Station = 'Required';
    if (!f.Base_Fare || Number(f.Base_Fare) < 0) e.Base_Fare = 'Must be ≥ 0';
    if (f.From_Station === f.To_Station) e.To_Station = 'Cannot be same as From';
    return e;
  }

  const openCreate = () => { setForm(BLANK); setErrors({}); setEditRow(null); setApiErr(null); setModal('create'); };
  const openEdit = row => { setForm(rowToForm(row)); setErrors({}); setEditRow(row); setApiErr(null); setModal('edit'); };
  const openView = row => { setEditRow(row); setModal('view'); };

  const handleSave = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiErr(null);
    try {
      const payload = {
        Train: form.Train,
        From_Station: form.From_Station,
        To_Station: form.To_Station,
        Class: form.Class,
        Base_Fare: Number(form.Base_Fare),
        Dynamic_Fare: form.Dynamic_Fare ? Number(form.Dynamic_Fare) : Number(form.Base_Fare),
        Concession_Type: form.Concession_Type,
        Concession_Percent: Number(form.Concession_Percent),
        Effective_From: toZohoDateTime(form.Effective_From + 'T00:00') ?? form.Effective_From,
        Effective_To: form.Effective_To ? (toZohoDateTime(form.Effective_To + 'T00:00') ?? form.Effective_To) : null,
        Is_Active: form.Is_Active ? 'true' : 'false',
        Distance_KM: form.Distance_KM ? Number(form.Distance_KM) : null,
        GST_Percentage: form.GST_Percentage ? Number(form.GST_Percentage) : 5,
        Tatkal_Premium_Percentage: form.Tatkal_Premium_Percentage ? Number(form.Tatkal_Premium_Percentage) : null,
        Superfast_Surcharge: form.Superfast_Surcharge ? Number(form.Superfast_Surcharge) : null,
        Catering_Charge: form.Catering_Charge ? Number(form.Catering_Charge) : null,
      };

      const res = modal === 'create'
        ? await faresApi.create(payload)
        : await faresApi.update(getRecordId(editRow), payload);

      if (res?.success === false) { setApiErr(res); }
      else {
        addToast(modal === 'create' ? 'Fare created ✓' : 'Fare updated ✓', 'success');
        setModal(null); refetch();
      }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async row => {
    try {
      const res = await faresApi.delete(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Fare deleted', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
  };

  // Fare Calculator
  const handleCalculate = async () => {
    setCalculating(true); setCalcResult(null);
    try {
      const res = await faresApi.calculate({
        train_id: calcForm.train_id,
        from_station: calcForm.from_station,
        to_station: calcForm.to_station,
        class: calcForm.class,
        passenger_count: Number(calcForm.passenger_count),
        concession_type: calcForm.concession_type,
        journey_date: calcForm.journey_date,
      });
      if (res?.success === false) {
        addToast(res.error || 'Calculation failed', 'error');
      } else {
        setCalcResult(res.data);
      }
    } catch (err) { addToast(err.message || 'Calculation failed', 'error'); }
    setCalculating(false);
  };

  const calcHandleChange = e => {
    const { name, value } = e.target;
    setCalcForm(f => ({ ...f, [name]: value }));
  };

  return (
    <div>
      <PageHeader icon="dollar" iconAccent="var(--accent-rose)" title="Fare Management" subtitle={`${rows.length} fare rule${rows.length !== 1 ? 's' : ''}`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="calculator" variant="secondary" onClick={() => setCalcModal(true)}>Fare Calculator</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-rose)" onClick={openCreate}>Add Fare Rule</Button>
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { l: 'Active Rules', v: rows.filter(r => r.Is_Active === true || r.Is_Active === 'true').length, c: '#4ade80' },
          { l: 'Concessions', v: new Set(rows.map(r => r.Concession_Type)).size, c: '#60a5fa' },
          { l: 'Classes', v: new Set(rows.map(r => r.Class)).size, c: '#fbbf24' },
          { l: 'Avg Base Fare', v: rows.length ? `₹${Math.round(rows.reduce((a,r) => a + Number(r.Base_Fare||0), 0)/rows.length)}` : '—', c: '#f472b6' },
        ].map(s => (
          <div key={s.l} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>{s.l}</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: s.c, fontFamily: 'var(--font-display)' }}>{s.v}</span>
          </div>
        ))}
      </div>

      <Card padding={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            icon="search"
            placeholder="Search by train, station, class..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            style={{ padding: '9px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">All Classes</option>
            {CLASS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <CRUDTable
          columns={COLUMNS}
          rows={filtered}
          loading={loading}
          resolveValue={resolveValue}
          onView={openView}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {/* Create/Edit Modal */}
      {modal && (
        <Modal title={modal === 'create' ? 'Add Fare Rule' : 'Edit Fare Rule'} onClose={() => setModal(null)} width={600}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Dropdown
              label="Train" name="Train" value={form.Train}
              onChange={handleChange} required
              options={trainOptions} placeholder="Select train"
              error={errors.Train}
            />

            <FormRow cols={2}>
              <Dropdown
                label="From Station" name="From_Station" value={form.From_Station}
                onChange={handleChange} required
                options={stationOptions} placeholder="Origin"
                error={errors.From_Station}
              />
              <Dropdown
                label="To Station" name="To_Station" value={form.To_Station}
                onChange={handleChange} required
                options={stationOptions} placeholder="Destination"
                error={errors.To_Station}
              />
            </FormRow>

            <FormRow cols={2}>
              <Dropdown
                label="Class" name="Class" value={form.Class}
                onChange={handleChange} required
                options={CLASS_OPTS} placeholder={false}
              />
              <Field
                label="Distance (km)" name="Distance_KM"
                value={form.Distance_KM} onChange={handleChange}
                type="number" placeholder="Optional"
              />
            </FormRow>

            <FormDivider label="Pricing" />

            <FormRow cols={2}>
              <Field
                label="Base Fare ₹" name="Base_Fare"
                value={form.Base_Fare} onChange={handleChange}
                type="number" required placeholder="0.00"
                error={errors.Base_Fare}
              />
              <Field
                label="Dynamic Fare ₹" name="Dynamic_Fare"
                value={form.Dynamic_Fare} onChange={handleChange}
                type="number" placeholder="Same as base if empty"
              />
            </FormRow>

            <FormDivider label="Concession" />

            <FormRow cols={2}>
              <Dropdown
                label="Concession Type" name="Concession_Type"
                value={form.Concession_Type} onChange={handleChange}
                options={CONCESSION_OPTS} placeholder={false}
              />
              <Field
                label="Discount %" name="Concession_Percent"
                value={form.Concession_Percent} onChange={handleChange}
                type="number" placeholder="0"
              />
            </FormRow>

            <FormDivider label="Surcharges & Tax" />

            <FormRow cols={2}>
              <Field label="GST %" name="GST_Percentage" value={form.GST_Percentage} onChange={handleChange} type="number" placeholder="5" />
              <Field label="Tatkal Premium %" name="Tatkal_Premium_Percentage" value={form.Tatkal_Premium_Percentage} onChange={handleChange} type="number" placeholder="Optional" />
            </FormRow>

            <FormRow cols={2}>
              <Field label="Superfast Surcharge ₹" name="Superfast_Surcharge" value={form.Superfast_Surcharge} onChange={handleChange} type="number" placeholder="Optional" />
              <Field label="Catering Charge ₹" name="Catering_Charge" value={form.Catering_Charge} onChange={handleChange} type="number" placeholder="Optional" />
            </FormRow>

            <FormDivider label="Validity" />

            <FormRow cols={2}>
              <Field
                label="Effective From" name="Effective_From"
                value={form.Effective_From} onChange={handleChange}
                type="date"
              />
              <Field
                label="Effective To (optional)" name="Effective_To"
                value={form.Effective_To} onChange={handleChange}
                type="date"
              />
            </FormRow>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 10 }}>
              <input
                type="checkbox"
                id="is_active"
                checked={form.Is_Active}
                onChange={e => setForm(f => ({ ...f, Is_Active: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-rose)' }}
              />
              <label htmlFor="is_active" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Active Fare Rule
              </label>
            </div>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create Fare Rule' : 'Save Changes'}
              accent="var(--accent-rose)"
            />
          </div>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title="👁 Fare Rule Details" onClose={() => setModal(null)} width={560}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>Train:</strong> {getLookupLabel(editRow.Train)}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>From Station:</strong> {getLookupLabel(editRow.From_Station)}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>To Station:</strong> {getLookupLabel(editRow.To_Station)}</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Class:</strong> {editRow.Class}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Distance:</strong> {editRow.Distance_KM ? `${editRow.Distance_KM} km` : '—'}</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Base Fare:</strong> ₹{editRow.Base_Fare}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Dynamic Fare:</strong> ₹{editRow.Dynamic_Fare || '—'}</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Concession Type:</strong> {editRow.Concession_Type || 'General'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Discount %:</strong> {editRow.Concession_Percent || '0'}%</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Effective From:</strong> {editRow.Effective_From ? editRow.Effective_From.split(' ')[0] : '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Effective To:</strong> {editRow.Effective_To ? editRow.Effective_To.split(' ')[0] : 'Ongoing'}</div>

              <div><strong style={{ color: 'var(--text-primary)' }}>GST:</strong> {editRow.GST_Percentage || '5'}%</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Tatkal Premium:</strong> {editRow.Tatkal_Premium_Percentage || '0'}%</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Superfast Surcharge:</strong> ₹{editRow.Superfast_Surcharge || '0'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Catering Charge:</strong> ₹{editRow.Catering_Charge || '0'}</div>

              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {editRow.Is_Active === true || editRow.Is_Active === 'true' ? 'Active' : 'Inactive'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Fare Calculator Modal */}
      {calcModal && (
        <Modal title="Fare Calculator" onClose={() => { setCalcModal(false); setCalcResult(null); }} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            
            <Dropdown
              label="Train" name="train_id" value={calcForm.train_id}
              onChange={calcHandleChange} required
              options={trainOptions} placeholder="Select train"
            />

            <FormRow cols={2}>
              <Dropdown
                label="From" name="from_station" value={calcForm.from_station}
                onChange={calcHandleChange} required
                options={stationOptions} placeholder="Origin"
              />
              <Dropdown
                label="To" name="to_station" value={calcForm.to_station}
                onChange={calcHandleChange} required
                options={stationOptions} placeholder="Destination"
              />
            </FormRow>

            <FormRow cols={2}>
              <Dropdown
                label="Class" name="class" value={calcForm.class}
                onChange={calcHandleChange} required
                options={CLASS_OPTS} placeholder={false}
              />
              <Field
                label="Passengers" name="passenger_count"
                value={calcForm.passenger_count} onChange={calcHandleChange}
                type="number" required
              />
            </FormRow>

            <FormRow cols={2}>
              <Dropdown
                label="Concession" name="concession_type" value={calcForm.concession_type}
                onChange={calcHandleChange}
                options={CONCESSION_OPTS} placeholder={false}
              />
              <Field
                label="Journey Date" name="journey_date"
                value={calcForm.journey_date} onChange={calcHandleChange}
                type="date"
              />
            </FormRow>

            <Button 
              onClick={handleCalculate} 
              disabled={calculating || !calcForm.train_id || !calcForm.from_station || !calcForm.to_station}
              accent="var(--accent-rose)"
              style={{ marginTop: 8 }}
            >
              {calculating ? 'Calculating...' : 'Calculate Fare'}
            </Button>

            {calcResult && (
              <div style={{ 
                marginTop: 16, 
                padding: 20, 
                background: 'var(--bg-inset)', 
                border: '1px solid var(--border)', 
                borderRadius: 12,
                animation: 'slideInUp 0.3s ease'
              }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>
                  Fare Breakdown
                </div>
                
                {[
                  { label: 'Base Fare', value: `₹${calcResult.base_fare}`, color: 'var(--text-secondary)' },
                  { label: 'Dynamic Pricing', value: calcResult.dynamic_fare_adjustment > 0 ? `+₹${calcResult.dynamic_fare_adjustment}` : '—', color: '#fbbf24' },
                  { label: `Concession (${calcResult.concession_type})`, value: calcResult.concession_discount < 0 ? `-₹${Math.abs(calcResult.concession_discount)}` : '—', color: '#4ade80' },
                  { label: 'GST (5%)', value: `₹${calcResult.gst_5_percent}`, color: 'var(--text-muted)' },
                  { label: 'Convenience Fee', value: `₹${calcResult.convenience_fee}`, color: 'var(--text-muted)' },
                ].map((row, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 4 ? '1px solid var(--border)' : 'none', fontSize: 13, color: row.color }}>
                    <span>{row.label}</span>
                    <span style={{ fontWeight: 600 }}>{row.value}</span>
                  </div>
                ))}

                <div style={{ 
                  marginTop: 12, 
                  paddingTop: 12, 
                  borderTop: '2px solid var(--accent-rose)', 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  fontSize: 18,
                  fontWeight: 800,
                  fontFamily: 'var(--font-display)',
                  color: 'var(--accent-rose)'
                }}>
                  <span>Total Amount</span>
                  <span>₹{calcResult.total}</span>
                </div>

                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center' }}>
                  {calcResult.passenger_count} passenger{calcResult.passenger_count > 1 ? 's' : ''} · {calcForm.class}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}