import { useState } from 'react';
import { inventoryApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Button, Card, Input, Spinner } from '../components/UI';
import { FormRow } from '../components/FormFields';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

function today() { return new Date().toISOString().split('T')[0]; }

function StatCard({ label, value, color = '#fff' }) {
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: MONO }}>{value}</div>
    </div>
  );
}

export default function InventoryPage() {
  const { addToast } = useToast();
  const [trainId, setTrainId] = useState('');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleSearch = async () => {
    if (!trainId || !date) {
      addToast('Train ID and Date are required', 'warning');
      return;
    }
    setLoading(true);
    setSummary(null);
    setError(null);
    try {
      const res = await inventoryApi.getSummary(trainId, date);
      if (res.success) {
        setSummary(res.data);
      } else {
        throw new Error(res.error || 'Failed to fetch inventory summary');
      }
    } catch (err) {
      setError(err.message);
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <PageHeader
        icon="inventory"
        iconAccent="var(--accent-green)"
        title="Train Inventory"
        subtitle="View seat availability for any train on a specific date"
      />

      <Card>
        <FormRow cols={3}>
          <Input
            label="Train ID or Number"
            placeholder="e.g., 12678"
            value={trainId}
            onChange={e => setTrainId(e.target.value)}
          />
          <Input
            label="Journey Date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          <div style={{ alignSelf: 'flex-end' }}>
            <Button
              variant="primary"
              accent="var(--accent-green)"
              onClick={handleSearch}
              loading={loading}
              style={{ width: '100%' }}
            >
              <span style={{marginRight: '8px'}}>🔍</span> Search Inventory
            </Button>
          </div>
        </FormRow>
      </Card>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <Spinner size={28} />
        </div>
      )}

      {error && (
        <Card>
          <div style={{ color: '#f87171', textAlign: 'center', fontFamily: FONT }}>
            <strong>Error:</strong> {error}
          </div>
        </Card>
      )}

      {summary && (
        <div>
          <div style={{ margin: '20px 0', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            <StatCard label="Total Capacity" value={summary.total_capacity} color="#3b82f6" />
            <StatCard label="Confirmed" value={summary.total_confirmed} color="#f59e0b" />
            <StatCard label="Available" value={summary.total_available} color="#22c55e" />
            <StatCard label="RAC" value={summary.total_rac} color="#eab308" />
            <StatCard label="Waitlist (WL)" value={summary.total_wl} color="#ef4444" />
          </div>

          <Card padding={0}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, fontFamily: FONT }}>
                Breakdown by Class for Train {summary.train_id} on {summary.journey_date}
              </h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Class', 'Capacity', 'Confirmed', 'Available', 'RAC', 'WL'].map(h => (
                      <th key={h} style={{
                        padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: FONT,
                        borderBottom: '1px solid var(--border)', background: 'var(--bg-inset)', textAlign: 'left'
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(summary.by_class).map(([cls, data]) => (
                    <tr key={cls}>
                      <td style={{ padding: '12px 14px', fontFamily: MONO, fontWeight: 600, color: '#a78bfa' }}>{cls}</td>
                      <td style={{ padding: '12px 14px', fontFamily: MONO }}>{data.capacity}</td>
                      <td style={{ padding: '12px 14px', fontFamily: MONO }}>{data.confirmed}</td>
                      <td style={{ padding: '12px 14px', fontFamily: MONO, color: '#22c55e', fontWeight: 600 }}>{data.available}</td>
                      <td style={{ padding: '12px 14px', fontFamily: MONO }}>{data.rac}</td>
                      <td style={{ padding: '12px 14px', fontFamily: MONO, color: '#f87171' }}>{data.wl}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
