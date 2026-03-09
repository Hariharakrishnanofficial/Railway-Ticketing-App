import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { authApi } from '../services/api';
import { Icon, Spinner } from '../components/UI';

const INPUT_STYLE = {
  boxSizing: 'border-box',
  width: '100%',
  padding: '11px 14px 11px 40px',
  background: '#090c12',
  border: '1.5px solid #1a1f2e',
  borderRadius: 12,
  color: '#e8eaf0',
  fontSize: 14,
  fontFamily: 'var(--font-body)',
  outline: 'none',
  transition: 'border-color 0.2s',
};

function AuthInput({ label, name, value, onChange, type = 'text', icon, error, placeholder }) {
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ width: '100%' }}>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 700,
        color: '#4a5568', textTransform: 'uppercase',
        letterSpacing: '0.07em', marginBottom: 6,
      }}>
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 12, top: '50%',
          transform: 'translateY(-50%)',
          color: focused ? 'var(--accent-blue)' : '#4a5568',
          pointerEvents: 'none', transition: 'color 0.2s',
        }}>
          <Icon name={icon} size={15} />
        </div>
        <input
          name={name}
          value={value}
          onChange={onChange}
          type={type}
          placeholder={placeholder}
          style={{
            ...INPUT_STYLE,
            borderColor: error ? '#ef4444' : focused ? 'var(--accent-blue)' : '#1a1f2e',
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>
      {error && (
        <p style={{ margin: '5px 0 0', fontSize: 12, color: '#f87171' }}>{error}</p>
      )}
    </div>
  );
}

