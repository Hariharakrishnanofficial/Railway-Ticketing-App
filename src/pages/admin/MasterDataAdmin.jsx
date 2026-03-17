/**
 * MasterDataAdmin.jsx — Professional CRUD for Quotas, Fares, Inventory
 * Matches TrainsPage design system with PageHeader, Card, Modal, and clean UI.
 */

import { useState, useCallback } from 'react';
import { PageHeader, Button, Card, Input, Modal, Spinner } from '../../components/UI';
import { Field, FormRow, FormActions, FormApiError } from '../../components/FormFields';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';

// ─── Style tokens ──────────────────────────────────────────────────────────────
const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

// ─── Tab Navigation ────────────────────────────────────────────────────────────
function TabNav({ activeTab, onTabChange, quotaCount, fareCount, inventoryCount }) {
  const tabs = [
    { id: 'quotas', label: 'Quotas', count: quotaCount },
    { id: 'fares', label: 'Fares', count: fareCount },
    { id: 'inventory', label: 'Inventory', count: inventoryCount },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
      {tabs.map(tab => (
        <button key={tab.id}
          onClick={() => onTabChange(tab.id)}
          style={{
            padding: '12px 16px', border: 'none', background: 'transparent',
            borderBottom: activeTab === tab.id ? '2px solid var(--accent-blue)' : 'transparent',
            color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-muted)',
            fontSize: 13, fontWeight: activeTab === tab.id ? 600 : 500, fontFamily: FONT,
            cursor: 'pointer', transition: 'all 0.2s',
          }}>
          {tab.label} <span style={{fontSize: 11, opacity: 0.7}}>({tab.count})</span>
        </button>
      ))}
    </div>
  );
}

