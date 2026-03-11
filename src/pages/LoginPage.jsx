/**
 * LoginPage.jsx
 *
 * Three modes:
 *  • login    — sign in (any user)
 *  • register — create passenger account (blocks admin@admin.com)
 *  • setup    — create/reset admin account (requires ADMIN_SETUP_KEY)
 *
 * The "Admin Setup" tab is hidden by default.
 * It appears only when clicking the small "First-time setup?" link at
 * the bottom of the Sign In card — invisible to normal passengers.
 *
 * After successful admin setup the user is dropped back to Sign In.
 */

import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/api';
import { Icon, Spinner } from '../components/UI';

const INPUT_STYLE = {
  boxSizing: 'border-box', width: '100%',
  padding: '11px 14px 11px 40px',
  background: '#090c12', border: '1.5px solid #1a1f2e',
  borderRadius: 12, color: '#e8eaf0', fontSize: 14,
  fontFamily: 'var(--font-body)', outline: 'none',
  transition: 'border-color 0.2s',
};

function AuthInput({ label, name, value, onChange, type = 'text', icon, error, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ width: '100%' }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: focused ? 'var(--accent-blue)' : '#4a5568', pointerEvents: 'none', transition: 'color 0.2s' }}>
          <Icon name={icon} size={15} />
        </div>
        <input
          name={name} value={value} onChange={onChange} type={type} placeholder={placeholder}
          style={{ ...INPUT_STYLE, borderColor: error ? '#ef4444' : focused ? 'var(--accent-blue)' : '#1a1f2e' }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {error && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>}
    </div>
  );
}

