import { useState, useCallback } from 'react';
import { stationsApi, extractRecords, getRecordId } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Zoho Stations schema ──────────────────────────────────────────────────────
// Station_Code, Station_Name, City, State, Zone, Station_Type, Latitude, Longitude

const ZONE_OPTS = [
  { label: 'Central (CR)', value: 'CR' },
  { label: 'Eastern (ER)', value: 'ER' },
  { label: 'East Central (ECR)', value: 'ECR' },
  { label: 'East Coast (ECoR)', value: 'ECoR' },
  { label: 'Northern (NR)', value: 'NR' },
  { label: 'North Central (NCR)', value: 'NCR' },
  { label: 'North Eastern (NER)', value: 'NER' },
  { label: 'North Western (NWR)', value: 'NWR' },
  { label: 'Northeast Frontier (NFR)', value: 'NFR' },
  { label: 'Southern (SR)', value: 'SR' },
  { label: 'South Central (SCR)', value: 'SCR' },
  { label: 'South Eastern (SER)', value: 'SER' },
  { label: 'South East Central (SECR)', value: 'SECR' },
  { label: 'South Western (SWR)', value: 'SWR' },
  { label: 'Western (WR)', value: 'WR' },
  { label: 'West Central (WCR)', value: 'WCR' },
  { label: 'Metro Railway Kolkata (MR)', value: 'MR' },
  { label: 'Konkan (KR)', value: 'KR' },
];

const STATION_TYPE_OPTS = [
  'Junction', 'Terminal', 'Central', 'Main', 'Regular', 'Halt',
];

const COLUMNS = [
  { key: 'Station_Code',  label: 'Code', mono: true },
  { key: 'Station_Name',  label: 'Name'             },
  { key: 'City',          label: 'City'             },
  { key: 'State',         label: 'State'            },
  { key: 'Zone',          label: 'Zone'             },
  { key: 'Station_Type',  label: 'Type'             },
];

const BLANK = {
  Station_Code: '', Station_Name: '', City: '', State: '', Zone: '',
  Station_Type: 'Junction', Latitude: '', Longitude: '',
  Number_of_Platforms: '', Division: '', Is_Active: true,
};

function rowToForm(row) {
  return {
    Station_Code:  row.Station_Code  ?? '',
    Station_Name:  row.Station_Name  ?? '',
    City:          row.City          ?? '',
    State:         row.State         ?? '',
    Zone:          row.Zone          ?? '',
    Station_Type: row.Station_Type || 'Junction',
    Latitude:     row.Latitude     || '',
    Longitude:    row.Longitude    || '',
    Number_of_Platforms: row.Number_of_Platforms || '',
    Division:     row.Division     || '',
    Is_Active:    row.Is_Active !== undefined ? (row.Is_Active === true || row.Is_Active === 'true') : true,
  };
}

