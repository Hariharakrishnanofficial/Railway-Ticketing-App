/**
 * ChangePasswordPage.jsx — Change password + forgot password flow
 */
import { useState } from 'react';
import { authApi, getCurrentUser } from '../services/api';
import { Card, PageHeader, Button, Spinner } from '../components/UI';
import { Field } from '../components/FormFields';
import { useToast } from '../context/ToastContext';

export default function ChangePasswordPage() {
  const [tab, setTab] = useState('change'); // 'change' or 'forgot'
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const user = getCurrentUser();

  // Change password state
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  // Forgot password state
  const [fpEmail, setFpEmail] = useState('');
  const [fpOtp, setFpOtp] = useState('');
  const [fpNewPwd, setFpNewPwd] = useState('');
  const [fpStep, setFpStep] = useState(1); // 1=email, 2=otp+new password
  const [fpOtpSent, setFpOtpSent] = useState('');

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error('Passwords do not match'); return; }
    if (newPwd.length < 6) { toast.error('Password must be at least 6 characters'); return; }

    setLoading(true);
    try {
      const res = await authApi.changePassword({ user_id: user?.ID, old_password: oldPwd, new_password: newPwd });
      if (res?.success) {
        toast.success('Password changed successfully');
        setOldPwd(''); setNewPwd(''); setConfirmPwd('');
      } else {
        toast.error(res?.error || 'Failed to change password');
      }
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleForgotSendOTP = async (e) => {
    e.preventDefault();
    if (!fpEmail) { toast.error('Email is required'); return; }
    setLoading(true);
    try {
      const res = await authApi.forgotPassword({ Email: fpEmail });
      if (res?.success) {
        toast.success('OTP sent! (Demo: check the response)');
        setFpOtpSent(res.otp || '');
        setFpStep(2);
      } else {
        toast.error(res?.error || 'Failed to send OTP');
      }
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (fpNewPwd.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const res = await authApi.resetPassword({ email: fpEmail, otp: fpOtp, new_password: fpNewPwd });
      if (res?.success) {
        toast.success('Password reset successfully! Please login again.');
        setFpStep(1); setFpEmail(''); setFpOtp(''); setFpNewPwd(''); setFpOtpSent('');
      } else {
        toast.error(res?.error || 'Failed to reset password');
      }
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  const tabStyle = (t) => ({
    padding: '0.75rem 1.5rem', cursor: 'pointer',
    borderBottom: tab === t ? '3px solid var(--primary, #6366f1)' : '3px solid transparent',
    fontWeight: tab === t ? 700 : 400,
    color: tab === t ? 'var(--primary, #6366f1)' : 'inherit',
    background: 'none', border: 'none', fontSize: '1rem',
  });

  return (
    <div>
      <PageHeader title="Password Management" subtitle="Change or reset your password" />

      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }}>
        <button style={tabStyle('change')} onClick={() => setTab('change')}>Change Password</button>
        <button style={tabStyle('forgot')} onClick={() => setTab('forgot')}>Forgot Password</button>
      </div>

      {tab === 'change' && (
        <Card style={{ maxWidth: '500px' }}>
          <form onSubmit={handleChangePassword}>
            <Field label="Current Password" type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required />
            <Field label="New Password" type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required />
            <Field label="Confirm New Password" type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required />
            <div style={{ marginTop: '1rem' }}>
              <Button type="submit" disabled={loading}>{loading ? 'Processing...' : 'Change Password'}</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'forgot' && (
        <Card style={{ maxWidth: '500px' }}>
          {fpStep === 1 && (
            <form onSubmit={handleForgotSendOTP}>
              <p style={{ opacity: 0.7, marginBottom: '1rem' }}>Enter your registered email to receive an OTP.</p>
              <Field label="Email" type="email" value={fpEmail} onChange={e => setFpEmail(e.target.value)} required />
              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" disabled={loading}>{loading ? 'Sending...' : 'Send OTP'}</Button>
              </div>
            </form>
          )}

          {fpStep === 2 && (
            <form onSubmit={handleResetPassword}>
              <p style={{ opacity: 0.7, marginBottom: '0.5rem' }}>OTP sent to {fpEmail}</p>
              {fpOtpSent && (
                <p style={{ padding: '0.5rem 1rem', background: 'rgba(34,197,94,0.15)', borderRadius: '8px', margin: '0 0 1rem', fontSize: '0.85rem' }}>
                  <strong>Demo OTP:</strong> {fpOtpSent}
                </p>
              )}
              <Field label="OTP" value={fpOtp} onChange={e => setFpOtp(e.target.value)} required placeholder="Enter 6-digit OTP" />
              <Field label="New Password" type="password" value={fpNewPwd} onChange={e => setFpNewPwd(e.target.value)} required />
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <Button type="submit" disabled={loading}>{loading ? 'Resetting...' : 'Reset Password'}</Button>
                <Button variant="ghost" onClick={() => { setFpStep(1); setFpOtpSent(''); }}>Back</Button>
              </div>
            </form>
          )}
        </Card>
      )}
    </div>
  );
}
