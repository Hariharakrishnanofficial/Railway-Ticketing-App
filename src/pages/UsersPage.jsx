import { useState, useCallback } from 'react';
import { usersApi, extractRecords, getRecordId } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormDivider, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Zoho Users schema ────────────────────────────────────────────────────────
// Full_Name, Email, Phone_Number, Address, Role, Date_of_Birth, ID_Proof_Type, ID_Proof_Number

const ROLE_OPTS    = [{ value: 'User', label: 'User' }, { value: 'Admin', label: 'Admin' }];
const ID_PROOF_OPTS = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID'];

const COLUMNS = [
  { key: 'Full_Name',    label: 'Full Name'                   },
  { key: 'Email',        label: 'Email'                       },
  { key: 'Phone_Number', label: 'Phone', mono: true           },
  { key: 'Role',         label: 'Role', badge: true           },
  { key: 'Address',      label: 'Address'                     },
];

function resolveValue(row, key) {
  return row[key] ?? '—';
}

const BLANK = {
  Full_Name: '', Email: '', Phone_Number: '', Address: '',
  Role: 'User', Date_of_Birth: '', ID_Proof_Type: '', ID_Proof_Number: '',
};

function rowToForm(row) {
  return {
    Full_Name:      row.Full_Name      ?? '',
    Email:          row.Email          ?? '',
    Phone_Number:   row.Phone_Number   ?? '',
    Address:        row.Address        ?? '',
    Role:           row.Role           ?? 'User',
    Date_of_Birth:  row.Date_of_Birth  ? String(row.Date_of_Birth).split(' ')[0] : '',
    ID_Proof_Type:  row.ID_Proof_Type  ?? '',
    ID_Proof_Number: row.ID_Proof_Number ?? '',
  };
}

export default function UsersPage() {
  const { addToast } = useToast();
  const [search, setSearch]   = useState('');
  const [modal, setModal]     = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm]       = useState(BLANK);
  const [errors, setErrors]   = useState({});
  const [saving, setSaving]   = useState(false);
  const [apiErr, setApiErr]   = useState(null);

  const fetchFn = useCallback(() => usersApi.getAll(), []);
  const { data, loading, refetch } = useApi(fetchFn);
  const rows = extractRecords(data);

  const filtered = rows.filter(r =>
    [r.Full_Name, r.Email, r.Phone_Number, r.Address, r.Role].some(v =>
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
    if (!f.Full_Name.trim())    e.Full_Name    = 'Required';
    if (!f.Email.trim())        e.Email        = 'Required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.Email)) e.Email = 'Invalid email';
    if (!f.Phone_Number.trim()) e.Phone_Number = 'Required';
    else if (!/^\d{10}$/.test(f.Phone_Number.replace(/\s/g, ''))) e.Phone_Number = '10-digit number required';
    return e;
  }

  const openCreate = () => { setForm(BLANK); setErrors({}); setEditRow(null); setApiErr(null); setModal('create'); };
  const openEdit   = row  => { setForm(rowToForm(row)); setErrors({}); setEditRow(row); setApiErr(null); setModal('edit'); };

  const handleSave = async () => {
    const e = validate(form);
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true); setApiErr(null);
    try {
      const payload = {
        Full_Name:       form.Full_Name.trim(),
        Email:           form.Email.trim(),
        Phone_Number:    form.Phone_Number.trim(),
        Address:         form.Address.trim(),
        Role:            form.Role,
        Date_of_Birth:   form.Date_of_Birth || undefined,
        ID_Proof_Type:   form.ID_Proof_Type || undefined,
        ID_Proof_Number: form.ID_Proof_Number.trim() || undefined,
      };
      // Remove undefined
      Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

      let res;
      if (modal === 'create') {
        res = await usersApi.create(payload);
      } else {
        res = await usersApi.update(getRecordId(editRow), payload);
      }
      if (res?.success === false) { setApiErr(res); }
      else { addToast(modal === 'create' ? 'User created ✓' : 'User updated ✓', 'success'); setModal(null); refetch(); }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async row => {
    try {
      const res = await usersApi.delete(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('User deleted', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
  };

  return (
    <div>
      <PageHeader icon="users" iconAccent="var(--accent-green)" title="Users" subtitle={`${rows.length} users`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-green)" onClick={openCreate}>Add User</Button>
      </PageHeader>

      <Card padding={0}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <Input icon="search" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 320 }} />
        </div>
        <CRUDTable columns={COLUMNS} rows={filtered} loading={loading} resolveValue={resolveValue} onEdit={openEdit} onDelete={handleDelete} />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {modal && (
        <Modal title={modal === 'create' ? 'Add User' : 'Edit User'} onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <FormRow cols={2}>
              <Field label="Full Name *"  name="Full_Name"    value={form.Full_Name}    onChange={handleChange} required placeholder="Rahul Sharma" error={errors.Full_Name} />
              <Dropdown label="Role" name="Role" value={form.Role} onChange={handleChange} options={ROLE_OPTS} placeholder={false} />
            </FormRow>

            <Field label="Email *"  name="Email" value={form.Email} onChange={handleChange} required placeholder="user@example.com" error={errors.Email} />

            <FormRow cols={2}>
              <Field label="Phone *" name="Phone_Number" value={form.Phone_Number} onChange={handleChange} required placeholder="9876543210" error={errors.Phone_Number} maxLength={10} mono />
              <Field label="Date of Birth" name="Date_of_Birth" value={form.Date_of_Birth} onChange={handleChange} type="date" />
            </FormRow>

            <Field label="Address" name="Address" value={form.Address} onChange={handleChange} placeholder="Street, City, State" />

            <FormDivider label="ID Proof (Optional)" />
            <FormRow cols={2}>
              <Dropdown label="ID Proof Type" name="ID_Proof_Type" value={form.ID_Proof_Type} onChange={handleChange} options={ID_PROOF_OPTS} placeholder="Select ID type" />
              <Field label="ID Proof Number" name="ID_Proof_Number" value={form.ID_Proof_Number} onChange={handleChange} placeholder="e.g. XXXX-XXXX-XXXX" mono />
            </FormRow>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create User' : 'Save Changes'}
              accent="var(--accent-green)"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
