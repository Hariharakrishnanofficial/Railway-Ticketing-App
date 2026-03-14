/**
 * AIChatWidget — Persistent AI booking assistant widget.
 * Renders as a floating button (bottom-right) that expands to a chat panel.
 * Powered by /api/ai/chat (multi-turn Gemini assistant).
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { aiApi } from '../services/api';

const FONT = "'Inter', system-ui, sans-serif";
const BLUE = '#2E5FB3';
const DARK = '#0a0d14';
const PANEL = '#111827';
const BORDER = '#1e2433';

// ─── Quick action chips ───────────────────────────────────────────────────────
const QUICK_ACTIONS = [
  '🚂 Search trains',
  '🎫 Book tickets',
  '📋 Check PNR status',
  '❌ Cancel booking',
  '📊 Check availability',
];

export default function AIChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{
    role: 'assistant',
    content: 'Hello! I\'m your Railway AI Assistant. I can help you search trains, book tickets, check PNR status, or answer any travel questions. How can I help?',
    time: new Date(),
  }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Keyboard shortcut: Ctrl+/ to toggle
  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === '/') { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');

    const userMsg = { role: 'user', content: msg, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Build history for multi-turn context
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await aiApi.agent(msg, history, getCurrentUser()?.Role || 'User');
      const reply = res?.response?.message || res?.response || 'Sorry, I could not process that.';
      const action = res?.response?.action;
      const data = res?.response?.data || {};

      let content = typeof reply === 'string' ? reply : JSON.stringify(reply, null, 2);

      // If booking is ready — surface it
      if (action === 'confirm_booking' && data.source && data.destination) {
        content += `\n\n✅ **Ready to book**: ${data.source} → ${data.destination} | ${data.date} | ${data.class || 'SL'} | ${data.passengers || 1} passenger(s)\n\nWould you like to proceed?`;
      }

      setMessages(prev => [...prev, { role: 'assistant', content, time: new Date() }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I\'m having trouble connecting. Please try again in a moment.',
        time: new Date(),
        error: true,
      }]);
    } finally {
      setLoading(false);
    }
  }, [input, messages, loading]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const formatTime = (d) =>
    d instanceof Date ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="AI Assistant (Ctrl+/)"
        aria-label="Open AI Assistant"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: open ? '#374151' : BLUE,
          border: 'none', cursor: 'pointer', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease',
          fontSize: 24,
        }}
      >
        {open ? '✕' : '🤖'}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 24, zIndex: 9998,
          width: 380, height: 560, borderRadius: 16,
          background: PANEL, border: `1px solid ${BORDER}`,
          boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
          display: 'flex', flexDirection: 'column',
          fontFamily: FONT, overflow: 'hidden',
          animation: 'slideUp 0.2s ease',
        }}>

          {/* Header */}
          <div style={{
            padding: '12px 16px', background: BLUE,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 20 }}>🚂</span>
            <div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Railway AI Assistant</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Powered by Gemini</div>
            </div>
            <div style={{
              marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%',
              background: '#22c55e', boxShadow: '0 0 6px #22c55e'
            }} />
          </div>

          {/* Messages */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '12px 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  maxWidth: '82%', padding: '8px 12px', borderRadius: 12,
                  background: msg.role === 'user' ? BLUE : msg.error ? '#3b1c1c' : DARK,
                  border: `1px solid ${msg.role === 'user' ? BLUE : BORDER}`,
                  color: '#e5e7eb', fontSize: 13, lineHeight: 1.5,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 4, textAlign: 'right' }}>
                    {formatTime(msg.time)}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '8px 16px', borderRadius: 12,
                  background: DARK, border: `1px solid ${BORDER}`,
                  color: '#9ca3af', fontSize: 13, letterSpacing: 3,
                }}>
                  ●●●
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Quick actions (show only when empty or on first message) */}
          {messages.length <= 2 && (
            <div style={{
              padding: '6px 12px', display: 'flex', gap: 6, flexWrap: 'wrap',
              borderTop: `1px solid ${BORDER}`,
            }}>
              {QUICK_ACTIONS.map((action, i) => (
                <button key={i}
                  onClick={() => sendMessage(action)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11,
                    background: '#1e2433', border: `1px solid ${BORDER}`,
                    color: '#9ca3af', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => e.target.style.borderColor = BLUE}
                  onMouseOut={e => e.target.style.borderColor = BORDER}
                >
                  {action}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{
            padding: '10px 12px', borderTop: `1px solid ${BORDER}`,
            display: 'flex', gap: 8, alignItems: 'flex-end',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask me anything… (Enter to send)"
              rows={1}
              style={{
                flex: 1, background: DARK, border: `1px solid ${BORDER}`,
                borderRadius: 10, color: '#e5e7eb', fontSize: 13,
                padding: '8px 12px', resize: 'none', fontFamily: FONT,
                outline: 'none', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              style={{
                width: 36, height: 36, borderRadius: 10, border: 'none',
                background: (!input.trim() || loading) ? BORDER : BLUE,
                color: '#fff', cursor: (!input.trim() || loading) ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, flexShrink: 0, transition: 'background 0.15s',
              }}
              aria-label="Send"
            >
              ➤
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
