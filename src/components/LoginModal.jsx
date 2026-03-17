import { useState } from 'react';
import { authApi } from '../services/api';
import { useToast } from '../context/ToastContext';

const FONT = "'Inter', sans-serif";

export default function LoginModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('login'); // 'login' or 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (mode === 'login') {
      if (!email || !password) {
        toast.error('Please enter email and password');
        return;
      }

      setLoading(true);
      try {
        const response = await authApi.login({ Email: email, Password: password });
        
        if (response?.access_token) {
          sessionStorage.setItem('rail_access_token', response.access_token);
          sessionStorage.setItem('rail_user', JSON.stringify(response.user || { Email: email }));
          
          if (response.refresh_token) {
            localStorage.setItem('rail_refresh_token', response.refresh_token);
          }

          toast.success('Logged in successfully');
          onSuccess?.();
          onClose();
        } else {
          toast.error('Login failed - no token received');
        }
      } catch (error) {
        const message = error.response?.data?.error || error.message || 'Login failed';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    } else {
      // Registration mode
      if (!fullName || !email || !password) {
        toast.error('Please fill all required fields');
        return;
      }

      setLoading(true);
      try {
        const response = await authApi.register({
          Full_Name: fullName,
          Email: email,
          Password: password,
          Phone_Number: phoneNumber,
          Address: address
        });
        
        if (response?.message === 'Registration successful') {
          toast.success('Registration successful! Please login.');
          setMode('login');
          setFullName('');
          setPhoneNumber('');
          setAddress('');
          setPassword('');
        } else {
          toast.error(response?.message || 'Registration failed');
        }
      } catch (error) {
        const message = error.response?.data?.error || error.message || 'Registration failed';
        toast.error(message);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }}>
      <div style={{ maxWidth: 420, width: '90%', maxHeight: '90vh', overflow: 'auto', background: 'white', borderRadius: 12, padding: 32, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1f2937', fontFamily: FONT }}>
            {mode === 'login' ? 'Sign In to Book Tickets' : 'Create Account'}
          </h2>
          <button 
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 24, padding: 0 }}
            aria-label="Close">
            ×
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#374151' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: '#374151' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your password"
                disabled={loading}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 16px', marginTop: 8, background: '#06b6d4', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1, fontFamily: FONT
              }}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>

            <div style={{ marginTop: 12, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
              Don't have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('register')}
                style={{ background: 'none', border: 'none', color: '#06b6d4', cursor: 'pointer', textDecoration: 'underline' }}>
                Register here
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Password *
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 6 characters"
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Phone Number
              </label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="10-digit phone number"
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 6, color: '#374151' }}>
                Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Your address"
                disabled={loading}
                style={{
                  width: '100%', padding: '9px 12px', fontSize: 13, border: '1px solid #d1d5db',
                  borderRadius: 6, fontFamily: FONT, boxSizing: 'border-box', background: '#f9fafb'
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '10px 16px', marginTop: 12, background: '#06b6d4', color: 'white',
                border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1, fontFamily: FONT
              }}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </button>

            <div style={{ marginTop: 10, textAlign: 'center', fontSize: 14, color: '#6b7280' }}>
              Already have an account?{' '}
              <button
                type="button"
                onClick={() => setMode('login')}
                style={{ background: 'none', border: 'none', color: '#06b6d4', cursor: 'pointer', textDecoration: 'underline' }}>
                Sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
