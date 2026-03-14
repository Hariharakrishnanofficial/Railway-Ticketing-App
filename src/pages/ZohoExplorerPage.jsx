/**
 * ZohoExplorerPage.jsx — System & API Investigation Tool
 * A dedicated dashboard for testing Zoho Creator MCP functionalities in isolation.
 * Includes: Health Checks, Token Debugging, and Raw Report Exploration.
 */
import { useState, useEffect } from 'react';
import { mcpApi, extractRecords } from '../services/api';
import { PageHeader, Card, Button, Spinner, Icon, Badge } from '../components/UI';
import { useToast } from '../context/ToastContext';

const FONT = "'Inter','Segoe UI',system-ui,-apple-system,sans-serif";
const MONO = "'JetBrains Mono','Fira Code','Courier New',monospace";

export default function ZohoExplorerPage() {
  const { addToast } = useToast();
  
  // -- State
  const [health, setHealth] = useState(null);
  const [config, setConfig] = useState(null);
  const [system, setSystem] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('health'); // 'health', 'config', 'explorer', 'system', 'logs', 'ai'
  
  const [testResult, setTestResult] = useState(null);
  const [testLoading, setTestLoading] = useState(false);

  const [explorerReport, setExplorerReport] = useState('');
  const [explorerCriteria, setExplorerCriteria] = useState('');
  const [explorerData, setExplorerData] = useState(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  
  // AI Assistant
  const [aiQuery, setAiQuery] = useState('');
  const [aiResult, setAiResult] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Pagination
  const [pageSize, setPageSize] = useState(25);
  const [pageFrom, setPageFrom] = useState(1);

  // -- Load initial data
  const loadStats = () => {
    setLoading(true);
    
    Promise.allSettled([
      mcpApi.health(),
      mcpApi.debugConfig(),
      mcpApi.systemInfo(),
      mcpApi.systemLogs(20)
    ]).then(([h, c, s, l]) => {
      if (h.status === 'fulfilled') setHealth(h.value);
      if (c.status === 'fulfilled') setConfig(c.value);
      if (s.status === 'fulfilled') setSystem(s.value);
      if (l.status === 'fulfilled') setLogs(extractRecords(l.value));
    }).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadStats();
  }, []);

  // -- Test Actions
  const handleTestToken = () => {
    setTestLoading(true);
    mcpApi.testToken()
      .then(res => {
        setTestResult(res);
        if (res.success) addToast('Token validated', 'success');
        else addToast('Token validation failed', 'error');
      })
      .catch(err => setTestResult({ error: err.message }))
      .finally(() => setTestLoading(false));
  };  const handleAiTranslate = () => {
    if (!aiQuery) return;
    setAiLoading(true);
    
    mcpApi.aiTranslate(aiQuery)
      .then(res => {
        setAiResult(res);
        if (res.translated_criteria) {
          addToast('Gemini Translation successful', 'success');
        } else {
          addToast('AI could not identify criteria', 'warning');
        }
      })
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setAiLoading(false));
  };
