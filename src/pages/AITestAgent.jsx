/**
 * AITestAgent.jsx — Interactive test agent for the conversational booking flow.
 * Features:
 *  - Real-time intent detection display
 *  - State visualization
 *  - Stage history tracking
 *  - Quick test buttons for common scenarios
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { aiApi, getCurrentUser } from '../services/api';

// Design tokens
const T = {
  font:    "'Inter', system-ui, sans-serif",
  bg:      '#0a0d14',
  surface: '#111827',
  raised:  '#1a2235',
  border:  '#1e2433',
  blue:    '#2E5FB3',
  green:   '#16a34a',
  yellow:  '#eab308',
  red:     '#dc2626',
  text:    '#f9fafb',
  muted:   '#9ca3af',
  faint:   '#6b7280',
};

// Quick test scenarios
const TEST_SCENARIOS = [
  { label: '🚂 Book Train', messages: ['book train'] },
  { label: '📍 Chennai → Bangalore', messages: ['book train from chennai to bangalore'] },
  { label: '📅 Full Flow', messages: ['book train', 'chennai', 'bangalore', 'tomorrow', '1'] },
  { label: '❓ Question', messages: ['what is PNR?'] },
  { label: '🔍 Search', messages: ['show all stations'] },
  { label: '📋 Check PNR', messages: ['check PNR ABC1234567'] },
];

// State display component
function StatePanel({ state }) {
  if (!state) return null;

  const fields = [
    { label: 'Stage', value: state.stage, highlight: true },
    { label: 'From', value: state.from_station },
    { label: 'To', value: state.to_station },
    { label: 'Date', value: state.date_display },
    { label: 'Class', value: state.class_display },
    { label: 'Train', value: state.train_number ? `${state.train_number} - ${state.train_name}` : null },
    { label: 'Passengers', value: state.pax_count > 0 ? `${state.pax_count} (${state.passengers?.length || 0} collected)` : null },
    { label: 'Menu Type', value: state.menu_type },
    { label: 'Total Fare', value: state.total_fare > 0 ? `₹${state.total_fare}` : null },
  ];

  return (
    <div style={{
      background: T.raised, borderRadius: 8, padding: 12,
      border: `1px solid ${T.border}`, fontSize: 12,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: T.yellow }}>📦 Booking State</div>
      {fields.map(({ label, value, highlight }) => value && (
        <div key={label} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: T.muted, minWidth: 80 }}>{label}:</span>
          <span style={{ color: highlight ? T.green : T.text, fontWeight: highlight ? 600 : 400 }}>
            {value}
          </span>
        </div>
      ))}
      {state.passengers?.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          <div style={{ color: T.muted, marginBottom: 4 }}>Passengers:</div>
          {state.passengers.map((p, i) => (
            <div key={i} style={{ color: T.text, marginLeft: 8 }}>
              {i + 1}. {p.name} — {p.age} yrs, {p.gender}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Message bubble with debug info
function MessageBubble({ msg }) {
  const isUser = msg.role === 'user';
  const [showDebug, setShowDebug] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 4 }}>
      <div style={{
        maxWidth: '80%', padding: '10px 14px', borderRadius: 12,
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
        background: isUser ? T.blue : T.raised,
        border: `1px solid ${isUser ? T.blue : T.border}`,
        color: T.text, fontSize: 13, whiteSpace: 'pre-wrap',
      }}>
        {msg.content}
      </div>

      {/* Debug info for bot messages */}
      {!isUser && msg.debug && (
        <button
          onClick={() => setShowDebug(!showDebug)}
          style={{
            background: 'transparent', border: 'none', color: T.faint,
            fontSize: 10, cursor: 'pointer', padding: '2px 8px',
          }}
        >
          {showDebug ? '▼ Hide Debug' : '▶ Show Debug'}
        </button>
      )}

      {!isUser && msg.debug && showDebug && (
        <div style={{
          background: '#1a1a2e', border: `1px solid ${T.border}`,
          borderRadius: 6, padding: 8, fontSize: 10, fontFamily: 'monospace',
          maxWidth: '90%', overflow: 'auto',
        }}>
          <div style={{ color: T.yellow, marginBottom: 4 }}>Intent: {msg.debug.intent}</div>
          <div style={{ color: T.muted }}>Extracted: {msg.debug.extracted || '—'}</div>
          {msg.debug.trigger && <div style={{ color: T.green }}>Trigger: {msg.debug.trigger}</div>}
          <div style={{ color: T.muted, marginTop: 4 }}>
            Stage: {msg.debug.prevStage} → {msg.debug.newStage}
          </div>
        </div>
      )}

      <span style={{ fontSize: 9, color: T.faint, padding: '0 4px' }}>
        {msg.time?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
      </span>
    </div>
  );
}

