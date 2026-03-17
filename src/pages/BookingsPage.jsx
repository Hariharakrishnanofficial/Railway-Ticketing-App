import { useState, useCallback } from 'react';
import {
  bookingsApi, usersApi, trainsApi, settingsApi,
  extractRecords, getRecordId,
  parseZohoDateOnly, displayZohoDate, toZohoDateTime,
} from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { useSettings } from '../context/SettingsContext';
import { PageHeader, Button, Card, Input, Modal } from '../components/UI';
import CRUDTable from '../components/CRUDTable';
import { Field, Dropdown, FormRow, FormDivider, FormActions, FormApiError, DebugRecord } from '../components/FormFields';

// ─── Exact Zoho API field names for Bookings ──────────────────────────────────
// Booking_Status values from Zoho: "pending" | "confirmed" | "cancelled"  (all lowercase)
// Payment_Status values from Zoho: "unpaid"  | "paid"      | "failed"     (all lowercase)
// Journey_Date: "10-Mar-2026 00:00:00"  or ""
// Booking_Time: "10-Mar-2026 13:08:17"  or ""
// Trains: { ID, display_value }   (lookup)
// Users:  { ID, display_value }   (lookup)

const DEFAULT_CLASS_OPTS   = [
  { value: 'SL', label: 'SL — Sleeper' },
  { value: '3A', label: '3A — AC 3 Tier' },
  { value: '2A', label: '2A — AC 2 Tier' },
  { value: '1A', label: '1A — AC First Class' },
  { value: 'CC', label: 'CC — Chair Car' },
  { value: 'EC', label: 'EC — Executive Chair Car' },
  { value: '2S', label: '2S — Second Sitting' },
];
const DEFAULT_STATUS_OPTS  = [
  { value: 'pending',   label: 'Pending'   },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
];
const DEFAULT_PAYMENT_OPTS = [
  { value: 'unpaid',  label: 'Unpaid'  },
  { value: 'paid',    label: 'Paid'    },
  { value: 'failed',  label: 'Failed'  },
];

const COLUMNS = [
  { key: 'PNR',             label: 'PNR',          mono: true },
  { key: '_train',          label: 'Train'                    },
  { key: '_user',           label: 'Passenger'                },
  { key: '_journey_date',   label: 'Journey Date'             },
  { key: 'Class',           label: 'Class'                    },
  { key: 'Passenger_Count', label: 'Pax'                      },
  { key: 'Total_Fare',      label: 'Fare ₹'                   },
  { key: 'Booking_Status',  label: 'Status',  badge: true     },
  { key: 'Payment_Status',  label: 'Payment', badge: true     },
];

const BLANK = {
  Trains: '', Users: '', Journey_Date: '', Passenger_Count: '1',
  Class: 'SL', Total_Fare: '',
  Booking_Status: 'pending', Payment_Status: 'unpaid',
  Boarding_Station: '', Deboarding_Station: '',
  Quota: 'GN', Seat_Numbers: '', Coach_Number: '', Refund_Amount: '',
};

function resolveValue(row, key) {
  if (key === '_train') {
    const t = row.Trains;
    if (!t) return '—';
    return typeof t === 'object' ? (t.display_value || t.ID || '—') : (t || '—');
  }
  if (key === '_user') {
    const u = row.Users;
    if (!u) return '—';
    return typeof u === 'object' ? (u.display_value || u.ID || '—') : (u || '—');
  }
  if (key === '_journey_date') return displayZohoDate(row.Journey_Date);
  return row[key] ?? '—';
}

