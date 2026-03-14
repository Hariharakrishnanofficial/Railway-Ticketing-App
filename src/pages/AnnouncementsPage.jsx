/**
 * AnnouncementsPage.jsx — Admin CRUD for announcements
 */
import { useState, useEffect, useCallback } from 'react';
import { announcementsApi, extractRecords, getRecordId } from '../services/api';
import { Card, PageHeader, Badge, Button, Spinner, EmptyState } from '../components/UI';
import { Field, Dropdown } from '../components/FormFields';
import { useToast } from '../context/ToastContext';

export default function AnnouncementsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ Title: '', Message: '', Priority: 'Normal', Is_Active: true, Start_Date: '', End_Date: '' });
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await announcementsApi.getAll();
      setRecords(extractRecords(res));
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await announcementsApi.update(editId, form);
        toast.success('Announcement updated');
      } else {
        await announcementsApi.create(form);
        toast.success('Announcement created');
      }
      resetForm();
      load();
    } catch (e) { toast.error(e.message); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this announcement?')) return;
    try {
      await announcementsApi.delete(id);
      toast.success('Deleted');
      load();
    } catch (e) { toast.error(e.message); }
  };

  const startEdit = (r) => {
    setEditId(getRecordId(r));
    setForm({
      Title: r.Title || '',
      Message: r.Message || '',
      Priority: r.Priority || 'Normal',
      Is_Active: r.Is_Active !== false && r.Is_Active !== 'false',
      Start_Date: r.Start_Date || '',
      End_Date: r.End_Date || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm({ Title: '', Message: '', Priority: 'Normal', Is_Active: true, Start_Date: '', End_Date: '' });
  };

  const [detailModal, setDetailModal] = useState(null);

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Announcements" subtitle="Manage system-wide and train/station notices">
        <Button onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '+ New Announcement'}</Button>
      </PageHeader>

      {showForm && (
        <Card style={{ marginBottom: '1.5rem' }}>
          <form onSubmit={handleSubmit}>
            <Field label="Title" value={form.Title} onChange={e => setForm({ ...form, Title: e.target.value })} required />
            <div style={{ marginBottom: '1rem', marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Message<span style={{ color: 'var(--accent-amber)', marginLeft: 3 }}>*</span></label>
              <textarea value={form.Message} onChange={e => setForm({ ...form, Message: e.target.value })} required rows={4} style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', outline: 'none', resize: 'vertical' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
              <Dropdown label="Priority" value={form.Priority} onChange={e => setForm({ ...form, Priority: e.target.value })}
                options={[{ value: 'Low', label: 'Low' }, { value: 'Normal', label: 'Normal' }, { value: 'High', label: 'High' }, { value: 'Critical', label: 'Critical' }]} />
              <Field label="Start Date" type="date" value={form.Start_Date} onChange={e => setForm({ ...form, Start_Date: e.target.value })} />
              <Field label="End Date" type="date" value={form.End_Date} onChange={e => setForm({ ...form, End_Date: e.target.value })} />
            </div>
            <div style={{ marginTop: '1rem' }}>
              <Button type="submit">{editId ? 'Update' : 'Create'}</Button>
              {editId && <Button type="button" variant="ghost" onClick={resetForm} style={{ marginLeft: '0.5rem' }}>Cancel Edit</Button>}
            </div>
          </form>
        </Card>
      )}

      {records.length === 0 ? <EmptyState message="No announcements yet" /> : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {records.map(r => (
            <Card key={getRecordId(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: '0 0 0.25rem' }}>{r.Title}</h3>
                <p style={{ margin: '0 0 0.5rem', opacity: 0.8 }}>{r.Message}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <Badge status={r.Priority || 'Normal'} />
                  <Badge status={r.Is_Active === false || r.Is_Active === 'false' ? 'Inactive' : 'Active'} />
                  {r.Start_Date && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>From: {r.Start_Date}</span>}
                  {r.End_Date && <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>To: {r.End_Date}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button variant="ghost" size="sm" onClick={() => setDetailModal(r)}>View</Button>
                <Button variant="ghost" size="sm" onClick={() => startEdit(r)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => handleDelete(getRecordId(r))}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {detailModal && (
        <Modal title="Announcement Details" onClose={() => setDetailModal(null)} width={500}>
          <div style={{ padding: '1rem 0' }}>
            <h2 style={{ margin: '0 0 1rem' }}>{detailModal.Title}</h2>
            <div style={{ background: 'var(--bg-inset)', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', whiteSpace: 'pre-wrap' }}>
              {detailModal.Message}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
              <div><strong>Priority:</strong> {detailModal.Priority}</div>
              <div><strong>Status:</strong> {detailModal.Is_Active === false || detailModal.Is_Active === 'false' ? 'Inactive' : 'Active'}</div>
              <div><strong>Start Date:</strong> {detailModal.Start_Date || '—'}</div>
              <div><strong>End Date:</strong> {detailModal.End_Date || '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <Button variant="secondary" onClick={() => setDetailModal(null)}>Close</Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
