import { useState, useCallback, useEffect } from 'react';
import { settingsApi, extractRecords, getRecordId } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal, Select } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Zoho Settings schema ─────────────────────────────────────────────────────
// Key, Value, Type_field, Description, Is_Active

const COLUMNS = [
  { key: 'Type_field',   label: 'Type'        },
  { key: 'Key',          label: 'Key', mono: true },
  { key: 'Value',        label: 'Value'       },
  { key: 'Description',  label: 'Description' },
  { key: '_is_active',   label: 'Status', badge: true },
];

function resolveValue(row, key) {
  if (key === '_is_active') return (row.Is_Active === true || row.Is_Active === 'true') ? 'active' : 'inactive';
  return row[key] ?? '—';
}

const BLANK = { Type_field: '', Key: '', Value: '', Description: '', Is_Active: true };

function rowToForm(row) {
  return {
    Type_field:  row.Type_field  ?? '',
    Key:         row.Key         ?? '',
    Value:       row.Value       ?? '',
    Description: row.Description ?? '',
    Is_Active:   row.Is_Active !== undefined ? (row.Is_Active === true || row.Is_Active === 'true') : true,
  };
}

export default function SettingsPage() {
  const { addToast } = useToast();
  const [search, setSearch]       = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [modal, setModal]         = useState(null);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [apiErr, setApiErr]       = useState(null);
  const [typeOptions, setTypeOptions] = useState([]);

  const fetchFn = useCallback(() => {
    const params = {};
    if (typeFilter) params.type = typeFilter;
    return settingsApi.getAll(params);
  }, [typeFilter]);

  const { data, loading, refetch } = useApi(fetchFn);
  const rows = extractRecords(data);

  useEffect(() => {
    const types = Array.from(new Set(rows.map(r => r.Type_field).filter(Boolean))).sort();
    setTypeOptions(types);
  }, [rows]);

  const filtered = rows.filter(r =>
    [r.Type_field, r.Key, r.Value, r.Description].some(v =>
      String(v ?? '').toLowerCase().includes(search.toLowerCase())
    )
  );

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate(f) {
    const e = {};
    if (!f.Type_field.trim()) e.Type_field = 'Required';
    if (!f.Value.trim())      e.Value      = 'Required';
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
      const payload = {
        Type_field:  form.Type_field.trim(),
        Key:         form.Key.trim(),
        Value:       form.Value.trim(),
        Description: form.Description.trim(),
        Is_Active:   form.Is_Active ? 'true' : 'false',
      };
      const res = modal === 'create'
        ? await settingsApi.create(payload)
        : await settingsApi.update(getRecordId(editRow), payload);
      if (res?.success === false) { setApiErr(res); }
      else {
        addToast(modal === 'create' ? 'Setting created ✓' : 'Setting updated ✓', 'success');
        setModal(null);
        refetch();
      }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async row => {
    try {
      const res = await settingsApi.delete(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Setting deleted', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
  };

  return (
    <div>
      <PageHeader icon="settings" iconAccent="var(--accent-green)" title="Settings" subtitle={`${rows.length} items`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-green)" onClick={openCreate}>Add Setting</Button>
      </PageHeader>

      <Card padding={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input icon="search" placeholder="Search settings…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
          <Select placeholder="Filter by Type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ minWidth: 180 }}>
            <option value="">All Types</option>
            {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <CRUDTable columns={COLUMNS} rows={filtered} loading={loading} resolveValue={resolveValue} onView={openView} onEdit={openEdit} onDelete={handleDelete} />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {modal && (
        <Modal title={modal === 'create' ? 'Add Setting' : 'Edit Setting'} onClose={() => setModal(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <FormRow cols={2}>
              <Field label="Type *" name="Type_field" value={form.Type_field} onChange={handleChange} required placeholder="e.g. Seat Class" error={errors.Type_field} />
              <Field label="Key"    name="Key"        value={form.Key}        onChange={handleChange} placeholder="e.g. MAX_PASSENGERS" mono />
            </FormRow>

            <Field label="Value *" name="Value" value={form.Value} onChange={handleChange} required placeholder="Setting value" error={errors.Value} />

            <Field label="Description" name="Description" value={form.Description} onChange={handleChange} placeholder="Optional description" />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 10 }}>
              <input
                type="checkbox"
                id="setting_is_active"
                checked={form.Is_Active}
                onChange={e => setForm(f => ({ ...f, Is_Active: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-green)' }}
              />
              <label htmlFor="setting_is_active" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Active
              </label>
            </div>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create Setting' : 'Save Changes'}
              accent="var(--accent-green)"
            />
          </div>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title={`👁 Setting Details: ${editRow.Key || editRow.Type_field}`} onClose={() => setModal(null)} width={480}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Type:</strong> {editRow.Type_field}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Key:</strong> {editRow.Key || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Value:</strong> {editRow.Value}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Description:</strong> {editRow.Description || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {editRow.Is_Active === true || editRow.Is_Active === 'true' ? 'Active' : 'Inactive'}</div>
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