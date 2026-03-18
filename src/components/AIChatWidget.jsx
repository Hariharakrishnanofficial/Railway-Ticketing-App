/**
 * AIChatWidget v2 — Enhanced AI booking assistant widget.
 * Features:
 *  - Animated typing indicator (bouncing dots)
 *  - Message timestamps + copy-on-hover
 *  - Minimize to floating button (state preserved)
 *  - Notification dot when new message arrives while minimized
 *  - Clear chat button
 *  - Keyboard shortcut Ctrl+/
 *  - Full-screen on mobile (<640px)
 *  - ARIA-labelled for screen readers
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { aiApi, getCurrentUser } from '../services/api';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  font:    "'Inter', system-ui, sans-serif",
  bg:      '#0a0d14',
  surface: '#111827',
  raised:  '#1a2235',
  border:  '#1e2433',
  blue:    '#2E5FB3',
  green:   '#16a34a',
  red:     '#dc2626',
  text:    '#f9fafb',
  muted:   '#9ca3af',
  faint:   '#6b7280',
};

const QUICK_ACTIONS = [
  { icon: '🎫', label: 'Book train' },
  { icon: '🚂', label: 'Search trains' },
  { icon: '📋', label: 'Check PNR' },
  { icon: '❌', label: 'Cancel booking' },
];

const CSS = `
  @keyframes chatBounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
    40%           { transform: translateY(-6px); opacity: 1; }
  }
  @keyframes chatSlideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
  @keyframes chatPulse {
    0%, 100% { transform: scale(1); }
    50%       { transform: scale(1.15); }
  }
  .chat-bubble-copy { opacity: 0; transition: opacity 0.15s; }
  .chat-bubble:hover .chat-bubble-copy { opacity: 1; }
  @media (max-width: 640px) {
    .chat-panel {
      bottom: 0 !important; right: 0 !important; left: 0 !important;
      width: 100% !important; height: 100dvh !important;
      border-radius: 0 !important;
    }
  }
`;

// ─── TypingIndicator ─────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '10px 14px', borderRadius: 14,
      borderBottomLeftRadius: 4, background: T.raised, border: `1px solid ${T.border}`,
      alignItems: 'center', width: 'fit-content' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 7, height: 7, borderRadius: '50%', background: T.muted, display: 'inline-block',
          animation: `chatBounce 1.2s ease-in-out ${i * 0.22}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg }) {
  const [copied, setCopied] = useState(false);
  const isUser = msg.role === 'user';
  const ts = msg.time instanceof Date
    ? msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  const copy = async () => {
    try { await navigator.clipboard.writeText(msg.content); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { /* clipboard unavailable */ }
  };

  return (
    <div className="chat-bubble" style={{ display: 'flex', flexDirection: 'column',
      alignItems: isUser ? 'flex-end' : 'flex-start', gap: 3 }}>
      <div style={{ position: 'relative', maxWidth: '83%' }}>
        <div style={{
          padding: '9px 13px', lineHeight: 1.55, borderRadius: 14,
          borderBottomRightRadius: isUser ? 4 : 14,
          borderBottomLeftRadius:  isUser ? 14 : 4,
          background: isUser ? T.blue : msg.error ? '#2a0f0f' : T.raised,
          border: `1px solid ${isUser ? T.blue : msg.error ? '#ef444440' : T.border}`,
          color: msg.error ? '#f87171' : T.text,
          fontSize: 13, fontFamily: T.font, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          boxShadow: isUser ? `0 2px 12px ${T.blue}30` : 'none',
        }}>
          {msg.content}
        </div>
        <button className="chat-bubble-copy" onClick={copy}
          title={copied ? 'Copied!' : 'Copy'}
          aria-label={copied ? 'Copied' : 'Copy message'}
          style={{
            position: 'absolute', top: -8, [isUser ? 'left' : 'right']: -8,
            width: 22, height: 22, borderRadius: '50%',
            background: T.raised, border: `1px solid ${T.border}`,
            color: copied ? T.green : T.muted, cursor: 'pointer',
            fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {copied ? '✓' : '⎘'}
        </button>
      </div>
      <span style={{ fontSize: 10, color: T.faint, fontFamily: T.font, paddingLeft: 4, paddingRight: 4 }}>{ts}</span>
    </div>
  );
}

// ─── Main widget ─────────────────────────────────────────────────────────────
export default function AIChatWidget() {
  const INITIAL = [{
    role: 'assistant',
    content: "Hello! I'm your Railway AI Assistant 🚂\nI can search trains, check PNR, help with bookings and cancellations. How can I help you today?",
    time: new Date(),
  }];

  const [open,         setOpen]         = useState(false);
  const [messages,     setMessages]     = useState(INITIAL);
  const [input,        setInput]        = useState('');
  const [loading,      setLoading]      = useState(false);
  const [unread,       setUnread]       = useState(0);   // notification dot count
  const [bookingState, setBookingState] = useState(null); // Booking conversation state
  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const panelId    = 'ai-chat-panel';
  const inputId    = 'ai-chat-input';

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { if (open) { setTimeout(() => inputRef.current?.focus(), 120); setUnread(0); } }, [open]);

  // Keyboard shortcut Ctrl+/
  useEffect(() => {
    const h = (e) => { if (e.ctrlKey && e.key === '/') { e.preventDefault(); setOpen(o => !o); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const clearChat = () => {
    setMessages(INITIAL);
    setBookingState(null); // Reset booking state on clear
  };

  const sendMessage = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: msg, time: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      // Use the new conversational booking API with state management
      const currentUser = getCurrentUser();
      const res = await aiApi.chat(msg, history, bookingState, currentUser?.ID);

      // Extract reply and updated booking state
      const reply = res?.reply || res?.response?.message || res?.response || 'Sorry, I could not process that.';
      const newBookingState = res?.booking_state || null;
      const trigger = res?.trigger;

      // Update booking state
      if (newBookingState) {
        setBookingState(newBookingState);
      }

      // Clear booking state if booking is complete or cancelled
      if (trigger === 'booking_complete' || trigger === 'cancelled') {
        setBookingState(null);
      }

      let content = typeof reply === 'string' ? reply : JSON.stringify(reply, null, 2);
      const botMsg = { role: 'assistant', content, time: new Date() };
      setMessages(prev => [...prev, botMsg]);
      if (!open) setUnread(n => n + 1);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant', content: 'Connection issue. Please try again.',
        time: new Date(), error: true,
      }]);
    } finally { setLoading(false); }
  }, [input, messages, loading, open, bookingState]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  return (
    <>
      <style>{CSS}</style>

      {/* Floating toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        title="AI Assistant (Ctrl+/)"
        aria-label={open ? 'Close AI Assistant' : 'Open AI Assistant'}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
          width: 56, height: 56, borderRadius: '50%',
          background: open ? '#374151' : T.blue,
          border: 'none', cursor: 'pointer',
          boxShadow: open ? '0 2px 12px rgba(0,0,0,0.4)' : `0 4px 20px ${T.blue}60`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.2s ease', fontSize: 24,
        }}
      >
        {open ? '✕' : '🤖'}
        {/* Notification dot */}
        {!open && unread > 0 && (
          <span style={{
            position: 'absolute', top: 0, right: 0,
            width: 18, height: 18, borderRadius: '50%',
            background: '#ef4444', border: '2px solid #0a0d14',
            fontSize: 10, fontWeight: 700, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'chatPulse 1.5s ease-in-out infinite',
            fontFamily: T.font,
          }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Railway AI Assistant"
          aria-modal="false"
          className="chat-panel"
          style={{
            position: 'fixed', bottom: 90, right: 24, zIndex: 9998,
            width: 390, height: 560, borderRadius: 16,
            background: T.surface, border: `1px solid ${T.border}`,
            boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
            display: 'flex', flexDirection: 'column',
            fontFamily: T.font, overflow: 'hidden',
            animation: 'chatSlideUp 0.22s ease',
          }}
        >
          {/* ── Header ── */}
          <div style={{
            padding: '12px 16px', background: T.blue,
            display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🚂</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Railway AI Assistant</div>
              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
                Online · Powered by Qwen
              </div>
            </div>
            {/* Clear chat */}
            <button onClick={clearChat}
              title="Clear chat"
              aria-label="Clear chat history"
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none',
                color: 'rgba(255,255,255,0.7)', cursor: 'pointer',
                padding: '5px 9px', borderRadius: 6, fontSize: 11,
                fontFamily: T.font, transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.2)'}
              onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
            >↺ Clear</button>
          </div>

          {/* ── Messages ── */}
          <div
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
            style={{
              flex: 1, overflowY: 'auto', padding: '14px 14px 6px',
              display: 'flex', flexDirection: 'column', gap: 10,
              scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent`,
            }}
          >
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* ── Quick-action chips (only on first load) ── */}
          {messages.length <= 2 && (
            <div style={{
              padding: '8px 14px', display: 'flex', gap: 6, flexWrap: 'wrap',
              borderTop: `1px solid ${T.border}`,
            }}>
              {QUICK_ACTIONS.map((a, i) => (
                <button key={i}
                  onClick={() => sendMessage(`${a.icon} ${a.label}`)}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 11,
                    background: T.raised, border: `1px solid ${T.border}`,
                    color: T.muted, cursor: 'pointer', fontFamily: T.font,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { e.target.style.background = T.blue; e.target.style.color = '#fff'; e.target.style.borderColor = T.blue; }}
                  onMouseLeave={e => { e.target.style.background = T.raised; e.target.style.color = T.muted; e.target.style.borderColor = T.border; }}
                    >
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Input bar ── */}
          <div style={{
            padding: '10px 14px', borderTop: `1px solid ${T.border}`,
            display: 'flex', gap: 8, alignItems: 'flex-end', flexShrink: 0,
          }}>
            <textarea
              ref={inputRef}
              id={inputId}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask me anything about trains… (Enter to send)"
              rows={1}
              aria-label="Type your message"
              aria-describedby="ai-chat-hint"
              disabled={loading}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                background: T.bg, border: `1px solid ${T.border}`,
                color: T.text, fontSize: 13, fontFamily: T.font,
                outline: 'none', resize: 'none', lineHeight: 1.5,
                maxHeight: 90, overflowY: 'auto',
                transition: 'border-color 0.15s',
              }}
              onFocus={e  => e.target.style.borderColor = T.blue}
              onBlur={e   => e.target.style.borderColor = T.border}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              style={{
                width: 40, height: 40, borderRadius: 10, border: 'none',
                background: !input.trim() || loading ? '#1e2433' : T.blue,
                color:      !input.trim() || loading ? '#374151' : '#fff',
                cursor:     !input.trim() || loading ? 'default'  : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 18, transition: 'all 0.15s', flexShrink: 0,
                boxShadow: input.trim() && !loading ? `0 2px 8px ${T.blue}50` : 'none',
              }}
            >
              ➤
            </button>
          </div>
          <p id="ai-chat-hint" style={{ display: 'none' }}>Press Enter to send, Shift+Enter for new line</p>
        </div>
      )}
    </>
  );
}
