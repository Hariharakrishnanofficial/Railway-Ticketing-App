/**
 * ReportsPage.jsx — Admin revenue and occupancy reports
 * Enhanced with detail popups for drill-down analytics.
 */
import { useState } from 'react';
import { reportsApi, displayZohoDate } from '../services/api';
import { Card, PageHeader, Button, Spinner, EmptyState, Modal } from '../components/UI';
import { Field } from '../components/FormFields';
import { useToast } from '../context/ToastContext';

export default function ReportsPage() {
  const [tab, setTab] = useState('revenue');
  const [loading, setLoading] = useState(false);
  const [revenueData, setRevenueData] = useState(null);
  const [occupancyData, setOccupancyData] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [occDate, setOccDate] = useState('');
  
  // Detail Modal State
  const [detailModal, setDetailModal] = useState(null); // { type: 'revenue'|'occupancy', title: string, rows: [] }
  const [detailLoading, setDetailLoading] = useState(false);

  const toast = useToast();

  const loadRevenue = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.revenue({ from: fromDate, to: toDate });
      setRevenueData(res?.data || res);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const loadOccupancy = async () => {
    setLoading(true);
    try {
      const res = await reportsApi.occupancy({ date: occDate });
      setOccupancyData(res?.data || res);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const openRevenueDetails = async (className) => {
    setDetailLoading(true);
    try {
      // Fetch full details from backend
      const res = await reportsApi.revenue({ from: fromDate, to: toDate, details: 'true' });
      const allDetails = res?.data?.details || [];
      const filtered = allDetails.filter(b => b.Class === className);
      setDetailModal({
        type: 'revenue',
        title: `Revenue Details: ${className}`,
        rows: filtered
      });
    } catch (e) { toast.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const openOccupancyDetails = async (train) => {
    setDetailLoading(true);
    try {
      const res = await reportsApi.occupancy({ date: occDate, details: 'true' });
      const trainDetails = res?.data?.details?.[train.train_id] || [];
      setDetailModal({
        type: 'occupancy',
        title: `Occupancy Details: ${train.train_number} - ${train.train_name}`,
        rows: trainDetails
      });
    } catch (e) { toast.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const tabStyle = (t) => ({
    padding: '0.75rem 1.5rem',
    cursor: 'pointer',
    borderBottom: tab === t ? '3px solid var(--primary, #6366f1)' : '3px solid transparent',
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? 'var(--primary, #6366f1)' : 'inherit',
    background: 'none',
    border: 'none',
    fontSize: '1rem',
  });

  return (
    <div>
      <PageHeader title="Admin Reports" subtitle="Revenue and occupancy analytics" />

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
        <button style={tabStyle('revenue')} onClick={() => setTab('revenue')}>Revenue Report</button>
        <button style={tabStyle('occupancy')} onClick={() => setTab('occupancy')}>Occupancy Report</button>
      </div>

      {tab === 'revenue' && (
        <div>
          <Card style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="From Date" type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} />
              <Field label="To Date" type="date" value={toDate} onChange={e => setToDate(e.target.value)} />
              <Button onClick={loadRevenue} disabled={loading}>{loading ? 'Loading...' : 'Generate Report'}</Button>
            </div>
          </Card>

          {revenueData && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Revenue</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--success, #22c55e)' }}>₹{(revenueData.total_revenue || 0).toLocaleString()}</div>
                </div>
              </Card>
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Bookings</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{revenueData.total_bookings || 0}</div>
                </div>
              </Card>
              <Card>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Total Passengers</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{revenueData.total_passengers || 0}</div>
                </div>
              </Card>
            </div>
          )}

          {revenueData?.by_class && (
            <Card style={{ marginBottom: '1rem' }}>
              <h3 style={{ margin: '0 0 1rem' }}>Revenue by Class <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.6 }}>(Click row to see details)</span></h3>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Class</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>Revenue</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>Bookings</th>
                    <th style={{ textAlign: 'right', padding: '0.5rem' }}>Passengers</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(revenueData.by_class).map(([cls, d]) => (
                    <tr 
                      key={cls} 
                      onClick={() => openRevenueDetails(cls)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', cursor: 'pointer' }}
                      className="hover-row"
                    >
                      <td style={{ padding: '0.5rem', fontWeight: 600, color: 'var(--primary)' }}>{cls}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>₹{(d.revenue || 0).toLocaleString()}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.bookings || 0}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right' }}>{d.passengers || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {tab === 'occupancy' && (
        <div>
          <Card style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Field label="Date" type="date" value={occDate} onChange={e => setOccDate(e.target.value)} />
              <Button onClick={loadOccupancy} disabled={loading}>{loading ? 'Loading...' : 'Load Occupancy'}</Button>
            </div>
          </Card>

          {occupancyData?.trains?.length > 0 && (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {occupancyData.trains.map(t => (
                <Card 
                  key={t.train_id} 
                  onClick={() => openOccupancyDetails(t)}
                  style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                  className="hover-scale"
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <h3 style={{ margin: 0, color: 'var(--primary)' }}>{t.train_name || t.train_number}</h3>
                      <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{t.train_number}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: t.overall.occupancy_pct > 80 ? '#ef4444' : t.overall.occupancy_pct > 50 ? '#f59e0b' : '#22c55e' }}>
                        {t.overall.occupancy_pct}%
                      </div>
                      <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{t.overall.total_booked}/{t.overall.total_capacity}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {Object.entries(t.classes || {}).map(([cls, d]) => (
                      <div key={cls} style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', fontSize: '0.8rem' }}>
                        <strong>{cls}</strong>: {d.booked}/{d.total} ({d.occupancy_pct}%)
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>Click to view passenger details →</div>
                </Card>
              ))}
            </div>
          )}

          {occupancyData && (!occupancyData.trains || occupancyData.trains.length === 0) && (
            <EmptyState message="No occupancy data available for this date" />
          )}
        </div>
      )}

      {detailModal && (
        <Modal title={detailModal.title} onClose={() => setDetailModal(null)} width={800}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {detailModal.rows.length === 0 ? <EmptyState message="No records found" /> : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-inset)' }}>
                    <th style={{ padding: '10px', textAlign: 'left' }}>PNR</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                    <th style={{ padding: '10px', textAlign: 'left' }}>Passenger</th>
                    <th style={{ padding: '10px', textAlign: 'right' }}>Fare</th>
                    <th style={{ padding: '10px', textAlign: 'center' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detailModal.rows.map((r, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '10px', fontFamily: 'monospace' }}>{r.PNR}</td>
                      <td style={{ padding: '10px' }}>{displayZohoDate(r.Journey_Date)}</td>
                      <td style={{ padding: '10px' }}>
                        {typeof r.Users === 'object' ? r.Users.display_value : r.Users}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right' }}>₹{r.Total_Fare}</td>
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <span style={{ 
                          padding: '2px 8px', borderRadius: '10px', fontSize: '0.7rem',
                          background: r.Booking_Status === 'confirmed' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                          color: r.Booking_Status === 'confirmed' ? '#22c55e' : '#ef4444'
                        }}>
                          {r.Booking_Status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setDetailModal(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {(loading || detailLoading) && <Spinner />}
      
      <style>{`
        .hover-row:hover { background: rgba(99, 102, 241, 0.05); }
        .hover-scale:hover { transform: translateY(-2px); border-color: var(--primary); }
      `}</style>
    </div>
  );
}
