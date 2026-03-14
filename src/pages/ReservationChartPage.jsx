import { useState, useEffect, useMemo } from 'react';
import { bookingsApi, trainsApi, extractRecords } from '../services/api';
import { Card, PageHeader, Button, Spinner, EmptyState, Badge } from '../components/UI';
import { Field, Dropdown } from '../components/FormFields';
import { useToast } from '../context/ToastContext';

export default function ReservationChartPage() {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [search, setSearch] = useState('');
  const [cls, setCls] = useState('');
  const [trains, setTrains] = useState([]);
  const [loadingTrains, setLoadingTrains] = useState(false);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [loadingChart, setLoadingChart] = useState(false);
  const [chartData, setChartData] = useState(null);
  const toast = useToast();

  // Load all trains initially
  useEffect(() => {
    fetchTrains();
  }, []);

  const fetchTrains = async () => {
    setLoadingTrains(true);
    try {
      const res = await trainsApi.getAll({ limit: 500 });
      setTrains(extractRecords(res));
    } catch (e) {
      toast.error('Failed to load trains list');
    } finally {
      setLoadingTrains(false);
    }
  };

  // Filter trains based on date (Run_Days) and search text
  const filteredTrains = useMemo(() => {
    if (!trains.length) return [];
    
    // Day of week for Run_Days matching
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const d = new Date(date);
    const dayName = days[d.getDay()];

    return trains.filter(t => {
      const matchSearch = !search || 
        t.Train_Number?.toLowerCase().includes(search.toLowerCase()) ||
        t.Train_Name?.toLowerCase().includes(search.toLowerCase());
      
      const runsOnDay = !t.Run_Days || t.Run_Days.includes(dayName);
      
      return matchSearch && runsOnDay;
    });
  }, [trains, date, search]);

  const loadChart = async (train) => {
    setSelectedTrain(train);
    setLoadingChart(true);
    setChartData(null);
    try {
      const res = await bookingsApi.chart({ 
        train_id: train.ID, 
        date: date, 
        class: cls 
      });
      setChartData(res?.data || res);
      toast.success(`Chart loaded for ${train.Train_Name}`);
    } catch (e) {
      toast.error(e.message || 'Failed to load chart');
    } finally {
      setLoadingChart(false);
    }
  };

  return (
    <div style={{ paddingBottom: '4rem' }}>
      <PageHeader 
        title="Reservation Chart" 
        subtitle="Select a train and date to view passenger assignments" 
      />

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: '320px 1fr', 
        gap: '1.5rem',
        alignItems: 'start' 
      }}>
        
        {/* LEFT COLUMN: Search & Criteria */}
        <Card style={{ position: 'sticky', top: '2rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1.1rem' }}>Search Criteria</h3>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <Field 
              label="Journey Date" 
              type="date" 
              value={date} 
              onChange={e => {
                setDate(e.target.value);
                setChartData(null);
                setSelectedTrain(null);
              }} 
              required
            />

            <Field 
              label="Filter Trains" 
              placeholder="Number or Name..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />

            <Dropdown 
              label="Coach Class (optional)" 
              value={cls} 
              onChange={e => setCls(e.target.value)}
              options={[
                { value: '', label: 'All Classes' },
                { value: 'SL', label: 'Sleeper' },
                { value: '3A', label: '3AC' },
                { value: '2A', label: '2AC' },
                { value: '1A', label: '1AC' },
                { value: 'CC', label: 'Chair Car' },
                { value: '2S', label: 'Second Sitting' }
              ]} 
            />

            <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem' }}>
              Only trains running on {new Date(date).toLocaleDateString(undefined, { weekday: 'long' })} are shown.
            </div>
          </div>
        </Card>

        {/* RIGHT COLUMN: Train List & Chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Train Selection List */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Select Train</h3>
              <Badge color="blue">{filteredTrains.length} found</Badge>
            </div>

            {loadingTrains ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner /></div>
            ) : filteredTrains.length > 0 ? (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', 
                gap: '0.75rem',
                maxHeight: '400px',
                overflowY: 'auto',
                paddingRight: '0.5rem'
              }}>
                {filteredTrains.map(t => (
                  <div 
                    key={t.ID}
                    onClick={() => loadChart(t)}
                    style={{
                      padding: '1.25rem',
                      borderRadius: '10px',
                      background: selectedTrain?.ID === t.ID ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selectedTrain?.ID === t.ID ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem'
                    }}
                    onMouseEnter={e => {
                      if (selectedTrain?.ID !== t.ID) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (selectedTrain?.ID !== t.ID) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      }
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff', letterSpacing: '0.5px' }}>{t.Train_Number}</div>
                        <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>{t.Train_Name}</div>
                      </div>
                      <Badge color={t.Train_Type === 'Rajdhani' || t.Train_Type === 'Shatabdi' ? 'orange' : 'gray'} style={{ fontSize: '0.65rem' }}>
                        {t.Train_Type}
                      </Badge>
                    </div>

                    <div style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      fontSize: '0.8rem', 
                      color: 'rgba(255,255,255,0.6)',
                      background: 'rgba(0,0,0,0.2)',
                      padding: '0.5rem',
                      borderRadius: '6px'
                    }}>
                      <div style={{ flex: 1, textAlign: 'left' }}>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{extractStationCode(t.From_Station)}</div>
                        <div style={{ fontSize: '0.7rem' }}>{extractTimeOnly(t.Departure_Time)}</div>
                      </div>
                      <div style={{ opacity: 0.3 }}>→</div>
                      <div style={{ flex: 1, textAlign: 'right' }}>
                        <div style={{ color: '#fff', fontWeight: 600 }}>{extractStationCode(t.To_Station)}</div>
                        <div style={{ fontSize: '0.7rem' }}>{extractTimeOnly(t.Arrival_Time)}</div>
                      </div>
                    </div>
                    
                    {t.Duration && (
                      <div style={{ fontSize: '0.7rem', color: 'rgba(59,130,246,0.8)', textAlign: 'center', marginTop: '-0.25rem' }}>
                        Duration: {formatDuration(t.Duration)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', opacity: 0.5 }}>
                No trains found for the selected criteria.
              </div>
            )}
          </Card>

          {/* Chart Display Area */}
          {loadingChart ? (
            <Card style={{ padding: '4rem', textAlign: 'center' }}>
              <Spinner />
              <div style={{ marginTop: '1rem', opacity: 0.6 }}>Generating chart for {selectedTrain?.Train_Name}...</div>
            </Card>
          ) : chartData ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              
              {/* COMPREHENSIVE TRAIN INFO CARD */}
              <Card style={{ background: 'linear-gradient(145deg, rgba(30,41,59,0.7), rgba(15,23,42,0.9))', border: '1px solid rgba(59,130,246,0.3)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                      <h2 style={{ margin: 0, color: '#3b82f6', fontSize: '1.5rem' }}>{selectedTrain.Train_Number}</h2>
                      <h2 style={{ margin: 0, fontWeight: 500, fontSize: '1.5rem' }}>{selectedTrain.Train_Name}</h2>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', fontSize: '0.9rem', opacity: 0.7 }}>
                      <span>{selectedTrain.Train_Type}</span>
                      <span>•</span>
                      <span style={{ color: selectedTrain.Pantry_Car_Available ? '#10b981' : '#ef4444' }}>
                        {selectedTrain.Pantry_Car_Available ? 'Pantry Available' : 'No Pantry'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.5, textTransform: 'uppercase' }}>Journey Date</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{displayDate(date)}</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>
                  {/* Route Segment */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.75rem', textTransform: 'uppercase' }}>Route & Schedule</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{selectedTrain.From_Station?.display_value || selectedTrain.From_Station}</div>
                        <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Dept: {extractTimeOnly(selectedTrain.Departure_Time)}</div>
                      </div>
                      <div style={{ opacity: 0.2 }}>→</div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700 }}>{selectedTrain.To_Station?.display_value || selectedTrain.To_Station}</div>
                        <div style={{ fontSize: '0.8rem', color: '#3b82f6' }}>Arr: {extractTimeOnly(selectedTrain.Arrival_Time)}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', opacity: 0.6, textAlign: 'center' }}>
                      Duration: {formatDuration(selectedTrain.Duration)}
                    </div>
                  </div>

                  {/* Run Days Segment */}
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.75rem', opacity: 0.5, marginBottom: '0.75rem', textTransform: 'uppercase' }}>Operational Days</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => {
                        const isActive = selectedTrain.Run_Days?.includes(d);
                        return (
                          <span key={d} style={{ 
                            fontSize: '0.7rem', 
                            padding: '0.2rem 0.4rem', 
                            borderRadius: '4px',
                            background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                            color: isActive ? '#fff' : 'rgba(255,255,255,0.2)',
                            fontWeight: isActive ? 600 : 400
                          }}>{d}</span>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Fares & Sets Grid */}
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <th style={{ textAlign: 'left', padding: '0.75rem' }}>Class</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Fare (₹)</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Total Seats</th>
                        <th style={{ textAlign: 'center', padding: '0.75rem' }}>Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { key: 'SL', label: 'Sleeper' },
                        { key: '3A', label: '3-Tier AC' },
                        { key: '2A', label: '2-Tier AC' },
                        { key: '1A', label: '1-Tier AC' },
                        { key: 'CC', label: 'Chair Car' },
                        { key: 'EC', label: 'Executive Class' },
                        { key: '2S', label: 'Second Sitting' }
                      ].map(cls => (
                        <tr key={cls.key} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                          <td style={{ padding: '0.75rem', fontWeight: 600 }}>{cls.label} ({cls.key})</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>₹ {selectedTrain[`Fare_${cls.key}`] || '0.00'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center' }}>{selectedTrain[`Total_Seats_${cls.key}`] || '0'}</td>
                          <td style={{ padding: '0.75rem', textAlign: 'center', color: '#10b981' }}>{selectedTrain[`Available_Seats_${cls.key}`] || '0'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(16,185,129,0.1)', borderRadius: '8px', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>Chart Generated Successfully</div>
                  <div style={{ fontSize: '1.1rem' }}>Total Passengers: <strong style={{ color: '#10b981' }}>{chartData.total_passengers || 0}</strong></div>
                </div>
              </Card>

              {/* Passenger Lists Grouped by Coach */}
              {chartData.chart && Object.keys(chartData.chart).length > 0 ? (
                Object.entries(chartData.chart).map(([coach, passengers]) => (
                  <Card key={coach} style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                    <div style={{ 
                      padding: '0.75rem 1.25rem', 
                      background: 'rgba(255,255,255,0.03)', 
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <h4 style={{ margin: 0 }}>Coach {coach}</h4>
                      <Badge color="gray">{passengers.length} passengers</Badge>
                    </div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>PNR</th>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Name</th>
                            <th style={{ textAlign: 'center', padding: '1rem' }}>Age</th>
                            <th style={{ textAlign: 'center', padding: '1rem' }}>Gender</th>
                            <th style={{ textAlign: 'center', padding: '1rem' }}>Seat</th>
                            <th style={{ textAlign: 'center', padding: '1rem' }}>Berth</th>
                            <th style={{ textAlign: 'center', padding: '1rem' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {passengers.map((p, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                              <td style={{ padding: '0.85rem 1rem', fontFamily: 'monospace', color: '#3b82f6' }}>{p.PNR}</td>
                              <td style={{ padding: '0.85rem 1rem', fontWeight: 500 }}>{p.Name}</td>
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>{p.Age}</td>
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>{p.Gender}</td>
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'center', fontWeight: 700 }}>{p.Seat}</td>
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'center', opacity: 0.8 }}>{p.Berth}</td>
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'center' }}>
                                <span style={{
                                  padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 600,
                                  background: p.Status?.startsWith('CNF') ? 'rgba(16,185,129,0.1)' : p.Status?.startsWith('RAC') ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                                  color: p.Status?.startsWith('CNF') ? '#10b981' : p.Status?.startsWith('RAC') ? '#f59e0b' : '#ef4444',
                                  border: `1px solid ${p.Status?.startsWith('CNF') ? 'rgba(16,185,129,0.2)' : p.Status?.startsWith('RAC') ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)'}`
                                }}>{p.Status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                ))
              ) : (
                <EmptyState 
                  title="No Passengers Found" 
                  description="There are currently no confirmed bookings for this train on the selected date and class." 
                />
              )}
            </div>
          ) : selectedTrain ? (
            <Card style={{ padding: '3rem', textAlign: 'center', opacity: 0.5 }}>
              Select a different date or class if you expected to see data here.
            </Card>
          ) : (
            <div style={{ 
              height: '100%', 
              display: 'flex', 
              flexDirection: 'column', 
              justifyContent: 'center', 
              alignItems: 'center',
              border: '2px dashed rgba(255,255,255,0.1)',
              borderRadius: '12px',
              padding: '4rem',
              color: 'rgba(255,255,255,0.3)'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🚂</div>
              <div>Select a train from the list to view its reservation chart</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function displayDate(isoStr) {
  if (!isoStr) return '—';
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { 
      day: '2-digit', month: 'short', year: 'numeric' 
    });
  } catch { return isoStr; }
}

function extractStationCode(field) {
  if (!field) return '???';
  const val = field.display_value || String(field);
  return val.split('-')[0].trim();
}

function extractTimeOnly(dateStr) {
  if (!dateStr) return '--:--';
  const parts = String(dateStr).split(' ');
  if (parts.length > 1) return parts[1].slice(0, 5);
  return dateStr.slice(0, 5);
}

function formatDuration(mins) {
  if (!mins) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}