function rowToForm(row) {
  return {
    Trains:          typeof row.Trains === 'object' ? (row.Trains?.ID  ?? '') : (row.Trains ?? ''),
    Users:           typeof row.Users  === 'object' ? (row.Users?.ID   ?? '') : (row.Users  ?? ''),
    Journey_Date:    parseZohoDateOnly(row.Journey_Date),
    Passenger_Count: String(row.Passenger_Count ?? '1'),
    Class:           row.Class          ?? 'Sleeper',
    Total_Fare:      row.Total_Fare     ?? '',
    Booking_Status:  (row.Booking_Status ?? 'pending').toLowerCase(),
    Payment_Status:  (row.Payment_Status ?? 'unpaid').toLowerCase(),
    Boarding_Station: row.Boarding_Station ?? '',
    Deboarding_Station: row.Deboarding_Station ?? '',
    Quota:           row.Quota          ?? 'GN',
    Seat_Numbers:    row.Seat_Numbers   ?? '',
    Coach_Number:    row.Coach_Number   ?? '',
    Refund_Amount:   row.Refund_Amount  ?? '',
  };
}

// Flatten lookup objects for full-text search
function rowSearchText(row) {
  const trainName = typeof row.Trains === 'object'
    ? `${row.Trains?.display_value ?? ''} ${row.Trains?.ID ?? ''}`
    : (row.Trains ?? '');
  const userName = typeof row.Users === 'object'
    ? `${row.Users?.display_value ?? ''} ${row.Users?.ID ?? ''}`
    : (row.Users ?? '');
  return [
    row.PNR, row.Class,
    row.Booking_Status, row.Payment_Status,
    displayZohoDate(row.Journey_Date),
    String(row.Passenger_Count ?? ''),
    String(row.Total_Fare ?? ''),
    trainName, userName,
  ].join(' ').toLowerCase();
}