export default function LoginPage({ onLogin }) {
  const { addToast } = useToast();
  const [mode, setMode]     = useState('login');   // 'login' | 'register'
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors]   = useState({});

  const [form, setForm] = useState({
    Full_Name: '', Email: '', Password: '', Phone_Number: '', Address: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(er => ({ ...er, [name]: '' }));
  };

  function validate() {
    const e = {};
    if (mode === 'register' && !form.Full_Name.trim()) e.Full_Name = 'Name is required';
    if (!form.Email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email))
      e.Email = 'Valid email required';
    if (!form.Password || form.Password.length < 6)
      e.Password = 'Minimum 6 characters';
    return e;
  }

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const res = mode === 'login'
        ? await authApi.login({ Email: form.Email, Password: form.Password })
        : await authApi.register({
            Full_Name:    form.Full_Name,
            Email:        form.Email,
            Password:     form.Password,
            Phone_Number: form.Phone_Number,
            Address:      form.Address,
          });

      if (res?.success === false) {
        addToast(res.error || res.message || 'Failed', 'error');
      } else {
        addToast(mode === 'login' ? `Welcome back, ${res.user?.Full_Name || 'User'}!` : 'Account created! Please login.', 'success');
        if (mode === 'login') {
          // Store user in sessionStorage so Layout can read it
          sessionStorage.setItem('rail_user', JSON.stringify(res.user));
          onLogin?.(res.user);
        } else {
          // Switch to login after register
          setMode('login');
          setForm(f => ({ ...f, Full_Name: '', Password: '', Phone_Number: '', Address: '' }));
        }
      }
    } catch (err) {
      addToast(err.message || 'Something went wrong', 'error');
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleSubmit(); };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg-base)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'var(--font-body)',
    }}>
      {/* Background glow */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0,
      }}>
        <div style={{ position: 'absolute', top: '20%', left: '30%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)', filter: 'blur(40px)' }} />
        <div style={{ position: 'absolute', bottom: '20%', right: '25%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.05) 0%, transparent 70%)', filter: 'blur(40px)' }} />
      </div>

      <div style={{
        width: '100%', maxWidth: 420, position: 'relative', zIndex: 1,
        animation: 'slideInUp 0.3s ease',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 14px',
            boxShadow: '0 8px 32px rgba(59,130,246,0.35)',
          }}>
            <Icon name="train" size={26} style={{ color: '#fff' }} />
          </div>
          <h1 style={{
            margin: '0 0 4px', fontSize: 24, fontWeight: 800,
            color: 'var(--text-primary)', fontFamily: 'var(--font-display)',
          }}>
            RailAdmin
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Railway Ticketing System
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: '#0e1117', border: '1px solid #1a1f2e',
          borderRadius: 20, padding: 32,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}>
          {/* Tab switcher */}
          <div style={{
            display: 'flex', background: '#090c12',
            border: '1px solid #1a1f2e', borderRadius: 12,
            padding: 4, marginBottom: 28,
          }}>
            {['login', 'register'].map(tab => (
              <button
                key={tab}
                onClick={() => { setMode(tab); setErrors({}); }}
                style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none',
                  background: mode === tab
                    ? 'linear-gradient(135deg, #3b82f6, #8b5cf6)'
                    : 'transparent',
                  color: mode === tab ? '#fff' : '#4a5568',
                  fontSize: 13, fontWeight: 700,
                  fontFamily: 'var(--font-body)',
                  cursor: 'pointer', transition: 'all 0.2s',
                  textTransform: 'capitalize',
                  boxShadow: mode === tab ? '0 4px 14px rgba(59,130,246,0.3)' : 'none',
                }}
              >
                {tab === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          {/* Form fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} onKeyDown={handleKeyDown}>
            {mode === 'register' && (
              <AuthInput
                label="Full Name" name="Full_Name" value={form.Full_Name}
                onChange={handleChange} icon="users"
                placeholder="Rahul Sharma" error={errors.Full_Name}
              />
            )}

            <AuthInput
              label="Email Address" name="Email" value={form.Email}
              onChange={handleChange} icon="health" type="email"
              placeholder="you@example.com" error={errors.Email}
            />

            <div style={{ width: '100%' }}>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 700,
                color: '#4a5568', textTransform: 'uppercase',
                letterSpacing: '0.07em', marginBottom: 6,
              }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <div style={{
                  position: 'absolute', left: 12, top: '50%',
                  transform: 'translateY(-50%)',
                  color: '#4a5568', pointerEvents: 'none',
                }}>
                  <Icon name="check" size={15} />
                </div>
                <input
                  name="Password" value={form.Password}
                  onChange={handleChange}
                  type={showPass ? 'text' : 'password'}
                  placeholder="Min. 6 characters"
                  style={{
                    ...INPUT_STYLE,
                    paddingRight: 42,
                    borderColor: errors.Password ? '#ef4444' : '#1a1f2e',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'var(--accent-blue)'; }}
                  onBlur={e => { e.target.style.borderColor = errors.Password ? '#ef4444' : '#1a1f2e'; }}
                />
                <button
                  onClick={() => setShowPass(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none', border: 'none',
                    color: '#4a5568', cursor: 'pointer', padding: 2,
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <Icon name={showPass ? 'x' : 'info'} size={14} />
                </button>
              </div>
              {errors.Password && (
                <p style={{ margin: '5px 0 0', fontSize: 12, color: '#f87171' }}>{errors.Password}</p>
              )}
            </div>

            {mode === 'register' && (
              <>
                <AuthInput
                  label="Phone Number" name="Phone_Number" value={form.Phone_Number}
                  onChange={handleChange} icon="users" type="tel"
                  placeholder="9876543210" error={errors.Phone_Number}
                />
                <AuthInput
                  label="Address (optional)" name="Address" value={form.Address}
                  onChange={handleChange} icon="station"
                  placeholder="City, State" error={errors.Address}
                />
              </>
            )}
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: '100%', marginTop: 24,
              padding: '13px 0', borderRadius: 12, border: 'none',
              background: loading
                ? '#1a1f2e'
                : 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
              color: loading ? '#4a5568' : '#fff',
              fontSize: 15, fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: loading ? 'none' : '0 8px 28px rgba(59,130,246,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {loading
              ? <><Spinner size={18} color="#94a3b8" /> {mode === 'login' ? 'Signing in…' : 'Creating account…'}</>
              : mode === 'login' ? 'Sign In' : 'Create Account'
            }
          </button>

          {/* Footer hint */}
          <p style={{
            marginTop: 20, textAlign: 'center',
            fontSize: 12, color: '#4a5568',
          }}>
            {mode === 'login'
              ? <>No account?{' '}<span onClick={() => { setMode('register'); setErrors({}); }} style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>Register here</span></>
              : <>Already have an account?{' '}<span onClick={() => { setMode('login'); setErrors({}); }} style={{ color: 'var(--accent-blue)', cursor: 'pointer', fontWeight: 600 }}>Sign in</span></>
            }
          </p>
        </div>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#2d3748' }}>
          v1.0.0 · Flask / Zoho Creator
        </p>
      </div>
    </div>
  );
}