;

  const handleApplyAiCriteria = () => {
    if (aiResult?.translated_criteria) {
      setExplorerCriteria(aiResult.translated_criteria);
      setActiveTab('explorer');
      addToast('Criteria applied to Data Explorer', 'success');
    }
  };

  const handleExplore = (fromShift = 0) => {
    if (!explorerReport) return;
    
    const newFrom = Math.max(1, pageFrom + fromShift);
    setPageFrom(newFrom);
    
    setExplorerLoading(true);
    const params = {
      from: newFrom,
      limit: pageSize
    };
    if (explorerCriteria) params.criteria = explorerCriteria;

    mcpApi.fetchRawReport(explorerReport, params)
      .then(res => setExplorerData(res))
      .catch(err => addToast(err.message, 'error'))
      .finally(() => setExplorerLoading(false));
  };

  const renderJson = (data) => (
    <pre style={{
      background: '#0d1117',
      padding: '16px',
      borderRadius: '8px',
      color: '#c9d1d9',
      fontSize: '12px',
      fontFamily: MONO,
      overflowX: 'auto',
      border: '1px solid #30363d',
      maxHeight: '400px'
    }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <PageHeader 
        title="Zoho MCP Explorer" 
        subtitle="Universal Investigation & AI Debugging Console"
        icon="settings"
        iconAccent="#60a5fa"
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {[
          { id: 'health', label: 'Health' },
          { id: 'config', label: 'Aliases' },
          { id: 'system', label: 'Logic' },
          { id: 'logs',   label: 'Logs' },
          { id: 'ai',   label: 'AI Assistant' },
          { id: 'explorer', label: 'Data Explorer' },
        ].map(t => (
          <Button 
            key={t.id}
            variant={activeTab === t.id ? 'primary' : 'outline'} 
            onClick={() => setActiveTab(t.id)}
            style={{ borderRadius: 10, padding: '8px 16px' }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 350px) 1fr', gap: 24 }}>
        {/* Left Column: Toolbox */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <Card title="Connectivity Tools">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Button 
                onClick={loadStats} 
                loading={loading}
                style={{ width: '100%' }}
              >
                Refresh All Node Data
              </Button>
              <Button 
                variant="outline" 
                onClick={handleTestToken}
                loading={testLoading}
                style={{ width: '100%' }}
              >
                Trigger Token Refresh
              </Button>
            </div>
          </Card>

          <Card title="MCP Live Status">
            {loading ? <Spinner /> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {[
                  { label: 'Backend API', val: health?.status === 'healthy', status: health?.status === 'healthy' ? 'confirmed' : 'cancelled' },
                  { label: 'Zoho Creator', val: health?.zoho_credentials_present?.client_id, status: health?.zoho_credentials_present?.client_id ? 'confirmed' : 'pending' },
                  { label: 'Auth Token', val: config?.token_cached, status: config?.token_cached ? 'confirmed' : 'pending' },
                  { label: 'Logic Schema', val: !!system, status: system ? 'confirmed' : 'pending' },
                  { label: 'System Logs', val: logs.length > 0, status: logs.length > 0 ? 'confirmed' : 'pending' },
                  { label: 'AI Engine', val: true, status: 'confirmed' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{s.label}</span>
                    <Badge status={s.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Quick Info" icon="info">
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <div style={{ marginBottom: 8 }}><strong>Python:</strong> {health?.python_version || '3.x'}</div>
              <div style={{ marginBottom: 8 }}><strong>Environment:</strong> Flask / Catalyst</div>
              <div style={{ wordBreak: 'break-all', fontSize: '10px', color: '#60a5fa', fontFamily: MONO, padding: '8px', background: 'rgba(96,165,250,0.05)', borderRadius: 6, border: '1px dashed #60a5fa30' }}>
                Key: 6051db1b...b32b98916
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Execution Results */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          
          {activeTab === 'health' && (
            <Card title="System Performance Metadata">
              {health ? renderJson(health) : <div style={{ color: 'var(--text-faint)' }}>Loading health data...</div>}
            </Card>
          )}

          {activeTab === 'config' && (
            <Card title="API Integration (Form & Report Aliases)">
              <div style={{ marginBottom: 16 }}>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: 8, fontFamily: FONT, fontWeight: 700 }}>Form Definitions (Z_MAP)</h4>
                {config?.forms ? renderJson(config.forms) : <Spinner />}
              </div>
              <div>
                <h4 style={{ color: 'var(--text-primary)', fontSize: '14px', marginBottom: 8, fontFamily: FONT, fontWeight: 700 }}>Report Mappings (R_MAP)</h4>
                {config?.reports ? renderJson(config.reports) : <Spinner />}
              </div>
            </Card>
          )}

          {activeTab === 'system' && (
            <Card title="Railway Business Logic (Constants & Rules)">
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 20, background: 'rgba(255,255,0,0.05)', padding: 12, borderRadius: 8, borderLeft: '3px solid #f59e0b' }}>
                <strong>Note:</strong> These rules govern seat assignment, fare calculation, and cancellation policies across the entire system.
              </div>
              {system ? renderJson(system) : <Spinner />}
            </Card>
          )}

          {activeTab === 'logs' && (
            <Card title="Recent System Logs">
              {loading ? <Spinner /> : logs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-faint)' }}>No recent logs found.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {logs.map((L, i) => (
                    <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-inset)', border: '1px solid var(--border)', borderRadius: 8, fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, color: L.Action?.includes('Error') ? '#f87171' : '#60a5fa' }}>{L.Action || 'System Event'}</span>
                        <span style={{ color: 'var(--text-faint)', fontSize: '11px', fontFamily: MONO }}>{L.Added_Time || '—'}</span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', fontSize: '11px', whiteSpace: 'pre-wrap' }}>{L.Details || L.Message || '—'}</div>
                    </div>
                  ))}
                  <Button variant="text" onClick={() => setActiveTab('explorer')} style={{ fontSize: '12px', marginTop: 10 }}>View raw log data in Explorer →</Button>
                </div>
              )}
            </Card>
          )}

           {activeTab === 'ai' && (
            <Card title="AI Assistant (Natural Search to Criteria)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Ask the assistant to build a Zoho search filter for you.
                </div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <input 
                    type="text" 
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAiTranslate()}
                    placeholder='e.g. "find trains going to Chennai"'
                    disabled={aiLoading}
                    style={{ 
                      flex: 1, 
                      background: 'var(--bg-inset)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      fontFamily: FONT,
                      opacity: aiLoading ? 0.6 : 1
                    }}
                  />
                  <Button onClick={handleAiTranslate} loading={aiLoading} variant="primary">
                    Translate
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
                    borderRadius: 12,
                    border: '1px dashed #60a5fa40',
                    animation: 'pulse 2s infinite'
                  }}>
                    <Spinner size="sm" color="#60a5fa" />
                    <span style={{ fontSize: '13px', color: '#60a5fa', fontWeight: 600 }}>AI is thinking...</span>
                  </div>
                )}

                {aiResult && !aiLoading && (
                  <div style={{ 
                    marginTop: 4, 
                    padding: 16, 
                    background: 'rgba(96,165,250,0.05)', 
                    borderRadius: 12, 
                    border: '1px solid #60a5fa30',
                    animation: 'fadeIn 0.4s ease'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                      <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 700, textTransform: 'uppercase' }}>AI Insight ({aiResult.engine})</span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Confidence: {(aiResult.confidence * 100).toFixed(0)}%</span>
                    </div>
                    {aiResult.translated_criteria ? (
                      <div>
                        <div style={{ background: '#000', padding: '12px', borderRadius: 8, fontFamily: MONO, fontSize: '13px', color: '#fff', marginBottom: 16, border: '1px solid #30363d' }}>
                          {aiResult.translated_criteria}
                        </div>
                        <Button variant="primary" size="sm" onClick={handleApplyAiCriteria}>
                          Apply to Data Explorer
                        </Button>
                      </div>
                    ) : (
                      <div style={{ color: 'var(--text-faint)', fontSize: '13px' }}>
                        The AI couldn't find specific criteria in your query. Try "to Chennai" or "from Bangalore".
                      </div>
                    )}
                  </div>
                )}

                <div style={{ fontSize: '11px', color: 'var(--text-faint)', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <strong>Tip:</strong> You can mention source, destination, class, or IDs.
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'explorer' && (
            <Card title="Advanced Data Explorer">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 12 }}>
                  <select 
                    value={explorerReport}
                    onChange={(e) => {
                      setExplorerReport(e.target.value);
                      setPageFrom(1);
                    }}
                    style={{ 
                      flex: 1, 
                      background: 'var(--bg-inset)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontFamily: FONT,
                      fontSize: '13px'
                    }}
                  >
                    <option value="">Select a report to explore...</option>
                    {config?.reports && Object.keys(config.reports).sort().map(key => (
                      <option key={key} value={key}>{key} ({config.reports[key]})</option>
                    ))}
                  </select>
                  
                  <select 
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    style={{ 
                      width: '100px',
                      background: 'var(--bg-inset)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      padding: '8px 12px'
                    }}
                  >
                    {[25, 50, 100, 200].map(s => <option key={s} value={s}>{s} rows</option>)}
                  </select>

                  <Button onClick={() => handleExplore(0)} loading={explorerLoading} disabled={!explorerReport}>
                    Fetch Data
                  </Button>
                </div>
                
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text-faint)', display: 'block', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase' }}>Zoho Criteria (Optional)</label>
                  <input 
                    type="text" 
                    value={explorerCriteria}
                    onChange={(e) => setExplorerCriteria(e.target.value)}
                    placeholder='e.g. Email == "user@test.com" or ID == 1234'
                    style={{ 
                      width: '100%', 
                      background: 'var(--bg-inset)', 
                      border: '1px solid var(--border)', 
                      color: 'var(--text-primary)',
                      borderRadius: '8px',
                      padding: '8px 12px',
                      fontFamily: MONO,
                      fontSize: '12px'
                    }}
                  />
                </div>
              </div>
              
              {explorerLoading ? <Spinner /> : explorerData ? (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={pageFrom <= 1}
                        onClick={() => handleExplore(-pageSize)}
                      >
                        Previous
                      </Button>
                      <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        Showing {pageFrom} to {pageFrom + extractRecords(explorerData).length - 1}
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={extractRecords(explorerData).length < pageSize}
                        onClick={() => handleExplore(pageSize)}
                      >
                        Next
                      </Button>
                    </div>
                    <span style={{ color: '#60a5fa', fontWeight: 600, fontSize: '12px' }}>
                      {extractRecords(explorerData).length} records returned
                    </span>
                  </div>
                  {renderJson(explorerData)}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 40px', color: 'var(--text-faint)', background: 'rgba(255,255,255,0.01)', borderRadius: 12, border: '1px dashed var(--border)' }}>
                  <Icon name="search" size={32} style={{ marginBottom: 12, opacity: 0.2 }} />
                  <div>Select a report and click "Fetch Data" to perform an isolated API trace.</div>
                </div>
              )}
            </Card>
          )}

          {testResult && (
            <Card title="Universal Trace Log" icon="terminal">
               {renderJson(testResult)}
               <Button 
                variant="text" 
                onClick={() => setTestResult(null)}
                style={{ marginTop: 12, fontSize: '12px', color: 'var(--text-faint)' }}
               >
                 Clear Output
               </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