// ─── QUOTAS TABLE ──────────────────────────────────────────────────────────────
function QuotasTable({ rows, loading, onEdit, onDelete, deleting }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>No quotas found</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
        <thead style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)' }}>
          <tr>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Name</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Code</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Seats</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Concession %</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Priority</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
            <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ID || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg-inset)' : 'transparent' }}>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{row.Quota_Name || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: MONO }}>{row.Quota_Code || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right' }}>{row.Seats_Allocated || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right' }}>{row.Concession_Percent || 0}%</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'center' }}>{row.Priority_Order || '—'}</td>
              <td style={{ padding: '10px 16px' }}>
                <span style={{
                  display: 'inline-block', padding: '4px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: row.Is_Active ? 'rgba(34,197,94,0.1)' : 'rgba(107,114,128,0.1)',
                  color: row.Is_Active ? '#22c55e' : '#6b7280',
                }}>
                  {row.Is_Active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button onClick={() => onEdit(row)} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(59,130,246,0.06)', color: '#3b82f6',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    ✏ Edit
                  </button>
                  <button onClick={() => onDelete(row)} disabled={deleting === row.ID} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(239,68,68,0.06)', color: deleting === row.ID ? '#6b7280' : '#f87171',
                    fontSize: 11, fontWeight: 600, cursor: deleting === row.ID ? 'not-allowed' : 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { if (deleting !== row.ID) { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = '#ef4444'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    {deleting === row.ID ? '…' : '✕ Del'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── FARES TABLE ──────────────────────────────────────────────────────────────
function FaresTable({ rows, loading, onEdit, onDelete, deleting }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>No fares found</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
        <thead style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)' }}>
          <tr>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Class</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>From</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>To</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Distance (KM)</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Base Fare (₹)</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Superfast (₹)</th>
            <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ID || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg-inset)' : 'transparent' }}>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{row.Class || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: MONO, fontSize: 12 }}>{typeof row.From_Station === 'object' ? row.From_Station?.display_value || '—' : (row.From_Station || '—')}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: MONO, fontSize: 12 }}>{typeof row.To_Station === 'object' ? row.To_Station?.display_value || '—' : (row.To_Station || '—')}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right' }}>{row.Distance_KM || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right', fontFamily: MONO, fontWeight: 500 }}>₹{row.Base_Fare || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right', fontFamily: MONO, fontWeight: 500 }}>₹{row.Superfast_Surcharge || 0}</td>
              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button onClick={() => onEdit(row)} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(59,130,246,0.06)', color: '#3b82f6',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    ✏ Edit
                  </button>
                  <button onClick={() => onDelete(row)} disabled={deleting === row.ID} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(239,68,68,0.06)', color: deleting === row.ID ? '#6b7280' : '#f87171',
                    fontSize: 11, fontWeight: 600, cursor: deleting === row.ID ? 'not-allowed' : 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { if (deleting !== row.ID) { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = '#ef4444'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    {deleting === row.ID ? '…' : '✕ Del'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── INVENTORY TABLE ───────────────────────────────────────────────────────────
function InventoryTable({ rows, loading, onEdit, onDelete, deleting }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>No inventory found</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
        <thead style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)' }}>
          <tr>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Item Name</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Code</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Category</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Quantity</th>
            <th style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--text-muted)' }}>Unit Cost (₹)</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Unit</th>
            <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={row.ID || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg-inset)' : 'transparent' }}>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{row.Item_Name || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontFamily: MONO }}>{row.Item_Code || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{row.Category || '—'}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right' }}>{row.Quantity_Available || 0}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'right', fontFamily: MONO, fontWeight: 500 }}>₹{row.Unit_Cost || 0}</td>
              <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{row.Unit || '—'}</td>
              <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                  <button onClick={() => onEdit(row)} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(59,130,246,0.06)', color: '#3b82f6',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.18)'; e.currentTarget.style.borderColor = '#2563eb'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(59,130,246,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    ✏ Edit
                  </button>
                  <button onClick={() => onDelete(row)} disabled={deleting === row.ID} style={{
                    padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border)',
                    background: 'rgba(239,68,68,0.06)', color: deleting === row.ID ? '#6b7280' : '#f87171',
                    fontSize: 11, fontWeight: 600, cursor: deleting === row.ID ? 'not-allowed' : 'pointer', fontFamily: FONT,
                    transition: 'all 0.15s',
                  }} onMouseEnter={e => { if (deleting !== row.ID) { e.currentTarget.style.background = 'rgba(239,68,68,0.18)'; e.currentTarget.style.borderColor = '#ef4444'; } }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.06)'; e.currentTarget.style.borderColor = 'var(--border)'; }}>
                    {deleting === row.ID ? '…' : '✕ Del'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── QUOTA FORM MODAL ──────────────────────────────────────────────────────────
function QuotaForm({ row, onClose, onRefresh }) {
  const { addToast } = useToast();
  const [form, setForm] = useState(row ? { ...row } : {});
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const payload = {
        Quota_Name: form.Quota_Name,
        Quota_Code: form.Quota_Code,
        Seats_Allocated: form.Seats_Allocated ? parseInt(form.Seats_Allocated) : 0,
        Concession_Percent: form.Concession_Percent ? parseInt(form.Concession_Percent) : 0,
        Priority_Order: form.Priority_Order ? parseInt(form.Priority_Order) : 0,
        Is_Active: form.Is_Active || false,
      };

      const method = row?.ID ? 'PUT' : 'POST';
      const url = row?.ID ? `/api/quotas/${row.ID}` : '/api/quotas';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        setApiErr(err);
        addToast(err.error || 'Failed to save quota', 'error');
        return;
      }

      addToast(row?.ID ? 'Quota updated ✓' : 'Quota created ✓', 'success');
      onRefresh?.();
      onClose();
    } catch (error) {
      setApiErr({ error: error.message });
      addToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={row?.ID ? `✏ Edit: ${row.Quota_Name}` : '➕ Add New Quota'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {apiErr && <FormApiError error={apiErr} />}
        <Field label="Quota Name *" name="Quota_Name" value={form.Quota_Name || ''}
          onChange={handleChange} required placeholder="e.g., Senior Citizen" />
        <Field label="Quota Code" name="Quota_Code" value={form.Quota_Code || ''}
          onChange={handleChange} placeholder="e.g., SC" />
        <FormRow cols={2}>
          <Field label="Seats Allocated" name="Seats_Allocated" value={form.Seats_Allocated || ''}
            onChange={handleChange} type="number" placeholder="e.g. 50" />
          <Field label="Concession %" name="Concession_Percent" value={form.Concession_Percent || ''}
            onChange={handleChange} type="number" min="0" max="100" placeholder="e.g. 15" />
        </FormRow>
        <Field label="Priority Order" name="Priority_Order" value={form.Priority_Order || ''}
          onChange={handleChange} type="number" placeholder="e.g. 1" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="quota_active" name="Is_Active" checked={form.Is_Active || false}
            onChange={handleChange} style={{ width: 18, height: 18, accentColor: 'var(--accent-blue)', cursor: 'pointer' }} />
          <label htmlFor="quota_active" style={{ fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 500 }}>
            Active
          </label>
        </div>
        <FormActions save="Save" cancel="Cancel" onSave={handleSubmit} onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ─── FARE FORM MODAL ──────────────────────────────────────────────────────────
function FareForm({ row, onClose, onRefresh }) {
  const { addToast } = useToast();
  const [form, setForm] = useState(row ? { ...row } : {});
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const payload = {
        Class: form.Class,
        From_Station: form.From_Station,
        To_Station: form.To_Station,
        Distance_KM: form.Distance_KM ? parseInt(form.Distance_KM) : 0,
        Base_Fare: form.Base_Fare ? parseInt(form.Base_Fare) : 0,
        Superfast_Surcharge: form.Superfast_Surcharge ? parseInt(form.Superfast_Surcharge) : 0,
      };

      const method = row?.ID ? 'PUT' : 'POST';
      const url = row?.ID ? `/api/fares/${row.ID}` : '/api/fares';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        setApiErr(err);
        addToast(err.error || 'Failed to save fare', 'error');
        return;
      }

      addToast(row?.ID ? 'Fare updated ✓' : 'Fare created ✓', 'success');
      onRefresh?.();
      onClose();
    } catch (error) {
      setApiErr({ error: error.message });
      addToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={row?.ID ? `✏ Edit Fare` : '➕ Add New Fare'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {apiErr && <FormApiError error={apiErr} />}
        <Field label="Class *" name="Class" value={form.Class || ''}
          onChange={handleChange} required placeholder="e.g., AC 2-Tier" />
        <FormRow cols={2}>
          <Field label="From Station" name="From_Station" value={form.From_Station || ''}
            onChange={handleChange} placeholder="e.g., HWH" />
          <Field label="To Station" name="To_Station" value={form.To_Station || ''}
            onChange={handleChange} placeholder="e.g., CSTM" />
        </FormRow>
        <FormRow cols={2}>
          <Field label="Distance (KM)" name="Distance_KM" value={form.Distance_KM || ''}
            onChange={handleChange} type="number" placeholder="e.g. 2000" />
          <Field label="Base Fare (₹) *" name="Base_Fare" value={form.Base_Fare || ''}
            onChange={handleChange} required type="number" placeholder="e.g. 500" />
        </FormRow>
        <Field label="Superfast Surcharge (₹)" name="Superfast_Surcharge" value={form.Superfast_Surcharge || ''}
          onChange={handleChange} type="number" placeholder="e.g. 50" />
        <FormActions save="Save" cancel="Cancel" onSave={handleSubmit} onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ─── INVENTORY FORM MODAL ─────────────────────────────────────────────────────
function InventoryForm({ row, onClose, onRefresh }) {
  const { addToast } = useToast();
  const [form, setForm] = useState(row ? { ...row } : {});
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setSaving(true);
    setApiErr(null);
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const payload = {
        Item_Name: form.Item_Name,
        Item_Code: form.Item_Code,
        Category: form.Category,
        Quantity_Available: form.Quantity_Available ? parseInt(form.Quantity_Available) : 0,
        Unit_Cost: form.Unit_Cost ? parseInt(form.Unit_Cost) : 0,
        Unit: form.Unit,
      };

      const method = row?.ID ? 'PUT' : 'POST';
      const url = row?.ID ? `/api/inventory/${row.ID}` : '/api/inventory';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        setApiErr(err);
        addToast(err.error || 'Failed to save inventory', 'error');
        return;
      }

      addToast(row?.ID ? 'Inventory updated ✓' : 'Inventory created ✓', 'success');
      onRefresh?.();
      onClose();
    } catch (error) {
      setApiErr({ error: error.message });
      addToast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={row?.ID ? `✏ Edit: ${row.Item_Name}` : '➕ Add New Inventory Item'} onClose={onClose} width={520}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {apiErr && <FormApiError error={apiErr} />}
        <Field label="Item Name *" name="Item_Name" value={form.Item_Name || ''}
          onChange={handleChange} required placeholder="e.g., Mineral Water" />
        <Field label="Item Code" name="Item_Code" value={form.Item_Code || ''}
          onChange={handleChange} placeholder="e.g., MW-500ML" />
        <FormRow cols={2}>
          <Field label="Category" name="Category" value={form.Category || ''}
            onChange={handleChange} placeholder="e.g., Beverages" />
          <Field label="Unit" name="Unit" value={form.Unit || ''}
            onChange={handleChange} placeholder="e.g., bottle" />
        </FormRow>
        <FormRow cols={2}>
          <Field label="Quantity Available" name="Quantity_Available" value={form.Quantity_Available || ''}
            onChange={handleChange} type="number" placeholder="e.g., 1000" />
          <Field label="Unit Cost (₹)" name="Unit_Cost" value={form.Unit_Cost || ''}
            onChange={handleChange} type="number" placeholder="e.g., 25" />
        </FormRow>
        <FormActions save="Save" cancel="Cancel" onSave={handleSubmit} onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function MasterDataAdmin() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('quotas');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // ── Quotas ──
  const fetchQuotas = useCallback(() =>
    fetch('/api/quotas', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken')}` } })
      .then(r => r.json())
      .then(d => {
        const result = Array.isArray(d) ? d : (d?.data || []);
        return { success: true, data: result };
      })
      .catch(e => ({ success: false, data: [], error: e.message })),
    []
  );
  const { data: quotasData, loading: quotasLoading, refetch: refetchQuotas } = useApi(fetchQuotas);
  const quotas = Array.isArray(quotasData?.data) ? quotasData.data : [];
  const filteredQuotas = quotas.filter(q => (q.Quota_Name || '').toLowerCase().includes(search.toLowerCase()) || (q.Quota_Code || '').toLowerCase().includes(search.toLowerCase()));

  // ── Fares ──
  const fetchFares = useCallback(() =>
    fetch('/api/fares', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken')}` } })
      .then(r => r.json())
      .then(d => {
        const result = Array.isArray(d) ? d : (d?.data || []);
        return { success: true, data: result };
      })
      .catch(e => ({ success: false, data: [], error: e.message })),
    []
  );
  const { data: faresData, loading: faresLoading, refetch: refetchFares } = useApi(fetchFares);
  const fares = Array.isArray(faresData?.data) ? faresData.data : [];
  const filteredFares = fares.filter(f => (f.Class || '').toLowerCase().includes(search.toLowerCase()) || (f.From_Station || '').toLowerCase().includes(search.toLowerCase()));

  // ── Inventory ──
  const fetchInventory = useCallback(() =>
    fetch('/api/inventory', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken')}` } })
      .then(r => r.json())
      .then(d => {
        const result = Array.isArray(d) ? d : (d?.data || []);
        return { success: true, data: result };
      })
      .catch(e => ({ success: false, data: [], error: e.message })),
    []
  );
  const { data: inventoryData, loading: inventoryLoading, refetch: refetchInventory } = useApi(fetchInventory);
  const inventory = Array.isArray(inventoryData?.data) ? inventoryData.data : [];
  const filteredInventory = inventory.filter(i => (i.Item_Name || '').toLowerCase().includes(search.toLowerCase()) || (i.Item_Code || '').toLowerCase().includes(search.toLowerCase()));

  const handleAddNew = (type) => {
    setEditRow(null);
    setModal({ type });
  };

  const handleEdit = (row, type) => {
    setEditRow(row);
    setModal({ type, row });
  };

  const handleDelete = async (row, type) => {
    setDeleting(row.ID);
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const url = type === 'quota' ? `/api/quotas/${row.ID}` : type === 'fare' ? `/api/fares/${row.ID}` : `/api/inventory/${row.ID}`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        addToast('Record deleted ✓', 'success');
        if (type === 'quota') refetchQuotas();
        else if (type === 'fare') refetchFares();
        else refetchInventory();
      } else {
        addToast('Failed to delete record', 'error');
      }
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleModalClose = () => setModal(null);

  const handleRefresh = () => {
    if (activeTab === 'quotas') refetchQuotas();
    else if (activeTab === 'fares') refetchFares();
    else refetchInventory();
  };

  return (
    <div>
      <PageHeader icon="database" iconAccent="var(--accent-blue)"
        title="Master Data"
        subtitle={`Quotas: ${quotas.length} | Fares: ${fares.length} | Inventory: ${inventory.length}`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={handleRefresh}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-blue)" onClick={() => handleAddNew(activeTab === 'quotas' ? 'quota' : activeTab === 'fares' ? 'fare' : 'inventory')}>
          Add New {activeTab === 'quotas' ? 'Quota' : activeTab === 'fares' ? 'Fare' : 'Item'}
        </Button>
      </PageHeader>

      <Card padding={0}>
        <TabNav activeTab={activeTab} onTabChange={setActiveTab} quotaCount={quotas.length} fareCount={fares.length} inventoryCount={inventory.length} />
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input icon="search" placeholder={`Search ${activeTab}...`}
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360, flex: '1 1 220px' }} />
          <span style={{ fontSize: 12, color: '#6b7280', fontFamily: FONT, flexShrink: 0 }}>
            {activeTab === 'quotas' && `${filteredQuotas.length} of ${quotas.length}`}
            {activeTab === 'fares' && `${filteredFares.length} of ${fares.length}`}
            {activeTab === 'inventory' && `${filteredInventory.length} of ${inventory.length}`}
          </span>
        </div>

        {activeTab === 'quotas' && <QuotasTable rows={filteredQuotas} loading={quotasLoading} onEdit={r => handleEdit(r, 'quota')} onDelete={r => handleDelete(r, 'quota')} deleting={deleting} />}
        {activeTab === 'fares' && <FaresTable rows={filteredFares} loading={faresLoading} onEdit={r => handleEdit(r, 'fare')} onDelete={r => handleDelete(r, 'fare')} deleting={deleting} />}
        {activeTab === 'inventory' && <InventoryTable rows={filteredInventory} loading={inventoryLoading} onEdit={r => handleEdit(r, 'inventory')} onDelete={r => handleDelete(r, 'inventory')} deleting={deleting} />}
      </Card>

      {modal && modal.type === 'quota' && <QuotaForm row={modal.row} onClose={handleModalClose} onRefresh={refetchQuotas} />}
      {modal && modal.type === 'fare' && <FareForm row={modal.row} onClose={handleModalClose} onRefresh={refetchFares} />}
      {modal && modal.type === 'inventory' && <InventoryForm row={modal.row} onClose={handleModalClose} onRefresh={refetchInventory} />}
    </div>
  );
}
