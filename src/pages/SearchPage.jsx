/**
 * SearchPage.jsx
 * Fixes applied:
 *  1. Sign In button in top-right of search header (not inline below results)
 *  2. InlineLogin rendered as a centered overlay modal (no blank page)
 *  3. Date filtering — only shows trains whose Departure_Time date matches selected date
 *  4. Standard professional fonts (Inter / system-ui, no decorative display fonts in data)
 *  5. handleSubmit uses finally{} so setLoading always resets
 *  6. userData guard before sessionStorage.setItem
 */
import { useState, useCallback, useEffect } from 'react';
import {
  trainsApi, bookingsApi, stationsApi, authApi, connectingTrainsApi, faresApi,
  extractRecords, getRecordId, extractTime,
} from '../services/api';
import { useApi } from '../hooks/useApi';
import { useToast } from '../context/ToastContext';
import { PageHeader, Card, Icon, Spinner } from '../components/UI';

// ─── Constants ────────────────────────────────────────────────────────────────
const IRCTC_CLASSES = [
  { value: 'SL', label: 'SL — Sleeper Class' },
  { value: '3A', label: '3A — AC 3 Tier' },
  { value: '2A', label: '2A — AC 2 Tier' },
  { value: '1A', label: '1A — AC First Class' },
  { value: 'CC', label: 'CC — AC Chair Car' },
  { value: 'EC', label: 'EC — Executive Chair Car' },
  { value: '2S', label: '2S — Second Sitting' },
  { value: 'FC', label: 'FC — First Class' },
];
const IRCTC_QUOTAS = [
  { value: 'GN', label: 'GN — General Quota' },
  { value: 'TQ', label: 'TQ — Tatkal' },
  { value: 'PT', label: 'PT — Premium Tatkal' },
  { value: 'LD', label: 'LD — Ladies Quota' },
  { value: 'SS', label: 'SS — Senior Citizen' },
  { value: 'HP', label: 'HP — Physically Handicapped' },
  { value: 'DF', label: 'DF — Defence Quota' },
];
const IRCTC_GENDERS = ['Male', 'Female', 'Transgender'];
const IRCTC_BERTHS  = ['No Preference', 'Lower', 'Middle', 'Upper', 'Side Lower', 'Side Upper'];

const CLASS_FARE_KEY  = { SL: 'Fare_SL', '3A': 'Fare_3A', '2A': 'Fare_2A', '1A': 'Fare_1A', CC: 'Fare_CC', EC: 'Fare_EC', '2S': 'Fare_2S', FC: 'Fare_1A' };
const CLASS_SEATS_KEY = { SL: 'Total_Seats_SL', '3A': 'Total_Seats_3A', '2A': 'Total_Seats_2A', '1A': 'Total_Seats_1A', CC: 'Total_Seats_CC', EC: 'Total_Seats_CC', '2S': 'Total_Seats_SL', FC: 'Total_Seats_1A' };
const TATKAL_CHARGE   = { SL: 100, '3A': 300, '2A': 400, '1A': 500, CC: 125, EC: 200, '2S': 10, FC: 400 };
const CLASS_ALL_KEYS  = [
  ['SL', 'Fare_SL', 'Total_Seats_SL'],
  ['3A', 'Fare_3A', 'Total_Seats_3A'],
  ['2A', 'Fare_2A', 'Total_Seats_2A'],
  ['1A', 'Fare_1A', 'Total_Seats_1A'],
  ['CC', 'Fare_CC', 'Total_Seats_CC'],
  ['EC', 'Fare_EC', 'Total_Seats_EC'],
  ['2S', 'Fare_2S', 'Total_Seats_2S'],
];

// ─── Shared style tokens ──────────────────────────────────────────────────────
const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const MONO = "'JetBrains Mono', 'Fira Code', 'Courier New', monospace";

const inputBase = {
  boxSizing: 'border-box',
  width: '100%',
  padding: '10px 14px',
  background: '#0a0d14',
  border: '1px solid #1e2433',
  borderRadius: 8,
  color: '#d1d5db',
  fontSize: 13,
  fontFamily: FONT,
  outline: 'none',
  transition: 'border-color 0.15s',
  appearance: 'none',
};
const labelBase = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 5,
  fontFamily: FONT,
};

function today() { return new Date().toISOString().split('T')[0]; }

// ─── Parse Zoho date string → "YYYY-MM-DD" for comparison ─────────────────────
function parseTrainDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // ISO: "2026-04-09T00:09:54" or "2026-04-09"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Zoho: "09-Mar-2026 00:09:54"
  const MONTHS = { Jan:'01', Feb:'02', Mar:'03', Apr:'04', May:'05', Jun:'06', Jul:'07', Aug:'08', Sep:'09', Oct:'10', Nov:'11', Dec:'12' };
  const m = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (m) return `${m[3]}-${MONTHS[m[2]] || '01'}-${m[1]}`;
  return null;
}

// Removed client-side calcFare, we now use backend `/api/fares/calculate`