export default function StationsPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm]     = useState(BLANK);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);

  const fetchFn = useCallback(() => stationsApi.getAll(), []);
  const { data, loading, refetch } = useApi(fetchFn);
  const rows = extractRecords(data);

  const filtered = rows.filter(r =>
    Object.values(r).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase()))
  );

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate(f) {
    const e = {};
    if (!f.Station_Code.trim()) e.Station_Code = 'Required';
    if (!f.Station_Name.trim()) e.Station_Name = 'Required';
    if (!f.City.trim())         e.City         = 'Required';
    if (!f.State.trim())        e.State        = 'Required';
    return e;
  }

  const openCreate = () => { setForm(BLANK); setErrors({}); setEditRow(null); setApiErr(null); setModal('create'); };
  const openEdit   = row  => { setForm(rowToForm(row)); setErrors({}); setEditRow(row); setApiErr(null); setModal('edit'); };
  const openView   = row  => { setEditRow(row); setModal('view'); };

  const handleSave = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiErr(null);
    try {
      // Send PascalCase keys — backend accepts both cases
      const payload = {
        Station_Code:  form.Station_Code.trim().toUpperCase(),
        Station_Name:  form.Station_Name.trim(),
        City:          form.City.trim(),
        State:         form.State.trim(),
        Zone:          form.Zone,
        Station_Type:  form.Station_Type,
        Latitude:      form.Latitude  ? parseFloat(form.Latitude)  : null,
        Longitude:     form.Longitude ? parseFloat(form.Longitude) : null,
        Number_of_Platforms: form.Number_of_Platforms ? parseInt(form.Number_of_Platforms, 10) : null,
        Division:      form.Division.trim() || "",
        Is_Active:     form.Is_Active ? 'true' : 'false',
      };

      const res = modal === 'create'
        ? await stationsApi.create(payload)
        : await stationsApi.update(getRecordId(editRow), payload);
      if (res?.success === false) { setApiErr(res); }
      else { addToast(modal === 'create' ? 'Station created ✓' : 'Station updated ✓', 'success'); setModal(null); refetch(); }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async row => {
    try {
      const res = await stationsApi.delete(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Station deleted', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
  };

  return (
    <div>
      <PageHeader icon="station" iconAccent="var(--accent-purple)" title="Stations" subtitle={`${rows.length} stations`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-purple)" onClick={openCreate}>Add Station</Button>
      </PageHeader>

      <Card padding={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <Input icon="search" placeholder="Search by code, name, city, state…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
        </div>
        <CRUDTable columns={COLUMNS} rows={filtered} loading={loading} onView={openView} onEdit={openEdit} onDelete={handleDelete} />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {modal && (
        <Modal title={modal === 'create' ? 'Add Station' : 'Edit Station'} onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <FormRow cols={2}>
              <Field
                label="Station Code *" name="Station_Code" value={form.Station_Code}
                onChange={handleChange} required placeholder="e.g. MAS"
                error={errors.Station_Code} mono
              />
              <Dropdown
                label="Station Type" name="Station_Type" value={form.Station_Type}
                onChange={handleChange} options={STATION_TYPE_OPTS} placeholder="Select type"
              />
            </FormRow>

            <Field
              label="Station Name *" name="Station_Name" value={form.Station_Name}
              onChange={handleChange} required placeholder="e.g. Chennai Central"
              error={errors.Station_Name}
            />

            <FormRow cols={2}>
              <Field label="City *"  name="City"  value={form.City}  onChange={handleChange} required placeholder="e.g. Chennai" error={errors.City} />
              <Field label="State *" name="State" value={form.State} onChange={handleChange} required placeholder="e.g. Tamil Nadu" error={errors.State} />
            </FormRow>

            <Dropdown
              label="Zone" name="Zone" value={form.Zone}
              onChange={handleChange} options={ZONE_OPTS} placeholder="Select zone"
            />

            <FormRow cols={2}>
              <Field label="Latitude"  name="Latitude"  value={form.Latitude}  onChange={handleChange} placeholder="e.g. 18.5204" mono />
              <Field label="Longitude" name="Longitude" value={form.Longitude} onChange={handleChange} placeholder="e.g. 73.8567" mono />
            </FormRow>

            <FormRow cols={2}>
              <Field label="No. of Platforms"  name="Number_of_Platforms"  value={form.Number_of_Platforms}  onChange={handleChange} type="number" placeholder="e.g. 10" />
              <Field label="Division"          name="Division"             value={form.Division}             onChange={handleChange} placeholder="e.g. Mumbai" />
            </FormRow>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 10 }}>
              <input
                type="checkbox"
                id="station_is_active"
                checked={form.Is_Active}
                onChange={e => setForm(f => ({ ...f, Is_Active: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-purple)' }}
              />
              <label htmlFor="station_is_active" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Active Station
              </label>
            </div>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create Station' : 'Save Changes'}
              accent="var(--accent-purple)"
            />
          </div>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title={`👁 Station Details: ${editRow.Station_Name}`} onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Station Code:</strong> {editRow.Station_Code}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Station Name:</strong> {editRow.Station_Name}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>City:</strong> {editRow.City}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>State:</strong> {editRow.State}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Zone:</strong> {editRow.Zone || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Station Type:</strong> {editRow.Station_Type || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Latitude:</strong> {editRow.Latitude || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Longitude:</strong> {editRow.Longitude || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Platforms:</strong> {editRow.Number_of_Platforms || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Division:</strong> {editRow.Division || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {editRow.Is_Active === 'true' || editRow.Is_Active === true ? 'Active' : 'Inactive'}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setModal(null)}>Close</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
