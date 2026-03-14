import { useState, useCallback } from 'react';
import { usersApi, extractRecords, getRecordId, parseZohoDateOnly } from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Modal } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormDivider, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Zoho Users schema ────────────────────────────────────────────────────────
// Full_Name, Email, Phone_Number, Address, Role, Date_of_Birth, ID_Proof_Type, ID_Proof_Number

const ROLE_OPTS    = [{ value: 'User', label: 'User' }, { value: 'Admin', label: 'Admin' }];
const ACCOUNT_STATUS_OPTS = [
  { value: 'Active', label: 'Active' },
  { value: 'Suspended', label: 'Suspended' },
  { value: 'Blocked', label: 'Blocked' }
];
const ID_PROOF_OPTS = ['Aadhaar', 'PAN', 'Passport', 'Driving Licence', 'Voter ID'];

const COLUMNS = [
  { key: 'Full_Name',    label: 'Full Name'                   },
  { key: 'Email',        label: 'Email'                       },
  { key: 'Phone_Number', label: 'Phone', mono: true           },
  { key: 'Role',         label: 'Role', badge: true           },
  { key: 'Account_Status', label: 'Status', badge: true       },
  { key: 'Address',      label: 'Address'                     },
];

function resolveValue(row, key) {
  if (key === 'Address') return row.Address || row.Address1 || '—';
  return row[key] ?? '—';
}

const BLANK = {
  Full_Name: '', Email: '', Phone_Number: '', Address: '',
  Role: 'User', Account_Status: 'Active', Date_of_Birth: '', ID_Proof_Type: '', ID_Proof_Number: '',
  Aadhar_Verified: false, Current_Month_Booking_Count: '0',
};

function rowToForm(row) {
  return {
    Full_Name:      row.Full_Name      ?? '',
    Email:          row.Email          ?? '',
    Phone_Number:   row.Phone_Number   ?? '',
    // Fallback to Address1 if Address is empty
    Address:        row.Address || row.Address1 || '',
    Role:           row.Role           ?? 'User',
    Account_Status: row.Account_Status ?? 'Active',
    Date_of_Birth:  row.Date_of_Birth ? parseZohoDateOnly(row.Date_of_Birth) : '',
    ID_Proof_Type:  row.ID_Proof_Type  ?? '',
    ID_Proof_Number: row.ID_Proof_Number ?? '',
    Aadhar_Verified: row.Aadhar_Verified === true || String(row.Aadhar_Verified).toLowerCase() === 'true',
    Current_Month_Booking_Count: row.Current_Month_Booking_Count ?? '0',
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
  const openView   = row  => { setEditRow(row); setModal('view'); };

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
        Account_Status:  form.Account_Status,
        Date_of_Birth:   form.Date_of_Birth || undefined,
        ID_Proof_Type:   form.ID_Proof_Type || undefined,
        ID_Proof_Number: form.ID_Proof_Number.trim() || undefined,
        Aadhar_Verified: form.Aadhar_Verified ? 'true' : 'false',
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
        <CRUDTable columns={COLUMNS} rows={filtered} loading={loading} resolveValue={resolveValue} onView={openView} onEdit={openEdit} onDelete={handleDelete} />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {modal && (
        <Modal title={modal === 'create' ? 'Add User' : 'Edit User'} onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <FormRow cols={3}>
              <Field label="Full Name *"  name="Full_Name"    value={form.Full_Name}    onChange={handleChange} required placeholder="Rahul Sharma" error={errors.Full_Name} />
              <Dropdown label="Role" name="Role" value={form.Role} onChange={handleChange} options={ROLE_OPTS} placeholder={false} />
              <Dropdown label="Account Status" name="Account_Status" value={form.Account_Status} onChange={handleChange} options={ACCOUNT_STATUS_OPTS} placeholder={false} />
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-inset)', borderRadius: 10 }}>
              <input
                type="checkbox"
                id="aadhar_verified"
                checked={form.Aadhar_Verified}
                onChange={e => setForm(f => ({ ...f, Aadhar_Verified: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--accent-green)' }}
              />
              <label htmlFor="aadhar_verified" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                Aadhar Verified
              </label>
            </div>

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

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title={`👁 User Details: ${editRow.Full_Name}`} onClose={() => setModal(null)} width={520}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>Full Name:</strong> {editRow.Full_Name}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Email:</strong> {editRow.Email}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Phone:</strong> {editRow.Phone_Number}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Role:</strong> {editRow.Role}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Account Status:</strong> {editRow.Account_Status || 'Active'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Date of Birth:</strong> {editRow.Date_of_Birth ? String(editRow.Date_of_Birth).split(' ')[0] : '—'}</div>
               <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>Address:</strong> {editRow.Address || editRow.Address1 || '—'}</div>
              
              <div style={{ gridColumn: '1 / -1', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: 8 }}>ID Proof Details</strong>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div><strong>Type:</strong> {editRow.ID_Proof_Type || '—'}</div>
                  <div><strong>Number:</strong> {editRow.ID_Proof_Number || '—'}</div>
                </div>
                <div style={{ marginTop: 8, display: 'flex', gap: 24 }}>
                  <div><strong>Aadhar Verified:</strong> {editRow.Aadhar_Verified === true || editRow.Aadhar_Verified === 'true' ? '✅ Yes' : '❌ No'}</div>
                  <div><strong>Monthly Booking Count:</strong> {editRow.Current_Month_Booking_Count || '0'}</div>
                </div>
              </div>
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