// Main test agent component
export default function AITestAgent() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bookingState, setBookingState] = useState(null);
  const [stageHistory, setStageHistory] = useState(['from']);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const clearAll = () => {
    setMessages([]);
    setBookingState(null);
    setStageHistory(['from']);
  };

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;

    setInput('');
    const userMsg = { role: 'user', content: msg, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const prevStage = bookingState?.stage || 'from';

    try {
      const currentUser = getCurrentUser();
      const res = await aiApi.chat(msg, history, bookingState, currentUser?.ID);

      const reply = res?.reply || res?.response || 'No response';
      const newState = res?.booking_state || null;
      const trigger = res?.trigger;

      // Track stage changes
      if (newState?.stage && newState.stage !== prevStage) {
        setStageHistory(prev => [...prev, newState.stage]);
      }

      setBookingState(newState);

      const botMsg = {
        role: 'assistant',
        content: reply,
        time: new Date(),
        debug: {
          intent: res?.intent || 'N/A',
          extracted: res?.extracted || null,
          trigger,
          prevStage,
          newStage: newState?.stage || prevStage,
        },
      };
      setMessages(prev => [...prev, botMsg]);

    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Error: ${err.message}`,
        time: new Date(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading, bookingState]);

  const runScenario = async (scenario) => {
    clearAll();
    for (const msg of scenario.messages) {
      await new Promise(r => setTimeout(r, 500));
      await sendMessage(msg);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      fontFamily: T.font, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px', background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{ fontSize: 24 }}>🧪</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>Booking Conversation Test Agent</div>
          <div style={{ color: T.muted, fontSize: 12 }}>
            Interactive testing for intent detection, state transitions, and conversation flow
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={clearAll}
          style={{
            background: T.raised, border: `1px solid ${T.border}`,
            color: T.muted, padding: '8px 16px', borderRadius: 6,
            cursor: 'pointer', fontSize: 12,
          }}
        >
          🗑️ Clear All
        </button>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Chat panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}` }}>
          {/* Quick test buttons */}
          <div style={{
            padding: '12px 16px', borderBottom: `1px solid ${T.border}`,
            display: 'flex', gap: 8, flexWrap: 'wrap',
          }}>
            <span style={{ color: T.muted, fontSize: 11, alignSelf: 'center' }}>Quick Tests:</span>
            {TEST_SCENARIOS.map((s, i) => (
              <button
                key={i}
                onClick={() => runScenario(s)}
                disabled={loading}
                style={{
                  background: T.raised, border: `1px solid ${T.border}`,
                  color: T.text, padding: '4px 10px', borderRadius: 4,
                  cursor: loading ? 'default' : 'pointer', fontSize: 11,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && (
              <div style={{ color: T.faint, textAlign: 'center', padding: 40 }}>
                Start typing or click a Quick Test to begin...
              </div>
            )}
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && (
              <div style={{ color: T.muted, fontSize: 12 }}>Processing...</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: 16, borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 8,
          }}>
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message to test..."
              disabled={loading}
              style={{
                flex: 1, padding: '10px 14px', borderRadius: 8,
                background: T.raised, border: `1px solid ${T.border}`,
                color: T.text, fontSize: 14, outline: 'none',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                padding: '10px 20px', borderRadius: 8,
                background: input.trim() && !loading ? T.blue : T.raised,
                border: 'none', color: T.text, cursor: input.trim() && !loading ? 'pointer' : 'default',
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </div>
        </div>

        {/* Side panel - State & Debug */}
        <div style={{ width: 320, background: T.surface, padding: 16, overflowY: 'auto' }}>
          {/* Current State */}
          <StatePanel state={bookingState} />

          {/* Stage History */}
          <div style={{
            marginTop: 16, background: T.raised, borderRadius: 8, padding: 12,
            border: `1px solid ${T.border}`,
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: T.blue, fontSize: 12 }}>
              📊 Stage History
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {stageHistory.map((stage, i) => (
                <span key={i} style={{
                  background: i === stageHistory.length - 1 ? T.blue : T.bg,
                  padding: '2px 8px', borderRadius: 4, fontSize: 10,
                  border: `1px solid ${T.border}`,
                }}>
                  {stage}
                </span>
              ))}
            </div>
          </div>

          {/* Flow Diagram */}
          <div style={{
            marginTop: 16, background: T.raised, borderRadius: 8, padding: 12,
            border: `1px solid ${T.border}`, fontSize: 10, fontFamily: 'monospace',
          }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: T.green, fontSize: 12 }}>
              🔄 Expected Flow
            </div>
            <div style={{ color: T.muted, lineHeight: 1.8 }}>
              from → to → date → class<br />
              ↓ [search_trains]<br />
              select_train → pax_count<br />
              ↓ [collect each passenger]<br />
              pax_name → pax_age → pax_gender<br />
              ↓ [repeat for pax_count]<br />
              confirm → [create_booking] → done
            </div>
          </div>

          {/* Instructions */}
          <div style={{
            marginTop: 16, padding: 12, background: T.bg,
            borderRadius: 8, border: `1px solid ${T.border}`,
            fontSize: 11, color: T.muted, lineHeight: 1.6,
          }}>
            <strong style={{ color: T.text }}>Tips:</strong>
            <ul style={{ margin: '8px 0 0 16px', padding: 0 }}>
              <li>Click "Show Debug" on bot messages for details</li>
              <li>Watch state panel for real-time updates</li>
              <li>Use Quick Tests for common scenarios</li>
              <li>Try: "book train from chennai to bangalore"</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