export default function BookingsPage() {
  const { addToast } = useToast();
  const { getDropdownOptions } = useSettings();
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatus] = useState('');
  const [modal, setModal]         = useState(null);
  const [editRow, setEditRow]     = useState(null);
  const [form, setForm]           = useState(BLANK);
  const [errors, setErrors]       = useState({});
  const [saving, setSaving]       = useState(false);
  const [apiErr, setApiErr]       = useState(null);

  const fetchFn        = useCallback(() => bookingsApi.getAll(), []);
  const fetchUsersFn   = useCallback(() => usersApi.getAll(), []);
  const fetchTrainsFn  = useCallback(() => trainsApi.getAll(), []);

  const { data, loading, refetch } = useApi(fetchFn);
  const { data: usersData }        = useApi(fetchUsersFn);
  const { data: trainsData }       = useApi(fetchTrainsFn);

  const rows    = extractRecords(data);
  const users   = extractRecords(usersData);
  const trains  = extractRecords(trainsData);

  // Get dropdown options from settings context
  const CLASS_OPTS   = getDropdownOptions('classes');
  const STATUS_OPTS  = getDropdownOptions('booking_status');
  const PAYMENT_OPTS = getDropdownOptions('payment_status');
  const QUOTA_OPTS   = getDropdownOptions('quotas');

  const userOptions  = users.map(u  => ({ value: u.ID, label: `${u.Full_Name ?? ''} (${u.Email ?? ''})` }));
  const trainOptions = trains.map(t => ({ value: t.ID, label: `${t.Train_Number ?? ''} – ${t.Train_Name ?? ''}` }));

  // Stats: .toLowerCase() to handle any Zoho casing
  const confirmed = rows.filter(r => (r.Booking_Status ?? '').toLowerCase() === 'confirmed').length;
  const pending   = rows.filter(r => (r.Booking_Status ?? '').toLowerCase() === 'pending').length;
  const cancelled = rows.filter(r => (r.Booking_Status ?? '').toLowerCase() === 'cancelled').length;
  const paid      = rows.filter(r => (r.Payment_Status ?? '').toLowerCase() === 'paid').length;

  // Filter: proper text search + case-insensitive status filter
  const filtered = rows.filter(r => {
    const matchSearch = !search || rowSearchText(r).includes(search.toLowerCase());
    const matchStatus = !statusFilter || (r.Booking_Status ?? '').toLowerCase() === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate(f) {
    const e = {};
    if (!f.Trains)        e.Trains          = 'Required';
    if (!f.Users)         e.Users           = 'Required';
    if (!f.Journey_Date)  e.Journey_Date    = 'Required';
    if (!f.Passenger_Count || Number(f.Passenger_Count) < 1) e.Passenger_Count = 'Must be ≥ 1';
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
      const nowZoho = toZohoDateTime(new Date().toISOString().slice(0, 16));
      const payload = {
        Trains:          form.Trains,
        Users:           form.Users,
        Class:           form.Class,
        // Journey_Date is date-only input ("YYYY-MM-DD") → convert to Zoho format
        Journey_Date: form.Journey_Date, 
        Passenger_Count: Number(form.Passenger_Count),
        Boarding_Station: form.Boarding_Station,
        Deboarding_Station: form.Deboarding_Station,
        Total_Fare:      form.Total_Fare ? Number(form.Total_Fare) : 0,
        Booking_Time:    nowZoho,
        Booking_Status:  form.Booking_Status || 'pending',
        Payment_Status:  form.Payment_Status || 'unpaid',
        Quota:           form.Quota || 'GN',
        ...(modal === 'edit' && editRow?.PNR ? { PNR: editRow.PNR } : {}),
      };
      const res = modal === 'create'
        ? await bookingsApi.create(payload)
        : await bookingsApi.update(getRecordId(editRow), payload);
      if (res?.success === false) { setApiErr(res); }
      else {
        addToast(modal === 'create' ? 'Booking created ✓' : 'Booking updated ✓', 'success');
        setModal(null); refetch();
      }
    } catch (err) { addToast(err.message || 'Failed', 'error'); }
    setSaving(false);
  };

  const handleDelete = async row => {
    try {
      const res = await bookingsApi.delete(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Booking deleted', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Delete failed', 'error'); }
  };

  const handleConfirm = async row => {
    try {
      const res = await bookingsApi.confirm(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast('Booking confirmed ✓', 'success'); refetch();
    } catch (err) { addToast(err.message || 'Confirm failed', 'error'); }
  };

  const handleMarkPaid = async row => {
    try {
      const res = await bookingsApi.markPaid(getRecordId(row));
      if (res?.success === false) throw new Error(res.error || res.message);
      addToast("Payment marked as paid ✓", "success"); refetch();
    } catch (err) { addToast(err.message || "Mark paid failed", "error"); }
  };

  return (
    <div>
      <PageHeader icon="booking" iconAccent="var(--accent-amber)" title="Bookings" subtitle={`${rows.length} bookings`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetch}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-amber)" onClick={openCreate}>New Booking</Button>
      </PageHeader>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { l: 'Confirmed', v: confirmed, c: '#4ade80' },
          { l: 'Pending',   v: pending,   c: '#fbbf24' },
          { l: 'Cancelled', v: cancelled, c: '#f87171' },
          { l: 'Paid',      v: paid,      c: '#60a5fa' },
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
            placeholder="Search by PNR, train, passenger, date…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 320 }}
          />
          <select
            value={statusFilter}
            onChange={e => setStatus(e.target.value)}
            style={{ padding: '9px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-secondary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', cursor: 'pointer' }}
          >
            <option value="">All Statuses</option>
            {STATUS_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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
          onConfirm={handleConfirm}
          onMarkPaid={handleMarkPaid}
        />
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Showing {filtered.length} of {rows.length}</span>
        </div>
      </Card>

      {modal && (
        <Modal
          title={modal === 'create' ? 'New Booking' : `Edit Booking — ${editRow?.PNR ?? ''}`}
          onClose={() => setModal(null)}
          width={560}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            <Dropdown
              label="Train" name="Trains" value={form.Trains}
              onChange={handleChange} required
              options={trainOptions} placeholder="Select a train"
              error={errors.Trains}
            />
            <Dropdown
              label="Passenger" name="Users" value={form.Users}
              onChange={handleChange} required
              options={userOptions} placeholder="Select a passenger"
              error={errors.Users}
            />

            <FormRow cols={2}>
              <Field
                label="Journey Date" name="Journey_Date"
                value={form.Journey_Date} onChange={handleChange}
                type="date" required error={errors.Journey_Date}
              />
              <Field
                label="No. of Passengers" name="Passenger_Count"
                value={form.Passenger_Count} onChange={handleChange}
                type="number" error={errors.Passenger_Count}
              />
            </FormRow>

            <FormRow cols={2}>
              <Field
                label="Boarding Station" name="Boarding_Station"
                value={form.Boarding_Station} onChange={handleChange}
                placeholder="Station Code"
              />
              <Field
                label="Deboarding Station" name="Deboarding_Station"
                value={form.Deboarding_Station} onChange={handleChange}
                placeholder="Station Code"
              />
            </FormRow>

            <FormRow cols={2}>
              <Dropdown
                label="Seat Class" name="Class"
                value={form.Class} onChange={handleChange}
                options={CLASS_OPTS} placeholder={false} required
              />
              <Dropdown
                label="Quota" name="Quota"
                value={form.Quota} onChange={handleChange}
                options={QUOTA_OPTS} placeholder={false}
              />
            </FormRow>

            <FormRow cols={2}>
              <Field
                label="Total Fare ₹" name="Total_Fare"
                value={form.Total_Fare} onChange={handleChange}
                type="number" placeholder="Auto-calculated"
              />
              <Field
                label="Coach & Seats" name="Seat_Numbers"
                value={form.Seat_Numbers} onChange={handleChange}
                placeholder="e.g. B1-21, B1-22" mono
              />
            </FormRow>

            <FormDivider label="Status" />
            <FormRow cols={2}>
              <Dropdown
                label="Booking Status" name="Booking_Status"
                value={form.Booking_Status} onChange={handleChange}
                options={STATUS_OPTS} placeholder={false}
              />
              <Dropdown
                label="Payment Status" name="Payment_Status"
                value={form.Payment_Status} onChange={handleChange}
                options={PAYMENT_OPTS} placeholder={false}
              />
            </FormRow>

            <FormApiError response={apiErr} />
            <DebugRecord row={editRow} />
            <FormActions
              onCancel={() => setModal(null)}
              onSubmit={handleSave}
              loading={saving}
              submitLabel={modal === 'create' ? 'Create Booking' : 'Save Changes'}
              accent="var(--accent-amber)"
            />
          </div>
        </Modal>
      )}

      {/* ── View Modal ── */}
      {modal === 'view' && editRow && (
        <Modal title={`👁 Booking Details: ${editRow.PNR || 'N/A'}`} onClose={() => setModal(null)} width={640}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontFamily: "'Inter', sans-serif", color: 'var(--text-secondary)', fontSize: 13 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'var(--bg-inset)', padding: 16, borderRadius: 8 }}>
              <div><strong style={{ color: 'var(--text-primary)' }}>PNR:</strong> {editRow.PNR || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Status:</strong> {editRow.Booking_Status}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>Passenger:</strong> {resolveValue(editRow, '_user')}</div>
              <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: 'var(--text-primary)' }}>Train:</strong> {resolveValue(editRow, '_train')}</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Journey Date:</strong> {displayZohoDate(editRow.Journey_Date)}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Class:</strong> {editRow.Class} ({editRow.Quota || 'GN'})</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Pax Count:</strong> {editRow.Passenger_Count}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Total Fare:</strong> ₹{editRow.Total_Fare}</div>
              
              <div><strong style={{ color: 'var(--text-primary)' }}>Boarding:</strong> {editRow.Boarding_Station || '—'}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Deboarding:</strong> {editRow.Deboarding_Station || '—'}</div>

              <div><strong style={{ color: 'var(--text-primary)' }}>Coach/Seats:</strong> {editRow.Seat_Numbers || (editRow.Coach_Number ? `${editRow.Coach_Number} ...` : '—')}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Refund Amount:</strong> ₹{editRow.Refund_Amount || '0'}</div>

              <div><strong style={{ color: 'var(--text-primary)' }}>Payment Status:</strong> {editRow.Payment_Status}</div>
              <div><strong style={{ color: 'var(--text-primary)' }}>Booking Time:</strong> {editRow.Booking_Time ? String(editRow.Booking_Time) : '—'}</div>
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