export default function LoginPage({ onLogin }) {
  const { addToast } = useToast();

  const [mode, setMode]         = useState('login');   // 'login' | 'register' | 'setup'
  const [loading, setLoading]   = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors]     = useState({});

  const [form, setForm] = useState({
    Full_Name: '', Email: '', Password: '',
    Phone_Number: '', Address: '',
    setup_key: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function resetForm() {
    setForm({ Full_Name: '', Email: '', Password: '', Phone_Number: '', Address: '', setup_key: '' });
    setErrors({});
    setShowPass(false);
  }

  function switchMode(m) { resetForm(); setMode(m); }

  function validate() {
    const e = {};
    if (mode === 'register') {
      if (!form.Full_Name.trim()) e.Full_Name = 'Name is required';
    }
    if (mode === 'setup') {
      if (!form.Full_Name.trim()) e.Full_Name = 'Admin name is required';
      if (!form.setup_key.trim()) e.setup_key = 'Setup key is required';
      const setupEmail = form.Email.trim().toLowerCase();
      if (!setupEmail) {
        e.Email = 'Email is required';
      } else if (!setupEmail.endsWith('@admin.com')) {
        e.Email = 'Only @admin.com emails are allowed (e.g. test@admin.com)';
      }
    }
    if (mode === 'login' || mode === 'register') {
      if (!form.Email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email))
        e.Email = 'Valid email required';
    }
    if (!form.Password || form.Password.length < 6)
      e.Password = 'Minimum 6 characters';
    return e;
  }

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      if (mode === 'login') {
        const res = await authApi.login({ Email: form.Email, Password: form.Password });
        if (!res || res.success === false) {
          // Show field-level error for wrong password/email
          const msg = res?.error || res?.message || 'Invalid email or password';
          setErrors({ Email: ' ', Password: msg });
          return;
        }

        const userData = res?.user ?? res?.data?.data ?? res?.data ?? res;
        if (!userData || typeof userData !== 'object' || Array.isArray(userData))
          throw new Error('Unexpected server response. Please try again.');

        sessionStorage.setItem('rail_user', JSON.stringify(userData));
        // Store Catalyst token — sent in Authorization header on all API calls
        if (res?.catalyst_token) setCatalystToken(res.catalyst_token);
        addToast(`Welcome back, ${userData.Full_Name || userData.Email || 'User'}!`, 'success');
        onLogin?.(userData);

      } else if (mode === 'register') {
        const res = await authApi.register({
          Full_Name:    form.Full_Name,
          Email:        form.Email,
          Password:     form.Password,
          Phone_Number: form.Phone_Number,
          Address:      form.Address,
          Role:         'User',
        });
        // res.success === false means server returned an error JSON (handled by interceptor)
        if (!res || res.success === false) {
          const msg = res?.error || res?.message || 'Registration failed. Please try again.';
          // Show inline error on the email field for duplicate/reserved email errors
          if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('registered') || msg.toLowerCase().includes('reserved') || msg.toLowerCase().includes('admin')) {
            setErrors({ Email: msg });
          } else {
            throw new Error(msg);
          }
          return;
        }
        addToast('Account created! Please sign in.', 'success');
        switchMode('login');

      } else if (mode === 'setup') {
        const res = await authApi.setupAdmin({
          setup_key:    form.setup_key,
          Email:        form.Email || 'admin@admin.com',
          Full_Name:    form.Full_Name,
          Password:     form.Password,
          Phone_Number: form.Phone_Number,
          Address:      form.Address,
        });
        if (res?.success === false) throw new Error(res.error || res.message || 'Setup failed');
        const action = res?.action === 'updated' ? 'reset' : 'created';
        addToast(`Admin account ${action}! You can now sign in.`, 'success');
        switchMode('login');
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isSetup      = mode === 'setup';
  const accentColor  = isSetup ? '#ef4444' : '#3b82f6';
  const gradientBg   = isSetup ? 'linear-gradient(135deg, #ef4444, #dc2626)' : 'linear-gradient(135deg, #3b82f6, #8b5cf6)';

  const TABS = isSetup
    ? [{ key: 'login', label: 'Sign In' }, { key: 'setup', label: '🔑 Admin Setup' }]
    : [{ key: 'login', label: 'Sign In' }, { key: 'register', label: 'Register' }];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--font-body)' }}>
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '20%', left: '30%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '25%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1, animation: 'slideInUp 0.3s ease' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: gradientBg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', boxShadow: `0 8px 32px ${accentColor}55` }}>
            <Icon name="train" size={26} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
            Railway System
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            {mode === 'login' ? 'Sign in to continue' : mode === 'register' ? 'Create a passenger account' : 'Create or reset the admin account'}
          </p>
        </div>

        {/* Card */}
        <div style={{ background: '#0e1117', border: `1px solid ${isSetup ? '#3f1717' : '#1a1f2e'}`, borderRadius: 20, padding: 32, boxShadow: '0 24px 80px rgba(0,0,0,0.5)' }}>

          {/* Tabs */}
          <div style={{ display: 'flex', background: '#090c12', border: '1px solid #1a1f2e', borderRadius: 12, padding: 4, marginBottom: 28 }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => switchMode(tab.key)}
                style={{ flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                  background: mode === tab.key ? gradientBg : 'transparent',
                  color: mode === tab.key ? '#fff' : '#4a5568',
                  fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-body)', cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: mode === tab.key ? `0 4px 14px ${accentColor}4d` : 'none' }}>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Setup warning banner */}
          {isSetup && (
            <div style={{ background: '#1a0a0a', border: '1px solid #3f1717', borderRadius: 10, padding: '10px 14px', marginBottom: 20, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              <p style={{ margin: 0, fontSize: 12, color: '#fca5a5', lineHeight: 1.5 }}>
                This creates or resets any <strong>@admin.com</strong> account (e.g. admin@admin.com, test@admin.com).
                You need the <strong>ADMIN_SETUP_KEY</strong> from your server environment.
              </p>
            </div>
          )}

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}>

            {(mode === 'register' || mode === 'setup') && (
              <AuthInput label={isSetup ? 'Admin Full Name' : 'Full Name'}
                name="Full_Name" value={form.Full_Name} onChange={handleChange}
                icon="users" placeholder="Full Name" error={errors.Full_Name} />
            )}

            {mode !== 'setup' && (
              <AuthInput label="Email Address" name="Email" value={form.Email}
                onChange={handleChange} icon="health" type="email"
                placeholder="you@example.com" error={errors.Email} />
            )}

            {mode === 'setup' && (
              <>
                <AuthInput label="Admin Email (@admin.com only)"
                  name="Email" value={form.Email} onChange={handleChange}
                  icon="health" type="email"
                  placeholder="e.g. test@admin.com or admin@admin.com" error={errors.Email} />
                <AuthInput label="Admin Setup Key (from server env)"
                  name="setup_key" value={form.setup_key} onChange={handleChange}
                  icon="check" type="password"
                  placeholder="Enter ADMIN_SETUP_KEY value" error={errors.setup_key} />
              </>
            )}

            {/* Password with show/hide */}
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>
                {isSetup ? 'New Admin Password' : 'Password'}
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4a5568', pointerEvents: 'none' }}>
                  <Icon name="check" size={15} />
                </div>
                <input name="Password" value={form.Password} onChange={handleChange}
                  type={showPass ? 'text' : 'password'} placeholder="Min. 6 characters"
                  style={{ ...INPUT_STYLE, paddingRight: 42, borderColor: errors.Password ? '#ef4444' : '#1a1f2e' }}
                  onFocus={e => { e.target.style.borderColor = accentColor; }}
                  onBlur={e => { e.target.style.borderColor = errors.Password ? '#ef4444' : '#1a1f2e'; }} />
                <button onClick={() => setShowPass(s => !s)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#4a5568', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
                  <Icon name={showPass ? 'x' : 'info'} size={14} />
                </button>
              </div>
              {errors.Password && <p style={{ margin: '5px 0 0', fontSize: 12, color: '#f87171' }}>{errors.Password}</p>}
            </div>

            {(mode === 'register' || mode === 'setup') && (
              <>
                <AuthInput label="Phone Number" name="Phone_Number" value={form.Phone_Number}
                  onChange={handleChange} icon="users" type="tel" placeholder="9876543210" />
                <AuthInput label="Address (optional)" name="Address" value={form.Address}
                  onChange={handleChange} icon="station" placeholder="City, State" />
              </>
            )}
          </div>

          {/* Submit */}
          <button onClick={handleSubmit} disabled={loading}
            style={{ width: '100%', marginTop: 24, padding: '13px 0', borderRadius: 12, border: 'none',
              background: loading ? '#1a1f2e' : gradientBg,
              color: loading ? '#4a5568' : '#fff',
              fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: loading ? 'none' : `0 8px 28px ${accentColor}55`,
              transition: 'all 0.2s' }}>
            {loading
              ? <><Spinner size={18} color="#94a3b8" />{mode === 'login' ? 'Signing in…' : mode === 'register' ? 'Creating account…' : 'Setting up admin…'}</>
              : mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : '🔑 Create Admin Account'
            }
          </button>

          {/* Footer text */}
          {!isSetup && (
            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 12, color: '#4a5568' }}>
              {mode === 'login'
                ? <>No account?{' '}<span onClick={() => switchMode('register')} style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>Register here</span></>
                : <>Already have an account?{' '}<span onClick={() => switchMode('login')} style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>
              }
            </p>
          )}

          {/* Admin hint — bottom of login card */}
          {mode === 'login' && (
            <p style={{ marginTop: 12, textAlign: 'center', fontSize: 11, color: '#2d3748', borderTop: '1px solid #1a1f2e', paddingTop: 12 }}>
              Admin:{' '}
              <span style={{ color: '#ef4444', fontWeight: 600 }}>admin@admin.com</span>
              {' · '}
              <span
                onClick={() => switchMode('setup')}
                style={{ color: '#3f3f46', cursor: 'pointer', fontSize: 10, textDecoration: 'underline dotted' }}
                title="Create admin account for the first time">
                First-time setup?
              </span>
            </p>
          )}

          {/* Back link in setup mode */}
          {isSetup && (
            <p style={{ marginTop: 16, textAlign: 'center', fontSize: 12, color: '#4a5568' }}>
              <span onClick={() => switchMode('login')} style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>
                ← Back to Sign In
              </span>
            </p>
          )}
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#2d3748' }}>v1.0.0 · Flask / Zoho Creator</p>
      </div>
    </div>
  );
}