// ─── Step progress bar ────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Search', 'Passengers', 'Payment', 'Confirmed'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
      {steps.map((label, i) => {
        const done = i < step, active = i === step;
        const col = done ? '#22c55e' : active ? '#3b82f6' : '#374151';
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid ${col}`, background: done ? '#0f2a1e' : active ? '#0f1a2a' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: col, fontFamily: FONT }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: col, whiteSpace: 'nowrap', fontFamily: FONT }}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ flex: 1, height: 2, margin: '0 8px', marginBottom: 22, background: done ? '#22c55e' : '#1e2433', borderRadius: 1 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Train result card ────────────────────────────────────────────────────────
function TrainCard({ train, selectedClass, onBook }) {
  const [showDetails, setShowDetails] = useState(false);
  const name  = train.Train_Name   || 'Unknown Train';
  const number = train.Train_Number || '—';
  const fromR = train.From_Station || train.Source_Station;
  const toR   = train.To_Station   || train.Destination_Station;
  const from  = typeof fromR === 'object' ? (fromR?.display_value || '—') : (fromR || '—');
  const to    = typeof toR   === 'object' ? (toR?.display_value   || '—') : (toR   || '—');
  const cls   = selectedClass || 'SL';
  const fare  = train[CLASS_FARE_KEY[cls]  || 'Fare_SL'];
  const seats = train[CLASS_SEATS_KEY[cls] || 'Total_Seats_SL'];
  const depDate = parseTrainDate(train.Departure_Time);

  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 10, overflow: 'hidden', transition: 'border-color 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#3b82f6'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>

      {/* Main row */}
      <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>

        {/* Left: Train info */}
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="train" size={17} />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontFamily: FONT }}>{name}</div>
              <div style={{ fontSize: 11, fontFamily: MONO, color: '#3b82f6', marginTop: 1 }}>
                #{number}{train.Train_Type ? ` · ${train.Train_Type}` : ''}
                {depDate && <span style={{ marginLeft: 8, color: '#6b7280', fontFamily: FONT }}>{depDate}</span>}
              </div>
            </div>
          </div>
          {/* Route timing */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: MONO }}>{extractTime(train.Departure_Time)}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: FONT }}>{from}</div>
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ flex: 1, height: 1, background: '#1e2433' }} />
              <span style={{ fontSize: 10, color: '#374151' }}>▶</span>
              <div style={{ flex: 1, height: 1, background: '#1e2433' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', fontFamily: MONO }}>{extractTime(train.Arrival_Time)}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, fontFamily: FONT }}>{to}</div>
            </div>
          </div>
        </div>

        {/* Right: Fare + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
          {fare != null && fare !== '' ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e', fontFamily: FONT }}>₹{fare}</div>
              <div style={{ fontSize: 11, color: '#6b7280', fontFamily: FONT }}>per passenger · {cls}</div>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: '#6b7280', fontFamily: FONT }}>Fare N/A</div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {seats != null && seats !== '' && (
              <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: '#0f2a1e', color: '#22c55e', border: '1px solid #14532d', fontFamily: FONT }}>
                {seats} seats
              </span>
            )}
            <button
              onClick={() => setShowDetails(d => !d)}
              style={{ padding: '7px 14px', borderRadius: 7, border: '1px solid #1e2433', background: showDetails ? 'rgba(59,130,246,0.1)' : 'transparent', color: showDetails ? '#60a5fa' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              {showDetails ? 'Hide ▲' : 'Details ▼'}
            </button>
            <button
              onClick={() => onBook(train)}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
              Book Now
            </button>
          </div>
        </div>
      </div>

      {/* Expandable details */}
      {showDetails && (
        <div style={{ borderTop: '1px solid #1e2433', padding: '14px 20px', background: '#080b11' }}>
          {/* All class fares */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, marginBottom: 14 }}>
            {CLASS_ALL_KEYS.map(([c, fk, sk]) => {
              const f = train[fk]; const s = train[sk];
              const hasData = (f && f !== '') || (s && s !== '');
              return (
                <div key={c} style={{ background: cls === c ? 'rgba(37,99,235,0.12)' : '#0d1017', border: `1px solid ${cls === c ? '#2563eb' : '#1e2433'}`, borderRadius: 7, padding: '9px 10px', textAlign: 'center', opacity: hasData ? 1 : 0.35 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: cls === c ? '#60a5fa' : '#9ca3af', marginBottom: 3, fontFamily: FONT }}>{c}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#22c55e', fontFamily: FONT }}>{f && f !== '' ? `₹${f}` : '—'}</div>
                  <div style={{ fontSize: 10, color: '#4b5563', marginTop: 2, fontFamily: FONT }}>{s && s !== '' ? `${s} seats` : 'N/A'}</div>
                </div>
              );
            })}
          </div>
          {/* Train metadata */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 6 }}>
            {[
              ['Train No.', `#${train.Train_Number || '—'}`],
              ['Type',      train.Train_Type   || '—'],
              ['Run Days',  train.Run_Days     || 'Daily'],
              ['Status',    train.Is_Active === 'true' ? 'Active' : 'Inactive'],
              ['Departure', train.Departure_Time || '—'],
              ['Arrival',   train.Arrival_Time   || '—'],
              ['Duration',  train.Duration        || '—'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 10px', background: '#0d1017', borderRadius: 6, gap: 8 }}>
                <span style={{ fontSize: 11, color: '#6b7280', fontFamily: FONT }}>{l}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#d1d5db', textAlign: 'right', fontFamily: FONT }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Inline Login Modal overlay ───────────────────────────────────────────────
function LoginModal({ onLogin, onCancel }) {
  const { addToast } = useToast();
  const [mode, setMode]     = useState('login');
  const [loading, setLoading] = useState(false);
  const [form, setForm]     = useState({ Full_Name: '', Email: '', Password: '', Phone_Number: '' });
  const [errors, setErrors] = useState({});

  const iS = { ...inputBase, padding: '11px 14px' };
  const lS = { ...labelBase };

  const hc = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (mode === 'register' && !form.Full_Name.trim()) e.Full_Name = 'Required';
    if (!form.Email.trim() || !/\S+@\S+\.\S+/.test(form.Email)) e.Email = 'Valid email required';
    if (!form.Password || form.Password.length < 6) e.Password = 'Min 6 characters';
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await authApi.login({ Email: form.Email, Password: form.Password });
        if (res?.success === false) throw new Error(res.error || 'Login failed');
        // Safely extract user object
        const userData = res?.user ?? res?.data?.data ?? res?.data ?? res;
        if (!userData || typeof userData !== 'object' || Array.isArray(userData)) {
          throw new Error('Invalid response from server. Check API.');
        }
        sessionStorage.setItem('rail_user', JSON.stringify(userData));
        addToast(`Welcome back, ${userData.Full_Name || 'User'}!`, 'success');
        onLogin(userData);
      } else {
        const res = await authApi.register({ Full_Name: form.Full_Name, Email: form.Email, Password: form.Password, Phone_Number: form.Phone_Number });
        if (res?.success === false) throw new Error(res.error || 'Registration failed');
        addToast('Account created. Please sign in.', 'success');
        setMode('login');
        setForm(f => ({ ...f, Full_Name: '', Password: '', Phone_Number: '' }));
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false); // always resets — prevents frozen spinner
    }
  };

  return (
    // Overlay backdrop
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>

      <div style={{ width: '100%', maxWidth: 400, background: '#0e1117', border: '1px solid #1e2433', borderRadius: 14, padding: 28, boxShadow: '0 24px 80px rgba(0,0,0,0.6)', fontFamily: FONT }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', fontFamily: FONT }}>
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, fontFamily: FONT }}>
              {mode === 'login' ? 'Sign in to book tickets' : 'Register a new account'}
            </div>
          </div>
          <button onClick={onCancel} style={{ width: 30, height: 30, borderRadius: 7, border: '1px solid #1e2433', background: 'transparent', color: '#6b7280', cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>×</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: 'flex', background: '#080b11', border: '1px solid #1e2433', borderRadius: 8, padding: 3, marginBottom: 20, gap: 3 }}>
          {['login', 'register'].map(t => (
            <button key={t} onClick={() => { setMode(t); setErrors({}); }}
              style={{ flex: 1, padding: '8px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, background: mode === t ? '#2563eb' : 'transparent', color: mode === t ? '#fff' : '#6b7280' }}>
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {mode === 'register' && (
            <div>
              <label style={lS}>Full Name</label>
              <input name="Full_Name" value={form.Full_Name} onChange={hc} placeholder="Rahul Sharma"
                style={{ ...iS, borderColor: errors.Full_Name ? '#ef4444' : '#1e2433' }}
                onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = errors.Full_Name ? '#ef4444' : '#1e2433'} />
              {errors.Full_Name && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Full_Name}</p>}
            </div>
          )}
          <div>
            <label style={lS}>Email Address</label>
            <input name="Email" value={form.Email} onChange={hc} type="email" placeholder="you@example.com"
              style={{ ...iS, borderColor: errors.Email ? '#ef4444' : '#1e2433' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = errors.Email ? '#ef4444' : '#1e2433'} />
            {errors.Email && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Email}</p>}
          </div>
          <div>
            <label style={lS}>Password</label>
            <input name="Password" value={form.Password} onChange={hc} type="password" placeholder="Min. 6 characters"
              style={{ ...iS, borderColor: errors.Password ? '#ef4444' : '#1e2433' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = errors.Password ? '#ef4444' : '#1e2433'}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} />
            {errors.Password && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.Password}</p>}
          </div>
          {mode === 'register' && (
            <div>
              <label style={lS}>Phone Number</label>
              <input name="Phone_Number" value={form.Phone_Number} onChange={hc} type="tel" placeholder="9876543210"
                style={{ ...iS, borderColor: '#1e2433' }}
                onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#1e2433'} />
            </div>
          )}
        </div>

        {/* Submit */}
        <button onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 8, border: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: loading ? '#1e2433' : '#2563eb', color: loading ? '#6b7280' : '#fff', transition: 'background 0.15s' }}>
          {loading
            ? <><Spinner size={16} color="#6b7280" />{mode === 'login' ? 'Signing in...' : 'Creating account...'}</>
            : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#6b7280', fontFamily: FONT }}>
          {mode === 'login'
            ? <>No account?{' '}<span onClick={() => { setMode('register'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Register here</span></>
            : <>Have an account?{' '}<span onClick={() => { setMode('login'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>}
        </p>
      </div>
    </div>
  );
}

// ─── Passenger form ───────────────────────────────────────────────────────────
function PassengerForm({ train, searchForm, user, onBack, onProceed }) {
  const fromR = train.From_Station || train.Source_Station;
  const toR   = train.To_Station   || train.Destination_Station;
  const from  = typeof fromR === 'object' ? (fromR?.display_value || '—') : (fromR || '—');
  const to    = typeof toR   === 'object' ? (toR?.display_value   || '—') : (toR   || '—');
  const todayStr = today();

  const [journeyDate, setJourneyDate] = useState(searchForm.date || '');
  const [cls,   setCls]   = useState(searchForm.seat_class || 'SL');
  const [quota, setQuota] = useState('GN');
  const [paxCount, setPaxCount] = useState(1);
  const [optCatering, setOptCatering] = useState(false);
  const [passengers, setPassengers] = useState([{ name: user?.Full_Name || '', age: '', gender: 'Male', berthPref: 'No Preference', idCard: '' }]);
  const [errors, setErrors] = useState({});
  const [fare, setFare] = useState({ total: 0, base_fare: 0, tatkal_premium: 0, concession_discount: 0, gst: 0, convenience_fee: 0, catering_charge: 0, superfast_charge: 0, reservation_charge: 0 });
  const [loadingFare, setLoadingFare] = useState(false);

  const iS = { ...inputBase, padding: '9px 12px' };
  const lS = { ...labelBase, fontSize: 10 };

  const updateCount = n => {
    const c = Number(n); setPaxCount(c);
    setPassengers(prev => {
      const a = [...prev];
      while (a.length < c) a.push({ name: '', age: '', gender: 'Male', berthPref: 'No Preference', idCard: '' });
      return a.slice(0, c);
    });
  };
  const updatePax = (i, f, v) => {
    setPassengers(p => p.map((x, j) => j === i ? { ...x, [f]: v } : x));
    if (errors[`p_${i}_${f}`]) setErrors(e => ({ ...e, [`p_${i}_${f}`]: '' }));
  };

  // Fetch dynamic fare from backend whenever inputs change
  useEffect(() => {
    let active = true;
    async function getFare() {
        setLoadingFare(true);
        try {
            const trainId = getRecordId(train);
            const req = {
                train_id: trainId,
                class: cls,
                passenger_count: paxCount,
                concession_type: quota === 'SS' ? 'Senior' : 'General',
                journey_date: journeyDate,
                quota: quota,
                opt_catering: optCatering
            };
            const res = await faresApi.calculate(req);
            if (active && res?.success && res?.data) {
                setFare(res.data);
            }
        } catch(err) {
            console.error('Error fetching fare:', err);
        } finally {
            if (active) setLoadingFare(false);
        }
    }
    getFare();
    return () => { active = false; };
  }, [train, cls, paxCount, quota, journeyDate, optCatering]);

  const validate = () => {
    const e = {};
    if (!journeyDate)              e.journeyDate = 'Journey date required';
    else if (journeyDate < todayStr) e.journeyDate = 'Past dates not allowed';
    passengers.forEach((p, i) => {
      if (!p.name.trim())          e[`p_${i}_name`] = 'Name required';
      else if (p.name.trim().length > 255) e[`p_${i}_name`] = 'Max 255 characters';
      if (!p.age)                  e[`p_${i}_age`]  = 'Age required';
    });
    return e;
  };

  const proceed = () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onProceed({ journeyDate, seatClass: cls, quota, optCatering, passengers, passengerCount: paxCount, fare });
  };

  return (
    <div>
      {/* Train summary bar */}
      <div style={{ background: '#080b11', border: '1px solid #1e2433', borderRadius: 9, padding: '12px 16px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f3f4f6', fontFamily: FONT }}>{train.Train_Name || 'Train'}</div>
          <div style={{ fontSize: 11, fontFamily: MONO, color: '#3b82f6', marginTop: 1 }}>#{train.Train_Number || '—'} · {from} → {to}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontFamily: FONT }}>Total Fare</div>
          <div style={{ fontSize: 19, fontWeight: 700, color: '#22c55e', fontFamily: FONT }}>
            {loadingFare ? <Spinner size={14} color="#22c55e" /> : `₹${fare.total || 0}`}
          </div>
        </div>
      </div>

      {/* Journey options */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 20 }}>
        <div>
          <label style={lS}>Journey Date *</label>
          <input type="date" value={journeyDate} min={todayStr}
            onChange={e => { setJourneyDate(e.target.value); if (errors.journeyDate) setErrors(er => ({ ...er, journeyDate: '' })); }}
            style={{ ...iS, borderColor: errors.journeyDate ? '#ef4444' : '#1e2433', cursor: 'pointer' }} />
          {errors.journeyDate && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.journeyDate}</p>}
        </div>
        <div>
          <label style={lS}>Class</label>
          <select value={cls} onChange={e => setCls(e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
            {IRCTC_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={lS}>Quota</label>
          <select value={quota} onChange={e => setQuota(e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
            {IRCTC_QUOTAS.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
          </select>
          {quota === 'TQ' && <p style={{ margin: '3px 0 0', fontSize: 10, color: '#fbbf24', fontFamily: FONT }}>Tatkal: +₹{TATKAL_CHARGE[cls] || 100}/pax</p>}
          {quota === 'SS' && <p style={{ margin: '3px 0 0', fontSize: 10, color: '#22c55e', fontFamily: FONT }}>Senior: 40% discount applied</p>}
        </div>
        <div>
          <label style={lS}>Passengers (max 6)</label>
          <select value={paxCount} onChange={e => updateCount(e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
            {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} Passenger{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>
      </div>

      {/* Passenger rows */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 10, fontFamily: FONT }}>Passenger Details</div>
        {passengers.map((p, i) => (
          <div key={i} style={{ background: '#080b11', border: `1px solid ${Object.keys(errors).some(k => k.startsWith(`p_${i}_`)) ? '#ef4444' : '#1e2433'}`, borderRadius: 9, padding: 12, marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: FONT }}>
              Passenger {i + 1}{i === 0 ? ' (Primary)' : ''}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lS}>Name * (max 255)</label>
                <input value={p.name} maxLength={255} onChange={e => updatePax(i, 'name', e.target.value)}
                  placeholder="Full name as per ID"
                  style={{ ...iS, borderColor: errors[`p_${i}_name`] ? '#ef4444' : '#1e2433' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                  {errors[`p_${i}_name`] && <p style={{ margin: 0, fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors[`p_${i}_name`]}</p>}
                  <span style={{ fontSize: 10, color: p.name.length > 200 ? '#fbbf24' : '#374151', marginLeft: 'auto', fontFamily: FONT }}>{p.name.length}/255</span>
                </div>
              </div>
              <div>
                <label style={lS}>Age * (1–125)</label>
                <select value={p.age} onChange={e => updatePax(i, 'age', e.target.value)}
                  style={{ ...iS, cursor: 'pointer', borderColor: errors[`p_${i}_age`] ? '#ef4444' : '#1e2433' }}>
                  <option value="">Select age</option>
                  {Array.from({ length: 125 }, (_, n) => n + 1).map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                {errors[`p_${i}_age`] && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors[`p_${i}_age`]}</p>}
              </div>
              <div>
                <label style={lS}>Gender</label>
                <select value={p.gender} onChange={e => updatePax(i, 'gender', e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
                  {IRCTC_GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={lS}>Berth Preference</label>
                <select value={p.berthPref} onChange={e => updatePax(i, 'berthPref', e.target.value)} style={{ ...iS, cursor: 'pointer' }}>
                  {IRCTC_BERTHS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <label style={lS}>ID Card Number (Optional)</label>
                <input value={p.idCard} maxLength={50} onChange={e => updatePax(i, 'idCard', e.target.value)}
                  placeholder="Aadhar / PAN / Passport"
                  style={{ ...iS, borderColor: '#1e2433' }} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#080b11', border: '1px solid #1e2433', borderRadius: 9, padding: '13px 16px', marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: FONT }}>Fare Preview</div>
        
        {loadingFare ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}><Spinner size={24} color="#3b82f6" /></div>
        ) : (
          <>
            {[
              [`Base (${paxCount} pax)`, `₹${fare.base_fare}`, null],
              fare.reservation_charge > 0 ? ['Reservation Charge', `+₹${fare.reservation_charge}`, null] : null,
              fare.superfast_charge > 0 ? ['Superfast Surcharge', `+₹${fare.superfast_charge}`, null] : null,
              fare.tatkal_premium > 0 ? ['Tatkal Premium', `+₹${fare.tatkal_premium}`, '#fbbf24'] : null,
              fare.concession_discount < 0 ? ['Senior Concession', `${fare.concession_discount}`, '#22c55e'] : null,
              fare.catering_charge > 0 ? ['Catering', `+₹${fare.catering_charge}`, null] : null,
              fare.gst > 0 ? ['GST 5%', `+₹${fare.gst}`, null] : null,
              ['Convenience Fee', `+₹${fare.convenience_fee}`, null],
            ].filter(Boolean).map(([l, v, c], idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c || '#9ca3af', marginBottom: 5, fontFamily: FONT }}>
                <span>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid #1e2433', paddingTop: 9, marginTop: 5, display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 700, color: '#22c55e', fontFamily: FONT }}>
              <span>Total</span><span>₹{fare.total}</span>
            </div>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={onBack} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #1e2433', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>← Back</button>
        <button onClick={proceed} style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>Review & Pay →</button>
      </div>
    </div>
  );
}

// ─── Payment step ─────────────────────────────────────────────────────────────
function PaymentStep({ train, bookingData, onBack, onPay, paying }) {
  const [method, setMethod] = useState('upi');
  const [upiId, setUpiId]   = useState('');
  const [card, setCard]     = useState({ number: '', expiry: '', cvv: '', name: '' });
  const [errors, setErrors] = useState({});
  const { journeyDate, seatClass, quota, passengers, passengerCount, fare } = bookingData;

  const iS  = { ...inputBase };
  const lS  = { ...labelBase };
  const rowS = { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #0d1017', fontSize: 13, fontFamily: FONT };
  const METHODS = [
    { id: 'upi',    label: 'UPI',              icon: '📱' },
    { id: 'card',   label: 'Debit/Credit Card', icon: '💳' },
    { id: 'nb',     label: 'Net Banking',       icon: '🏦' },
    { id: 'wallet', label: 'Wallet',            icon: '👛' },
  ];
  const qLabel = IRCTC_QUOTAS.find(q => q.value === quota)?.label || quota;

  const validateAndPay = () => {
    const e = {};
    if (method === 'upi'  && !upiId.trim()) e.upiId = 'UPI ID required';
    if (method === 'card') {
      if (card.number.replace(/\s/g, '').length < 16) e.cardNum  = 'Valid 16-digit number';
      if (!card.expiry.match(/^\d{2}\/\d{2}$/))       e.expiry   = 'Format: MM/YY';
      if (card.cvv.length < 3)                         e.cvv      = 'CVV required';
      if (!card.name.trim())                           e.cardName = 'Name required';
    }
    if (Object.keys(e).length) { setErrors(e); return; }
    onPay({ method, upiId, card });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20, alignItems: 'start' }}>
      <div>
        {/* Summary */}
        <div style={{ background: '#080b11', border: '1px solid #1e2433', borderRadius: 9, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, fontFamily: FONT }}>Booking Summary</div>
          {[
            ['Train',      train.Train_Name || '—'],
            ['Date',       journeyDate],
            ['Class',      seatClass],
            ['Quota',      qLabel],
            ['Passengers', passengerCount],
            ['Names',      passengers.map(p => p.name).join(', ')],
          ].map(([l, v]) => (
            <div key={l} style={rowS}>
              <span style={{ color: '#6b7280' }}>{l}</span>
              <span style={{ fontWeight: 600, maxWidth: '60%', textAlign: 'right', wordBreak: 'break-word', color: '#d1d5db' }}>{v}</span>
            </div>
          ))}
        </div>

        {/* Payment method */}
        <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 10, fontFamily: FONT }}>Payment Method</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
          {METHODS.map(m => (
            <button key={m.id} onClick={() => setMethod(m.id)}
              style={{ padding: '8px 14px', borderRadius: 8, border: `1.5px solid ${method === m.id ? '#2563eb' : '#1e2433'}`, background: method === m.id ? 'rgba(37,99,235,0.1)' : 'transparent', color: method === m.id ? '#60a5fa' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </div>

        {method === 'upi' && (
          <div>
            <label style={lS}>UPI ID</label>
            <input value={upiId} onChange={e => { setUpiId(e.target.value); setErrors(er => ({ ...er, upiId: '' })); }} placeholder="yourname@upi"
              style={{ ...iS, borderColor: errors.upiId ? '#ef4444' : '#1e2433' }} />
            {errors.upiId && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.upiId}</p>}
            <div style={{ marginTop: 8, padding: '9px 12px', background: '#080b11', borderRadius: 7, border: '1px solid #1e2433', fontSize: 11, color: '#6b7280', fontFamily: FONT }}>Demo mode — any UPI format accepted.</div>
          </div>
        )}
        {method === 'card' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={lS}>Card Number</label>
              <input value={card.number}
                onChange={e => { const v = e.target.value.replace(/\D/g,'').slice(0,16).replace(/(.{4})/g,'$1 ').trim(); setCard(c => ({ ...c, number: v })); }}
                placeholder="1234 5678 9012 3456" maxLength={19}
                style={{ ...iS, fontFamily: MONO, borderColor: errors.cardNum ? '#ef4444' : '#1e2433' }} />
              {errors.cardNum && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.cardNum}</p>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div>
                <label style={lS}>Expiry</label>
                <input value={card.expiry} onChange={e => { let v = e.target.value.replace(/\D/g,'').slice(0,4); if (v.length > 2) v = v.slice(0,2) + '/' + v.slice(2); setCard(c => ({ ...c, expiry: v })); }} placeholder="MM/YY" maxLength={5} style={{ ...iS, borderColor: errors.expiry ? '#ef4444' : '#1e2433' }} />
                {errors.expiry && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.expiry}</p>}
              </div>
              <div>
                <label style={lS}>CVV</label>
                <input value={card.cvv} onChange={e => setCard(c => ({ ...c, cvv: e.target.value.replace(/\D/g,'').slice(0,4) }))} placeholder="•••" maxLength={4} type="password" style={{ ...iS, borderColor: errors.cvv ? '#ef4444' : '#1e2433' }} />
                {errors.cvv && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.cvv}</p>}
              </div>
              <div>
                <label style={lS}>Name on Card</label>
                <input value={card.name} onChange={e => setCard(c => ({ ...c, name: e.target.value }))} placeholder="As on card" style={{ ...iS, borderColor: errors.cardName ? '#ef4444' : '#1e2433' }} />
                {errors.cardName && <p style={{ margin: '4px 0 0', fontSize: 11, color: '#f87171', fontFamily: FONT }}>{errors.cardName}</p>}
              </div>
            </div>
          </div>
        )}
        {(method === 'nb' || method === 'wallet') && (
          <div style={{ padding: 20, background: '#080b11', borderRadius: 9, textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>{method === 'nb' ? '🏦' : '👛'}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db', marginBottom: 4, fontFamily: FONT }}>{method === 'nb' ? 'Net Banking' : 'Wallet'}</div>
            <div style={{ fontSize: 12, color: '#6b7280', fontFamily: FONT }}>Demo mode — click Pay Now to proceed.</div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onBack} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid #1e2433', background: 'transparent', color: '#9ca3af', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>← Back</button>
          <button onClick={validateAndPay} disabled={paying}
            style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none', background: paying ? '#1e2433' : '#059669', color: paying ? '#6b7280' : '#fff', fontSize: 14, fontWeight: 600, cursor: paying ? 'not-allowed' : 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {paying ? <><Spinner size={16} color="#6b7280" />Processing...</> : `Pay ₹${fare.total}`}
          </button>
        </div>
      </div>

      {/* Fare sidebar */}
      <div style={{ background: '#0e1117', border: '1px solid #1e2433', borderRadius: 10, padding: 18, position: 'sticky', top: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, fontFamily: FONT }}>Fare Breakdown</div>
        {[
          [`Base (${passengerCount} pax)`, `₹${fare.base_fare}`, null],
          fare.reservation_charge > 0 ? ['Reservation Charge', `+₹${fare.reservation_charge}`, null] : null,
          fare.superfast_charge > 0 ? ['Superfast Surcharge', `+₹${fare.superfast_charge}`, null] : null,
          fare.tatkal_premium > 0 ? ['Tatkal Premium', `+₹${fare.tatkal_premium}`, '#fbbf24'] : null,
          fare.concession_discount < 0 ? ['Senior Concession', `${fare.concession_discount}`, '#22c55e'] : null,
          fare.catering_charge > 0 ? ['Catering', `+₹${fare.catering_charge}`, null] : null,
          fare.gst > 0 ? ['GST 5%', `+₹${fare.gst}`, null] : null,
          ['Convenience Fee', `+₹${fare.convenience_fee}`, null],
        ].filter(Boolean).map((r, i) => {
          const l = Array.isArray(r) ? r[0] : r.label;
          const v = Array.isArray(r) ? r[1] : r.val;
          const c = Array.isArray(r) ? r[2] : r.color;
          return (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7, fontSize: 12, color: c || '#9ca3af', fontFamily: FONT }}>
              <span>{l}</span><span style={{ fontWeight: 600 }}>{v}</span>
            </div>
          );
        })}
        <div style={{ borderTop: '1px solid #1e2433', marginTop: 10, paddingTop: 10, display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, color: '#22c55e', fontFamily: FONT }}>
          <span>Total</span><span>₹{fare.total}</span>
        </div>
      </div>
    </div>
  );
}

// ─── PNR Confirmation ─────────────────────────────────────────────────────────
function PNRConfirmation({ booking, train, bookingData, onDone }) {
  const pnr   = booking?.PNR || booking?.data?.PNR || booking?.data?.data?.PNR || bookingData?._pnr || 'N/A';
  const fromR = train.From_Station || train.Source_Station;
  const toR   = train.To_Station   || train.Destination_Station;
  const from  = typeof fromR === 'object' ? (fromR?.display_value || '—') : (fromR || '—');
  const to    = typeof toR   === 'object' ? (toR?.display_value   || '—') : (toR   || '—');
  const fare  = bookingData.fare;
  const qLabel = IRCTC_QUOTAS.find(q => q.value === bookingData.quota)?.label || bookingData.quota;

  return (
    <div style={{ textAlign: 'center', fontFamily: FONT }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#0f2a1e', border: '2px solid #22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
          <span style={{ fontSize: 30, color: '#22c55e' }}>✓</span>
        </div>
        <h2 style={{ margin: '0 0 5px', fontSize: 22, fontWeight: 700, color: '#22c55e', fontFamily: FONT }}>Booking Confirmed</h2>
        <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontFamily: FONT }}>Your ticket has been booked and payment received.</p>
      </div>

      {/* PNR block */}
      <div style={{ background: '#0f2a1e', border: '1px solid #14532d', borderRadius: 12, padding: '18px 24px', marginBottom: 20, display: 'inline-block', minWidth: 270 }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6, fontFamily: FONT }}>PNR Number</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: '#fff', fontFamily: MONO, letterSpacing: '0.1em' }}>{pnr}</div>
        <div style={{ fontSize: 11, color: '#22c55e', marginTop: 5, fontFamily: FONT }}>Payment Confirmed · Status: Confirmed</div>
      </div>

      {/* Details */}
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10, padding: 18, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14, padding: '11px 14px', background: '#080b11', borderRadius: 8 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', fontFamily: MONO }}>{extractTime(train.Departure_Time)}</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: FONT }}>{from}</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ flex: 1, height: 1, background: '#1e2433' }} />
            <span style={{ fontSize: 14 }}>🚂</span>
            <div style={{ flex: 1, height: 1, background: '#1e2433' }} />
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#f3f4f6', fontFamily: MONO }}>{extractTime(train.Arrival_Time)}</div>
            <div style={{ fontSize: 11, color: '#6b7280', fontFamily: FONT }}>{to}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px 20px' }}>
          {[
            ['Train',      train.Train_Name || '—',    null],
            ['Date',       bookingData.journeyDate,     null],
            ['Class',      bookingData.seatClass,       null],
            ['Quota',      qLabel,                      null],
            ['Passengers', bookingData.passengerCount,  null],
            ['Total Fare', `₹${fare.total}`,            '#22c55e'],
            ['Payment',    'Paid',                      '#22c55e'],
          ].map(([l, v, a]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #0d1017', fontSize: 12, fontFamily: FONT }}>
              <span style={{ color: '#6b7280', fontWeight: 500 }}>{l}</span>
              <span style={{ fontWeight: 600, color: a || '#d1d5db' }}>{v}</span>
            </div>
          ))}
        </div>

        {bookingData.passengers?.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 7, fontFamily: FONT }}>Passengers</div>
            {bookingData.passengers.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 14, padding: '5px 0', borderBottom: '1px solid #0d1017', fontSize: 12, fontFamily: FONT }}>
                <span style={{ fontWeight: 600, color: '#d1d5db', minWidth: 120 }}>{i + 1}. {p.name}</span>
                <span style={{ color: '#6b7280' }}>Age {p.age}</span>
                <span style={{ color: '#6b7280' }}>{p.gender}</span>
                <span style={{ color: '#6b7280' }}>{p.berthPref}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button
          onClick={() => navigator.clipboard.writeText(`PNR: ${pnr}\nTrain: ${train.Train_Name || ''}\nDate: ${bookingData.journeyDate}\nClass: ${bookingData.seatClass}\nTotal: ₹${fare.total}`).catch(() => {})}
          style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid #1e2433', background: 'transparent', color: '#9ca3af', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
          Copy PNR
        </button>
        <button onClick={onDone}
          style={{ padding: '9px 22px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT }}>
          Search More Trains
        </button>
      </div>
    </div>
  );
}

// ─── Main SearchPage ──────────────────────────────────────────────────────────
export default function SearchPage() {
  const { addToast } = useToast();
  const todayStr = today();

  const [user, setUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('rail_user')); } catch { return null; }
  });
  const [form, setForm]               = useState({ from: '', to: '', date: '', seat_class: 'SL' });
  const [results, setResults]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [step, setStep]               = useState(null);
  const [selectedTrain, setSelectedTrain] = useState(null);
  const [bookingData, setBookingData] = useState(null);
  const [booking, setBooking]         = useState(null);
  const [paying, setPaying]           = useState(false);
  const [showLogin, setShowLogin]     = useState(false);
  const [connecting, setConnecting]   = useState(null); // null | []
  const [viaTrains, setViaTrains]     = useState(null); // null | [] — trains passing through a station
  const [searchTab, setSearchTab]     = useState('direct'); // 'direct' | 'connecting' | 'via'

  const fetchSt = useCallback(() => stationsApi.getAll(), []);
  const { data: stData } = useApi(fetchSt);
  const stations = extractRecords(stData);
  const stOpts   = stations.map(s => ({ value: s.Station_Code || s.ID, label: `${s.Station_Code} – ${s.Station_Name}` }));

  const handleChange = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));
  const swapSt = () => setForm(f => ({ ...f, from: f.to, to: f.from }));

  const handleSearch = async () => {
    if (!form.from || !form.to || !form.date) { addToast('Please fill From, To, and Date.', 'warning'); return; }
    if (form.from === form.to)                { addToast('From and To cannot be the same.', 'warning'); return; }
    if (form.date < todayStr)                 { addToast('Cannot search for past dates.', 'warning'); return; }
    setLoading(true); setResults(null); setStep(null); setSelectedTrain(null);
    setConnecting(null); setViaTrains(null); setSearchTab('direct');
    try {
      // ── 1. Direct trains — strict origin→destination match ──────────────────
      const [directRes, connRes, viaFromRes, viaToRes] = await Promise.allSettled([
        trainsApi.getAll({ source: form.from, destination: form.to, journey_date: form.date }),
        connectingTrainsApi.search(form.from, form.to, form.date),
        trainsApi.searchByStation(form.from, form.date),
        trainsApi.searchByStation(form.to, form.date),
      ]);

      // Direct trains — only trains whose From_Station == source AND To_Station == destination
      // Backend already filters strictly; also apply date filter client-side
      let directAll = [];
      if (directRes.status === 'fulfilled') {
        directAll = extractRecords(directRes.value);
      }

      // Strict date filter: exclude trains with no date OR date mismatch
      // (fixes "no departure date → always show" bug for mid-station trains)
      const directFiltered = directAll.filter(t => {
        const depDate = parseTrainDate(t.Departure_Time);
        if (!depDate) return false; // no date = exclude from direct results
        return depDate === form.date;
      });

      setResults(directFiltered);

      // Via station trains — trains that PASS THROUGH from or to station
      // Merge both sets, deduplicate by train ID, exclude trains already in direct results
      const directIds = new Set(directFiltered.map(t => String(t.ID || '')));
      const viaFromList = viaFromRes.status === 'fulfilled'
        ? (viaFromRes.value?.data?.trains || []) : [];
      const viaToList   = viaToRes.status === 'fulfilled'
        ? (viaToRes.value?.data?.trains   || []) : [];

      // Build map: train ID → { train, via_from_stop, via_to_stop }
      const viaMap = {};
      viaFromList.forEach(t => {
        const id = String(t.ID || '');
        if (!directIds.has(id)) {
          viaMap[id] = { ...t, via_from: t.stop_info, via_to: null };
        }
      });
      viaToList.forEach(t => {
        const id = String(t.ID || '');
        if (!directIds.has(id)) {
          if (viaMap[id]) {
            viaMap[id].via_to = t.stop_info;
          } else {
            viaMap[id] = { ...t, via_from: null, via_to: t.stop_info };
          }
        }
      });
      // Only keep trains that pass through BOTH stations (the actual route)
      const viaFinal = Object.values(viaMap).filter(t => t.via_from && t.via_to);
      setViaTrains(viaFinal);

      // Connecting trains
      if (connRes.status === 'fulfilled') {
        const connData = connRes.value?.data?.connecting || connRes.value?.connecting || [];
        setConnecting(connData);
        if (directFiltered.length === 0 && connData.length > 0) {
          setSearchTab('connecting');
          addToast(`No direct trains. Found ${connData.length} connecting option(s).`, 'info');
        } else if (directFiltered.length === 0 && viaFinal.length > 0) {
          setSearchTab('via');
          addToast(`No direct trains. Found ${viaFinal.length} train(s) passing through your stations.`, 'info');
        } else if (directFiltered.length === 0) {
          addToast('No trains found for this route and date.', 'info');
        }
      } else if (directFiltered.length === 0) {
        addToast('No direct trains found for this route and date.', 'info');
      }
    } catch (err) {
      addToast(err.message || 'Search failed.', 'error');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBookClick = train => {
    setSelectedTrain(train);
    if (!user) { setShowLogin(true); return; }
    setStep(0);
  };

  const handleLoginSuccess = u => {
    setUser(u);
    setShowLogin(false);
    if (selectedTrain) setStep(0);
  };

  const handlePay = async (paymentInfo) => {
    setPaying(true);
    try {
      await new Promise(r => setTimeout(r, 1800));
      const pnr     = 'PNR' + Math.random().toString(36).slice(2, 10).toUpperCase();
      const trainId = getRecordId(selectedTrain);
      const now = new Date();
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const bookingTime = `${String(now.getDate()).padStart(2,'0')}-${MONTHS[now.getMonth()]}-${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

      const payload = {
        Class:           bookingData.seatClass,
        Journey_Date:    bookingData.journeyDate,
        PNR:             pnr,
        Passenger_Count: bookingData.passengerCount,
        Passengers:      bookingData.passengers,
        Quota:           bookingData.quota,
        Booking_Status:  'confirmed',
        Payment_Status:  'paid',
        Total_Fare:      bookingData.fare.total,
        Booking_Time:    bookingTime,
        Trains:          trainId,
        Users:           user?.ID,
      };

      const res = await bookingsApi.create(payload);
      if (!res || res?.success === false) {
        throw new Error(res?.error || res?.message || 'Booking save failed. Check Zoho API.');
      }

      const serverPnr = res?.data?.PNR || res?.data?.data?.PNR || pnr;
      const bRec = { ...(res?.data?.data || res?.data || {}), PNR: serverPnr };
      setBookingData(bd => ({ ...bd, _pnr: serverPnr }));
      setBooking(bRec);
      setStep(2);
      addToast(`Booking confirmed! PNR: ${serverPnr}`, 'success');
    } catch (err) {
      addToast(err.message || 'Booking failed.', 'error');
    } finally {
      setPaying(false);
    }
  };

  const resetAll = () => {
    setStep(null); setSelectedTrain(null);
    setBookingData(null); setBooking(null); setShowLogin(false);
    setConnecting(null); setViaTrains(null); setSearchTab('direct');
  };

  const lS = { ...labelBase };
  const iS = {
    width: '100%', padding: '10px 14px',
    background: '#0a0d14', border: '1px solid #1e2433', borderRadius: 8,
    color: '#d1d5db', fontSize: 13, fontFamily: FONT,
    outline: 'none', transition: 'border-color 0.15s',
    boxSizing: 'border-box', appearance: 'none',
  };

  // ── Booking flow view ──
  if (step !== null && selectedTrain) {
    return (
      <div>
        <PageHeader icon="train" iconAccent="var(--accent-blue)" title="Book Ticket"
          subtitle={`${selectedTrain.Train_Name || 'Train'} — ${form.from} → ${form.to}`} />
        <Card>
          <StepBar step={step} />
          {step === 0 && (
            <PassengerForm train={selectedTrain} searchForm={form} user={user}
              onBack={resetAll}
              onProceed={data => { setBookingData(data); setStep(1); }} />
          )}
          {step === 1 && bookingData && (
            <PaymentStep train={selectedTrain} bookingData={bookingData}
              onBack={() => setStep(0)} onPay={handlePay} paying={paying} />
          )}
          {step === 2 && booking && (
            <PNRConfirmation booking={booking} train={selectedTrain}
              bookingData={bookingData} onDone={resetAll} />
          )}
        </Card>
      </div>
    );
  }

  // ── Search view ──
  return (
    <div>
      {/* Header with Sign In button top-right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: '0 0 3px', fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', fontFamily: FONT }}>Train Search</h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6b7280', fontFamily: FONT }}>Find and book trains between stations</p>
        </div>
        {/* Sign In button — top right, always visible */}
        {/* {!user ? (
          <button
            onClick={() => setShowLogin(true)}
            style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #2563eb', background: 'rgba(37,99,235,0.08)', color: '#60a5fa', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: FONT, display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <Icon name="users" size={14} />
            Sign In
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', background: '#0f2a1e', border: '1px solid #14532d', borderRadius: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#14532d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="users" size={13} style={{ color: '#22c55e' }} />
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#22c55e', fontFamily: FONT }}>{user.Full_Name || user.Email || 'User'}</div>
              <button onClick={() => { sessionStorage.removeItem('rail_user'); setUser(null); }}
                style={{ fontSize: 10, color: '#4b5563', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: FONT }}>
                Sign out
              </button>
            </div>
          </div>
        )} */}
      </div>

      {/* Search form */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 180px' }}>
            <label style={lS}>From Station *</label>
            <select name="from" value={form.from} onChange={handleChange} style={{ ...iS, cursor: 'pointer' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#1e2433'}>
              <option value="">Select departure</option>
              {stOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <button onClick={swapSt} title="Swap stations"
            style={{ width: 38, height: 38, borderRadius: 8, background: '#080b11', border: '1px solid #1e2433', color: '#6b7280', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'} onMouseLeave={e => e.currentTarget.style.color = '#6b7280'}>
            <Icon name="arrowSwap" size={16} />
          </button>

          <div style={{ flex: '1 1 180px' }}>
            <label style={lS}>To Station *</label>
            <select name="to" value={form.to} onChange={handleChange} style={{ ...iS, cursor: 'pointer' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#1e2433'}>
              <option value="">Select destination</option>
              {stOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ flex: '1 1 160px' }}>
            <label style={lS}>Journey Date *</label>
            <input name="date" value={form.date} onChange={handleChange} type="date" min={todayStr}
              style={{ ...iS, cursor: 'pointer' }}
              onFocus={e => e.target.style.borderColor = '#2563eb'} onBlur={e => e.target.style.borderColor = '#1e2433'} />
          </div>

          <div style={{ flex: '1 1 130px' }}>
            <label style={lS}>Class</label>
            <select name="seat_class" value={form.seat_class} onChange={handleChange} style={{ ...iS, cursor: 'pointer' }}>
              {IRCTC_CLASSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <button onClick={handleSearch} disabled={loading}
            style={{ padding: '10px 22px', borderRadius: 8, border: 'none', background: loading ? '#1e2433' : '#dc2626', color: loading ? '#6b7280' : '#fff', fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', alignSelf: 'flex-end', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
            <Icon name="search" size={15} />
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </Card>

      {/* Login modal (overlay) */}
      {showLogin && (
        <LoginModal
          onLogin={handleLoginSuccess}
          onCancel={() => { setShowLogin(false); setSelectedTrain(null); }}
        />
      )}

      {/* Loading spinner */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 52 }}>
          <Spinner size={32} color="#2563eb" />
        </div>
      )}

      {/* Results */}
      {!loading && results !== null && (
        <>
          {/* Tab bar */}
          <div style={{ display:'flex', gap:8, marginBottom:16, borderBottom:'1px solid #1e2433', paddingBottom:0 }}>
            {[
              { id:'direct',     label:`Direct Trains (${(results||[]).length})`,         icon:'🚆' },
              { id:'connecting', label:`Connecting (${(connecting||[]).length})`,          icon:'🔗' },
              { id:'via',        label:`Via Station (${(viaTrains||[]).length})`,          icon:'📍' },
            ].map(tab => {
              const active = searchTab === tab.id;
              return (
                <button key={tab.id} onClick={() => setSearchTab(tab.id)}
                  style={{
                    padding:'9px 16px', border:'none', background:'transparent', cursor:'pointer',
                    fontFamily:FONT, fontSize:13, fontWeight:600,
                    color: active ? '#60a5fa' : '#6b7280',
                    borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
                    transition:'all 0.15s', marginBottom:-1,
                  }}>
                  {tab.icon} {tab.label}
                </button>
              );
            })}
          </div>

          {/* Direct tab */}
          {searchTab === 'direct' && (
            <>
              <div style={{ marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <div style={{ fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:FONT }}>
                  {results.length} Direct Train{results.length !== 1 ? 's' : ''} Found
                </div>
                <span style={{ fontSize:12, color:'#6b7280', fontFamily:FONT }}>{form.from} → {form.to} · {form.date}</span>
              </div>
              {results.length === 0 ? (
                <Card>
                  <div style={{ textAlign:'center', padding:'36px 24px' }}>
                    <div style={{ fontSize:32, marginBottom:10 }}>🚆</div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#6b7280', fontFamily:FONT }}>No direct trains on this date</div>
                    <div style={{ fontSize:12, color:'#4b5563', marginTop:4, fontFamily:FONT }}>
                      {(connecting||[]).length > 0
                        ? <>Try the <span style={{ color:'#60a5fa', cursor:'pointer', textDecoration:'underline' }} onClick={() => setSearchTab('connecting')}>Connecting Trains tab</span> — {connecting.length} option(s) found.</>
                        : 'Try a different date or route.'}
                    </div>
                  </div>
                </Card>
              ) : (
                results.map((t, i) => (
                  <TrainCard key={getRecordId(t) || i} train={t} selectedClass={form.seat_class} onBook={handleBookClick} />
                ))
              )}
            </>
          )}

          {/* Connecting tab */}
          {searchTab === 'connecting' && (
            (connecting||[]).length === 0 ? (
              <Card>
                <div style={{ textAlign:'center', padding:'36px 24px' }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🔗</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#6b7280', fontFamily:FONT }}>No connecting trains found</div>
                  <div style={{ fontSize:12, color:'#4b5563', marginTop:4, fontFamily:FONT }}>
                    Add intermediate stops to trains via Train Routes to enable connecting train search.
                  </div>
                </div>
              </Card>
            ) : (
              <div>
                <div style={{ marginBottom:14, fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:FONT }}>
                  {connecting.length} Connecting Option{connecting.length !== 1 ? 's' : ''}
                </div>
                {connecting.map((conn, i) => {
                  const leg1 = conn.leg1 || conn.train1 || {};
                  const leg2 = conn.leg2 || conn.train2 || {};
                  const via  = conn.via_station || conn.connecting_station || '—';
                  const mins = conn.transfer_mins || conn.transfer_minutes || '—';
                  return (
                    <div key={i} style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:10, marginBottom:12, overflow:'hidden' }}>
                      <div style={{ padding:'8px 16px', background:'rgba(139,92,246,0.1)', borderBottom:'1px solid #2d1f52', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'#a78bfa', fontFamily:FONT }}>
                          🔗 Via {via}
                        </span>
                        {mins !== '—' && (
                          <span style={{ fontSize:11, color:'#6b7280', fontFamily:FONT }}>
                            Transfer: ~{mins} min
                          </span>
                        )}
                      </div>
                      <div style={{ padding:'14px 16px', display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center' }}>
                        <div style={{ background:'#080b11', borderRadius:8, padding:12, border:'1px solid #1e2433' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#3b82f6', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>Leg 1</div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:FONT }}>{leg1.Train_Name || leg1.name || '—'}</div>
                          <div style={{ fontSize:11, fontFamily:'monospace', color:'#6b7280', marginTop:2 }}>
                            {leg1.Train_Number || leg1.number || '—'} · {extractTime(leg1.Departure_Time)} → {extractTime(leg1.Arrival_Time)}
                          </div>
                        </div>
                        <div style={{ textAlign:'center', color:'#6b7280', fontSize:20 }}>→</div>
                        <div style={{ background:'#080b11', borderRadius:8, padding:12, border:'1px solid #1e2433' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#22c55e', textTransform:'uppercase', marginBottom:6, fontFamily:FONT }}>Leg 2</div>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text-primary)', fontFamily:FONT }}>{leg2.Train_Name || leg2.name || '—'}</div>
                          <div style={{ fontSize:11, fontFamily:'monospace', color:'#6b7280', marginTop:2 }}>
                            {leg2.Train_Number || leg2.number || '—'} · {extractTime(leg2.Departure_Time)} → {extractTime(leg2.Arrival_Time)}
                          </div>
                        </div>
                      </div>
                      <div style={{ padding:'8px 16px', borderTop:'1px solid #1e2433', display:'flex', justifyContent:'flex-end', gap:8 }}>
                        <button onClick={() => handleBookClick(leg1)}
                          style={{ padding:'7px 14px', borderRadius:7, border:'none', background:'#2563eb', color:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
                          Book Leg 1
                        </button>
                        <button onClick={() => handleBookClick(leg2)}
                          style={{ padding:'7px 14px', borderRadius:7, border:'none', background:'rgba(37,99,235,0.3)', color:'#93c5fd', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
                          Book Leg 2
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ── Via Station Tab ── */}
          {searchTab === 'via' && (
            (viaTrains||[]).length === 0 ? (
              <Card>
                <div style={{ textAlign:'center', padding:'36px 24px' }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>📍</div>
                  <div style={{ fontSize:14, fontWeight:600, color:'#6b7280', fontFamily:FONT }}>No trains passing through both stations</div>
                  <div style={{ fontSize:12, color:'#4b5563', marginTop:4, fontFamily:FONT }}>
                    Add sub-stations to trains via Admin → Train Routes to see trains passing through intermediate stops.
                  </div>
                </div>
              </Card>
            ) : (
              <div>
                <div style={{ marginBottom:14, fontSize:14, fontWeight:600, color:'var(--text-primary)', fontFamily:FONT }}>
                  {viaTrains.length} train{viaTrains.length !== 1 ? 's' : ''} pass through <span style={{ color:'#f59e0b' }}>{form.from}</span> and <span style={{ color:'#f59e0b' }}>{form.to}</span>
                </div>
                {viaTrains.map((train, i) => {
                  const fromStop = train.via_from || {};
                  const toStop   = train.via_to   || {};
                  return (
                    <div key={train.ID || i}
                      style={{ background:'var(--bg-elevated)', border:'1px solid var(--border)',
                               borderRadius:10, marginBottom:12, overflow:'hidden' }}>
                      {/* Header */}
                      <div style={{ padding:'8px 16px', background:'rgba(245,158,11,0.08)',
                                    borderBottom:'1px solid rgba(245,158,11,0.15)',
                                    display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:12, fontWeight:700, color:'#f59e0b', fontFamily:FONT }}>
                          📍 Passes through your stations
                        </span>
                        <span style={{ fontSize:11, fontFamily:'monospace', color:'#6b7280' }}>
                          {train.Train_Number}
                        </span>
                      </div>

                      <div style={{ padding:'14px 16px' }}>
                        <div style={{ fontSize:15, fontWeight:700, color:'var(--text-primary)', fontFamily:FONT, marginBottom:10 }}>
                          {train.Train_Name}
                          <span style={{ marginLeft:10, fontSize:11, fontWeight:500, color:'#6b7280' }}>
                            {train.Train_Type}
                          </span>
                        </div>

                        {/* Stop info for from → to */}
                        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, alignItems:'center' }}>
                          {/* FROM stop */}
                          <div style={{ background:'#080b11', borderRadius:8, padding:12, border:'1px solid #1e2433' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'#3b82f6', textTransform:'uppercase', marginBottom:5, fontFamily:FONT }}>
                              Passes {form.from}
                            </div>
                            <div style={{ fontSize:16, fontWeight:700, fontFamily:'monospace', color:'#f3f4f6' }}>
                              {fromStop.departure_time || fromStop.arrival_time || '—'}
                            </div>
                            <div style={{ fontSize:10, color:'#6b7280', marginTop:3, fontFamily:FONT }}>
                              Seq {fromStop.sequence || '—'}
                              {fromStop.distance_km ? ` · ${fromStop.distance_km}km` : ''}
                            </div>
                          </div>

                          <div style={{ textAlign:'center', color:'#f59e0b', fontSize:22 }}>→</div>

                          {/* TO stop */}
                          <div style={{ background:'#080b11', borderRadius:8, padding:12, border:'1px solid #1e2433' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'#22c55e', textTransform:'uppercase', marginBottom:5, fontFamily:FONT }}>
                              Arrives {form.to}
                            </div>
                            <div style={{ fontSize:16, fontWeight:700, fontFamily:'monospace', color:'#f3f4f6' }}>
                              {toStop.arrival_time || toStop.departure_time || '—'}
                            </div>
                            <div style={{ fontSize:10, color:'#6b7280', marginTop:3, fontFamily:FONT }}>
                              Seq {toStop.sequence || '—'}
                              {toStop.distance_km ? ` · ${toStop.distance_km}km` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Full route hint */}
                        <div style={{ marginTop:10, fontSize:11, color:'#4b5563', fontFamily:FONT }}>
                          Full route: {train.From_Station?.display_value || ''} → {train.To_Station?.display_value || ''}
                        </div>
                      </div>

                      <div style={{ padding:'8px 16px', borderTop:'1px solid #1e2433', display:'flex', justifyContent:'flex-end' }}>
                        <button onClick={() => handleBookClick(train)}
                          style={{ padding:'7px 18px', borderRadius:7, border:'none',
                                   background:'#2563eb', color:'#fff',
                                   fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:FONT }}>
                          Book This Train
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </>
      )}

      {/* Empty state */}
      {!loading && results === null && (
        <Card>
          <div style={{ textAlign: 'center', padding: '48px 24px', color: '#6b7280', fontFamily: FONT }}>
            <div style={{ width: 56, height: 56, borderRadius: 14, background: '#080b11', border: '1px solid #1e2433', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', color: '#374151' }}>
              <Icon name="search" size={24} />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 5px', color: '#9ca3af', fontFamily: FONT }}>Search for Trains</p>
            <p style={{ fontSize: 13, margin: 0, fontFamily: FONT }}>Select origin, destination and date to find available trains.</p>
            {!user && (
              <div style={{ marginTop: 14, padding: '9px 16px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.18)', borderRadius: 8, display: 'inline-block' }}>
                <span style={{ fontSize: 12, color: '#60a5fa', fontFamily: FONT }}>
                  Sign in to book tickets —{' '}
                  <span onClick={() => setShowLogin(true)} style={{ fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>click here</span>
                </span>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}