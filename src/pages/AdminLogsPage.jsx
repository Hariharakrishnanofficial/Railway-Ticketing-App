import { useState, useEffect } from 'react';
import { adminLogsApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Spinner, Input } from '../components/UI';
import { FormRow } from '../components/FormFields';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

function LogTable({ logs, loading }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 24px', color: '#6b7280', fontFamily: FONT }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>📜</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#9ca3af' }}>No logs found</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Try adjusting your filters or wait for new admin actions.</div>
      </div>
    );
  }

  const thS = {
    padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap',
    fontFamily: FONT, borderBottom: '1px solid var(--border)',
    background: 'var(--bg-inset)', textAlign: 'left',
  };
  const tdS = {
    padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)',
    fontFamily: FONT, borderBottom: '1px solid #0d1017', verticalAlign: 'middle',
  };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['Timestamp', 'User', 'Action', 'Summary', 'Affected Record', 'Source IP'].map(h => (
              <th key={h} style={thS}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map(log => (
            <tr key={log.ID}>
              <td style={{ ...tdS, fontFamily: MONO, whiteSpace: 'nowrap' }}>{log.Timestamp}</td>
              <td style={{ ...tdS }}>{log.User_Name}</td>
              <td style={{ ...tdS, fontFamily: MONO, color: '#a78bfa' }}>{log.Action}</td>
              <td style={{ ...tdS, maxWidth: 400 }}>{log.Summary}</td>
              <td style={{ ...tdS, fontFamily: MONO }}>{log.Affected_Record_ID}</td>
              <td style={{ ...tdS, fontFamily: MONO }}>{log.Source_IP}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminLogsPage() {
  const { addToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ user_id: '', action: '', record_id: '' });

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await adminLogsApi.getAll(filters);
      if (res.success) {
        setLogs(res.data);
      } else {
        throw new Error(res.error || 'Failed to fetch logs');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(f => ({ ...f, [name]: value }));
  };

  const handleFilterSubmit = (e) => {
    e.preventDefault();
    fetchLogs();
  };

  return (
    <div>
      <PageHeader
        icon="shield"
        iconAccent="var(--accent-red)"
        title="Admin Logs"
        subtitle="Audit trail of all administrative actions"
      />

      <Card>
        <form onSubmit={handleFilterSubmit}>
          <FormRow cols={4}>
            <Input
              label="User ID"
              name="user_id"
              placeholder="Filter by User ID"
              value={filters.user_id}
              onChange={handleFilterChange}
            />
            <Input
              label="Action"
              name="action"
              placeholder="e.g., create_train"
              value={filters.action}
              onChange={handleFilterChange}
            />
            <Input
              label="Affected Record ID"
              name="record_id"
              placeholder="Filter by Record ID"
              value={filters.record_id}
              onChange={handleFilterChange}
            />
            <div style={{ alignSelf: 'flex-end' }}>
              <button type="submit" style={{
                  width: '100%', padding: '10px 14px', background: '#1e2433', border: '1px solid #374151',
                  borderRadius: 8, color: '#d1d5db', fontSize: 13, fontFamily: FONT, cursor: 'pointer'
              }}>
                Filter Logs
              </button>
            </div>
          </FormRow>
        </form>
      </Card>

      <Card padding={0} style={{ marginTop: 20 }}>
        <LogTable logs={logs} loading={loading} />
      </Card>
    </div>
  );
}
