/**
 * SignInModal.jsx — standalone export (used by external callers if needed)
 * NOTE: With the new role-based flow, login is always done via LoginPage (full screen).
 * This modal is kept for backward-compatibility but is no longer used by Layout.
 */

import { useState } from 'react';
import { authApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Icon, Spinner } from './UI';

const FONT = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";
const iBase = {
  boxSizing: 'border-box', width: '100%', padding: '10px 14px',
  borderRadius: 10, background: '#090c12', border: '1.5px solid #1a1f2e',
  color: '#e2e8f0', fontSize: 14, fontFamily: FONT,
  outline: 'none', transition: 'border-color 0.2s',
};
const lbl = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#4a5568',
  textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6,
};

export default function SignInModal({ onClose, onLogin }) {
  const { addToast } = useToast();
  const [tab, setTab]       = useState('login');
  const [form, setForm]     = useState({ Full_Name: '', Email: '', Password: '' });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleChange = e => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  const validate = () => {
    const e = {};
    if (tab === 'register' && !form.Full_Name.trim()) e.Full_Name = 'Required';
    if (!form.Email.trim() || !/\S+@\S+\.\S+/.test(form.Email)) e.Email = 'Valid email required';
    if (!form.Password || form.Password.length < 6) e.Password = 'Min 6 characters';
    return e;
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setLoading(true);
    try {
      if (tab === 'login') {
        const res = await authApi.login({ Email: form.Email, Password: form.Password });
        if (res?.success === false) throw new Error(res.error || 'Login failed');
        const userData = res?.user ?? res?.data?.data ?? res?.data ?? res;
        sessionStorage.setItem('rail_user', JSON.stringify(userData));
        addToast(`Welcome back, ${userData.Full_Name || 'User'}!`, 'success');
        onLogin?.(userData);
        onClose?.();
      } else {
        const res = await authApi.register({
          Full_Name: form.Full_Name, Email: form.Email, Password: form.Password,
        });
        if (res?.success === false) throw new Error(res.error || 'Registration failed');
        addToast('Account created! Please sign in.', 'success');
        setTab('login');
        setForm(f => ({ ...f, Full_Name: '', Password: '' }));
        setErrors({});
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0d1117', border: '1px solid #1a1f2e', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400, boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#e2e8f0', fontFamily: 'var(--font-display)' }}>
              {tab === 'login' ? 'Sign In' : 'Create Account'}
            </div>
            <div style={{ fontSize: 12, color: '#4a5568', marginTop: 3 }}>Railway Ticketing System</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #1a1f2e', background: 'transparent', color: '#4a5568', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={13} />
          </button>
        </div>

        <div style={{ display: 'flex', background: '#090c12', border: '1px solid #1a1f2e', borderRadius: 10, padding: 3, marginBottom: 22, gap: 3 }}>
          {['login', 'register'].map(t => (
            <button key={t} type="button" onClick={() => { setTab(t); setErrors({}); }}
              style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: FONT, fontSize: 13, fontWeight: 600, transition: 'all 0.15s', background: tab === t ? 'linear-gradient(135deg,#3b82f6,#8b5cf6)' : 'transparent', color: tab === t ? '#fff' : '#4a5568' }}>
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
          {tab === 'register' && (
            <div>
              <label style={lbl}>Full Name</label>
              <input name="Full_Name" value={form.Full_Name} onChange={handleChange} placeholder="Your full name"
                style={{ ...iBase, borderColor: errors.Full_Name ? '#ef4444' : '#1a1f2e' }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                onBlur={e => { e.target.style.borderColor = errors.Full_Name ? '#ef4444' : '#1a1f2e'; }} />
              {errors.Full_Name && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#f87171' }}>{errors.Full_Name}</p>}
            </div>
          )}
          <div>
            <label style={lbl}>Email</label>
            <input name="Email" value={form.Email} onChange={handleChange} type="email" placeholder="you@example.com"
              style={{ ...iBase, borderColor: errors.Email ? '#ef4444' : '#1a1f2e' }}
              onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
              onBlur={e => { e.target.style.borderColor = errors.Email ? '#ef4444' : '#1a1f2e'; }} />
            {errors.Email && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#f87171' }}>{errors.Email}</p>}
          </div>
          <div>
            <label style={lbl}>Password</label>
            <div style={{ position: 'relative' }}>
              <input name="Password" value={form.Password} onChange={handleChange}
                type={showPass ? 'text' : 'password'} placeholder="Min 6 characters"
                style={{ ...iBase, paddingRight: 42, borderColor: errors.Password ? '#ef4444' : '#1a1f2e' }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; }}
                onBlur={e => { e.target.style.borderColor = errors.Password ? '#ef4444' : '#1a1f2e'; }}
                onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }} />
              <button type="button" onClick={() => setShowPass(s => !s)}
                style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Icon name={showPass ? 'x' : 'info'} size={14} />
              </button>
            </div>
            {errors.Password && <p style={{ margin: '4px 0 0', fontSize: 12, color: '#f87171' }}>{errors.Password}</p>}
          </div>
        </div>

        <button type="button" onClick={handleSubmit} disabled={loading}
          style={{ width: '100%', marginTop: 20, padding: '12px', borderRadius: 12, border: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: loading ? '#1a1f2e' : 'linear-gradient(135deg,#3b82f6,#8b5cf6)', color: loading ? '#4a5568' : '#fff', boxShadow: loading ? 'none' : '0 8px 24px rgba(59,130,246,0.3)' }}>
          {loading
            ? <><Spinner size={15} color="#4b5563" />{tab === 'login' ? 'Signing in…' : 'Creating account…'}</>
            : tab === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <p style={{ marginTop: 14, textAlign: 'center', fontSize: 12, color: '#4a5568' }}>
          {tab === 'login'
            ? <>No account?{' '}<span onClick={() => { setTab('register'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Register here</span></>
            : <>Have an account?{' '}<span onClick={() => { setTab('login'); setErrors({}); }} style={{ color: '#60a5fa', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>}
        </p>
      </div>
    </div>
  );
}
