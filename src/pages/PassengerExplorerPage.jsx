/**
 * PassengerExplorerPage.jsx
 * A passenger-centric version of the Zoho Explorer.
 * Features: 
 * 1. My Data Explorer (filtered for current user)
 * 2. AI Booking Assistant (converstations to search/booking)
 */
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { mcpApi, extractRecords, getRecordId } from '../services/api';
import { PageHeader, Card, Button, Spinner, Icon, Badge } from '../components/UI';
import { useToast } from '../context/ToastContext';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

export default function PassengerExplorerPage({ user }) {
  const { addToast } = useToast();
  const navigate = useNavigate();
  
  // -- State
  const [activeTab, setActiveTab] = useState('assistant'); // 'assistant', 'my_data'
  const [loading, setLoading] = useState(false);
  
  // AI Assistant
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiExecutionResult, setAiExecutionResult] = useState(null); // For counts/lists

  // My Data
  const [myData, setMyData] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [selectedReport, setSelectedReport] = useState('Bookings'); // 'Bookings', 'Users'

  const REPORTS = {
    'Bookings': 'All_Bookings',
    'Profile': 'All_Users'
  };

  // -- Load my data
  const loadMyData = () => {
    if (!user?.Email) return;
    setDataLoading(true);
    
    // Security: Always filter by the current logged-in user's email
    const criteria = selectedReport === 'Bookings' 
      ? `Users.Email == "${user.Email}"`
      : `Email == "${user.Email}"`;

    mcpApi.fetchRawReport(REPORTS[selectedReport], { criteria, limit: 10 })
      .then(res => setMyData(res))
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setDataLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'my_data') loadMyData();
  }, [activeTab, selectedReport]);

  const handleAiAssistant = () => {
    if (!aiQuery) return;
    setAiLoading(true);
    setAiResult(null);
    setAiExecutionResult(null);

    mcpApi.aiTranslate(aiQuery)
      .then(async (res) => {
        setAiResult(res);
        
        // If it's a search or aggregation, try to fetch the actual count/data for the user
        if ((res.type === 'aggregation' || res.type === 'search') && res.translated_criteria) {
          try {
            // Append user security filter
            const secureCriteria = `${res.translated_criteria} && Users.Email == "${user.Email}"`;
            const data = await mcpApi.fetchRawReport('All_Bookings', { criteria: secureCriteria, limit: 100 });
            const records = extractRecords(data);
            setAiExecutionResult({ total: records.length, records: records.slice(0, 5) });
          } catch (e) {
            console.warn("Could not execute AI query:", e);
          }
        }

        if (res.type === 'booking') {
          addToast('I found a booking request! See options below.', 'success');
        } else if (res.type === 'aggregation') {
          addToast('Count calculated', 'success');
        } else if (res.translated_criteria) {
          addToast('Search criteria extracted', 'success');
        }
      })
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setAiLoading(false));
  };

  const handleFastTrackBooking = () => {
    if (!aiResult?.booking_intent) return;
    const { source, destination, date } = aiResult.booking_intent;
    
    // Construct search URL
    const params = new URLSearchParams();
    if (source) params.append('from', source);
    if (destination) params.append('to', destination);
    if (date) params.append('date', date);
    
    navigate(`/search?${params.toString()}`);
    addToast('Redirecting to search with pre-filled details...', 'success');
  };

  const renderJson = (data) => (
    <pre style={{
      background: '#0d1117',
      padding: '14px',
      borderRadius: '8px',
      color: '#c9d1d9',
      fontSize: '11px',
      fontFamily: MONO,
      overflowX: 'auto',
      border: '1px solid #30363d',
      maxHeight: '300px'
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader 
        title="Passenger Explorer" 
        subtitle="AI Assistant & Personal Data Dashboard"
        icon="user"
        iconAccent="#10b981"
      />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button 
          variant={activeTab === 'assistant' ? 'primary' : 'outline'} 
          onClick={() => setActiveTab('assistant')}
          style={{ borderRadius: 10 }}
        >
          <Icon name="zap" size={14} style={{ marginRight: 6 }} />
          AI Assistant
        </Button>
        <Button 
          variant={activeTab === 'my_data' ? 'primary' : 'outline'} 
          onClick={() => setActiveTab('my_data')}
          style={{ borderRadius: 10 }}
        >
          <Icon name="database" size={14} style={{ marginRight: 6 }} />
          My Data Explorer
        </Button>
      </div>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
        gap: 24,
        alignItems: 'start' 
      }}>
        {/* Left Column: Context & Tips */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Account Context">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Status</span>
                    <Badge status="confirmed" text="Active" />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <strong>Email:</strong> {user?.Email}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    <strong>Role:</strong> Passenger
                </div>
            </div>
          </Card>

          <Card title="Quick Tips" icon="info">
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                • Ask: "Find my bookings"<br/>
                • Ask: "Book a ticket from MAS to SBC"<br/>
                • Ask: "Count cancel tickets in my account"<br/>
                • View your personal records securely in the explorer tab.
            </div>
          </Card>
        </div>

        {/* Right Column: AI & Data */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {activeTab === 'assistant' && (
            <Card title="AI Booking & Search Assistant">
               <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  I can help you find trains or start a new booking. 
                  Try asking to "book" a journey or "find" specific logs.
                </div>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
                  <input 
                    type="text" 
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    placeholder='e.g. "Count cancel tickets"'
                    style={{ 
                      flex: '1 1 200px', 
                      background: 'var(--bg-inset)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      fontFamily: FONT,
                      minWidth: '200px'
                    }}
                    onKeyDown={e => e.key === 'Enter' && handleAiAssistant()}
                  />
                  <Button onClick={handleAiAssistant} loading={aiLoading} variant="primary" style={{ flex: '0 0 auto' }}>
                    Ask AI
                  </Button>
                </div>

                {aiLoading && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    gap: 12, 
                    padding: '24px', 
                    background: 'rgba(96,165,250,0.02)', 
                    borderRadius: 14,
                    border: '1px dashed #60a5fa40',
                    animation: 'pulse 2s infinite'
                  }}>
                    <Spinner size="sm" color="#60a5fa" />
                    <span style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600 }}>AI is thinking...</span>
                  </div>
                )}

                {aiResult && !aiLoading && (
                  <div style={{ 
                    marginTop: 10, 
                    padding: 'clamp(16px, 4vw, 24px)', 
                    background: 'rgba(59,130,246,0.03)', 
                    borderRadius: 14, 
                    border: '1px solid var(--border)',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
                        <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          <Icon name="zap" size={10} style={{ marginRight: 4 }} />
                          {aiResult.engine || 'AI Engine'} Response
                        </span>
                        <Badge variant="outline" text={aiResult.type} style={{ fontSize: '10px' }} />
                    </div>

                    {aiResult.type === 'booking' ? (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ marginBottom: 15 }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>Booking Intent Detected</div>
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Journey details retrieved:</div>
                            </div>
                            
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 20 }}>
                                {[
                                  ['From', aiResult.booking_intent.source], 
                                  ['To', aiResult.booking_intent.destination], 
                                  ['Date', aiResult.booking_intent.date], 
                                  ['Class', aiResult.booking_intent.class]
                                ].map(([l, v]) => (
                                    <div key={l} style={{ padding: '12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 10 }}>
                                        <div style={{ fontSize: '10px', color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 4 }}>{l}</div>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#3b82f6' }}>{v || 'Any'}</div>
                                    </div>
                                ))}
                            </div>

                            <Button onClick={handleFastTrackBooking} variant="primary" style={{ width: '100%', height: 48, borderRadius: 10, fontSize: '15px', fontWeight: 700 }}>
                                Fast-Track Booking Process →
                            </Button>
                        </div>
                    ) : aiResult.type === 'aggregation' ? (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ textAlign: 'center', padding: '20px 0' }}>
                                <div style={{ fontSize: '12px', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Calculation Result</div>
                                <div style={{ fontSize: '48px', fontWeight: 800, color: '#10b981', fontFamily: 'var(--font-display)' }}>
                                    {aiExecutionResult?.total ?? '...'}
                                </div>
                                <div style={{ fontSize: '14px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                    Records found matching your request
                                </div>
                            </div>
                            <div style={{ background: 'var(--bg-inset)', padding: '12px', borderRadius: 8, border: '1px solid var(--border)', marginTop: 16 }}>
                                <div style={{ fontSize: '11px', color: 'var(--text-faint)', marginBottom: 6 }}>Logic Applied:</div>
                                <code style={{ fontSize: '11px', color: '#3b82f6', fontFamily: MONO }}>{aiResult.translated_criteria}</code>
                            </div>
                        </div>
                    ) : (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 10 }}>Search Results Grid:</div>
                            
                            {aiExecutionResult ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                                  <div style={{ fontSize: '12px', color: '#10b981', marginBottom: 4 }}>
                                    Total {aiExecutionResult.total} records found
                                  </div>
                                  <div style={{ 
                                    maxHeight: '200px', 
                                    overflowY: 'auto', 
                                    border: '1px solid var(--border)', 
                                    borderRadius: 10,
                                    background: 'var(--bg-inset)'
                                  }}>
                                    {aiExecutionResult.records.map((rec, i) => (
                                      <div key={i} style={{ padding: '10px 14px', borderBottom: i < aiExecutionResult.records.length - 1 ? '1px solid var(--border)' : 'none', fontSize: '12px', color: 'var(--text-secondary)' }}>
                                        {rec.Train_Name || rec.PNR || rec.Full_Name || 'Record ' + (i+1)}
                                        <span style={{ float: 'right', color: 'var(--text-faint)' }}>{rec.Booking_Status || rec.Departure_Time || ''}</span>
                                      </div>
                                    ))}
                                  </div>
                              </div>
                            ) : (
                              <div style={{ 
                                background: '#0d1117', 
                                padding: '16px', 
                                borderRadius: 10, 
                                fontFamily: MONO, 
                                fontSize: '13px', 
                                color: '#60a5fa', 
                                border: '1px solid #1e293b',
                                wordBreak: 'break-all',
                                lineHeight: 1.4,
                                marginBottom: 16
                              }}>
                                  {aiResult.translated_criteria || 'No criteria matches found.'}
                              </div>
                            )}

                            <div style={{ fontSize: '12px', color: 'var(--text-faint)', fontStyle: 'italic' }}>
                                Tip: Try saying "book from MAS to SBC" for a guided booking experience.
                            </div>
                        </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}

          {activeTab === 'my_data' && (
            <Card title="My Personal Record Explorer">
              <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
                  <select 
                    value={selectedReport}
                    onChange={(e) => setSelectedReport(e.target.value)}
                    style={{ 
                        flex: 1, 
                        background: 'var(--bg-inset)', 
                        border: '1px solid var(--border)', 
                        color: 'var(--text-primary)',
                        borderRadius: '8px',
                        padding: '10px',
                        fontFamily: FONT
                    }}
                  >
                    <option value="Bookings">My Bookings history</option>
                    <option value="Profile">My User Profile</option>
                  </select>
                  <Button onClick={loadMyData} loading={dataLoading} variant="outline">
                    Refresh
                  </Button>
              </div>

              {dataLoading ? <Spinner /> : myData ? (
                <div>
                  <div style={{ fontSize: '12px', color: '#10b981', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Icon name="info" size={14} />
                    Securely displaying records linked to <strong>{user.Email}</strong>
                  </div>
                  {renderJson(myData)}
                  <div style={{ marginTop: 12, fontSize: '11px', color: 'var(--text-faint)' }}>
                    Only your own data is retrieved from the MCP server for privacy.
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-faint)' }}>
                    Select a view to explore your data.
                </div>
              )}
            </Card>
          )}

        </div>
      </div>
    </div>
  );
}
