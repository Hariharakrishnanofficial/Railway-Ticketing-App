/**
 * TrainRoutesAdmin.jsx – Professional CRUD for Train Routes
 * Matches MasterDataAdmin design system with PageHeader, Card, Modal, and clean UI.
 */

import { useState, useCallback, useEffect } from 'react';
import { PageHeader, Button, Card, Input, Modal, Spinner } from '../../components/UI';
import { Field, FormRow, FormActions, FormApiError } from '../../components/FormFields';
import { useToast } from '../../context/ToastContext';
import { useApi } from '../../hooks/useApi';

// ─── Style tokens ──────────────────────────────────────────────────────────────
const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

// ─── ROUTES TABLE ─────────────────────────────────────────────────────────────
function RoutesTable({ rows, loading, onEdit, onDelete, deleting }) {
  if (loading) return <Spinner />;
  if (!rows.length) return <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>No train routes found</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontFamily: FONT }}>
        <thead style={{ background: 'var(--bg-inset)', borderBottom: '1px solid var(--border)' }}>
          <tr>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Train</th>
            <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Route Name</th>
            <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Priority</th>
            <th style={{ padding: '10px 16px', textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const trainDisplay = typeof row.Trains === 'object' ? (row.Trains?.display_value || row.Trains?.ID || '—') : (row.Trains || '—');
            return (
              <tr key={row.ID || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg-inset)' : 'transparent' }}>
                <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>{trainDisplay}</td>
                <td style={{ padding: '10px 16px', color: 'var(--text-primary)' }}>{row.Route_Name || '—'}</td>
                <td style={{ padding: '10px 16px', color: 'var(--text-primary)', textAlign: 'center', fontFamily: MONO, fontWeight: 600 }}>
                  {row.Route_Priority || '—'}
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── ROUTE FORM MODAL ──────────────────────────────────────────────────────────
function RouteForm({ row, onClose, onRefresh }) {
  const { addToast } = useToast();
  const [form, setForm] = useState(row ? { ...row } : {});
  const [trains, setTrains] = useState([]);
  const [saving, setSaving] = useState(false);
  const [apiErr, setApiErr] = useState(null);

  useEffect(() => {
    fetchAvailableTrains();
  }, []);

  const fetchAvailableTrains = async () => {
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const response = await fetch('/api/trains', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      setTrains(Array.isArray(data) ? data : (data?.data || []));
    } catch (error) {
      console.error('Failed to fetch trains:', error);
    }
  };

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
        Trains: form.Trains,
        Route_Name: form.Route_Name,
        Route_Priority: form.Route_Priority ? parseInt(form.Route_Priority) : 1,
      };

      const method = row?.ID ? 'PUT' : 'POST';
      const url = row?.ID ? `/api/train-routes/${row.ID}` : '/api/train-routes';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        setApiErr(err);
        addToast(err.error || 'Failed to save route', 'error');
        return;
      }

      addToast(row?.ID ? 'Route updated ✓' : 'Route created ✓', 'success');
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
    <Modal title={row?.ID ? `✏ Edit Route` : '➕ Add New Train Route'} onClose={onClose} width={480}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {apiErr && <FormApiError error={apiErr} />}
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: 6 }}>
            Train <span style={{ color: '#ef4444' }}>*</span>
          </label>
          <select
            name="Trains"
            required
            value={form.Trains || ''}
            onChange={handleChange}
            style={{
              width: '100%', padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)',
              borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, fontFamily: FONT, outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="">Select a train...</option>
            {Array.isArray(trains) && trains.map((train) => (
              <option key={train.ID} value={train.ID}>
                {train.Train_Name || train.ID}
              </option>
            ))}
          </select>
        </div>
        <Field label="Route Name" name="Route_Name" value={form.Route_Name || ''}
          onChange={handleChange} placeholder="e.g., HWH-CSTM Express" />
        <Field label="Priority Order (lower = higher)" name="Route_Priority" value={form.Route_Priority || 1}
          onChange={handleChange} type="number" min="1" />
        <FormActions save="Save" cancel="Cancel" onSave={handleSubmit} onCancel={onClose} saving={saving} />
      </form>
    </Modal>
  );
}

// ─── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function TrainRoutesAdmin() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [deleting, setDeleting] = useState(null);

  // ── Fetch routes ──
  const fetchRoutes = useCallback(() =>
    fetch('/api/train-routes', { headers: { 'Authorization': `Bearer ${sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken')}` } })
      .then(r => r.json())
      .then(d => {
        const result = Array.isArray(d) ? d : (d?.data?.data || d?.data || []);
        return { success: true, data: result };
      })
      .catch(e => ({ success: false, data: [], error: e.message })),
    []
  );
  const { data: routesData, loading: routesLoading, refetch: refetchRoutes } = useApi(fetchRoutes);
  const routes = Array.isArray(routesData?.data) ? routesData.data : [];
  const filteredRoutes = routes.filter(r => 
    (typeof r.Trains === 'object' ? (r.Trains?.display_value || r.Trains?.ID || '') : (r.Trains || ''))
      .toLowerCase().includes(search.toLowerCase()) ||
    (r.Route_Name || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAddNew = () => {
    setEditRow(null);
    setModal({ type: 'route' });
  };

  const handleEdit = (row) => {
    setEditRow(row);
    setModal({ type: 'route', row });
  };

  const handleDelete = async (row) => {
    setDeleting(row.ID);
    try {
      const token = sessionStorage.getItem('rail_access_token') || localStorage.getItem('authToken');
      const response = await fetch(`/api/train-routes/${row.ID}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (response.ok) {
        addToast('Route deleted ✓', 'success');
        refetchRoutes();
      } else {
        addToast('Failed to delete route', 'error');
      }
    } catch (error) {
      addToast(error.message, 'error');
    } finally {
      setDeleting(null);
    }
  };

  const handleModalClose = () => setModal(null);

  return (
    <div>
      <PageHeader icon="train" iconAccent="var(--accent-blue)"
        title="Train Routes"
        subtitle={`${routes.length} route${routes.length !== 1 ? 's' : ''} configured`}>
        <Button icon="refresh" variant="ghost" size="sm" onClick={refetchRoutes}>Refresh</Button>
        <Button icon="plus" variant="primary" accent="var(--accent-blue)" onClick={handleAddNew}>
          Add New Route
        </Button>
      </PageHeader>

      <Card padding={0}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'center' }}>
          <Input icon="search" placeholder="Search by train or route name..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 360, flex: '1 1 220px' }} />
          <span style={{ fontSize: 12, color: '#6b7280', fontFamily: FONT, flexShrink: 0 }}>
            {filteredRoutes.length} of {routes.length}
          </span>
        </div>
        <RoutesTable rows={filteredRoutes} loading={routesLoading} onEdit={handleEdit} onDelete={handleDelete} deleting={deleting} />
      </Card>

      {modal && modal.type === 'route' && <RouteForm row={modal.row} onClose={handleModalClose} onRefresh={refetchRoutes} />}
    </div>
  );
}
