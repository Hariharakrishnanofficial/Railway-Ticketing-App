/**
 * ProfilePage.jsx — Passenger self-service profile management
 */
import { useState, useEffect } from 'react';
import { usersApi, getCurrentUser } from '../services/api';
import { Card, PageHeader, Button, Spinner } from '../components/UI';
import { Field, Dropdown } from '../components/FormFields';
import { useToast } from '../context/ToastContext';

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState({
    Full_Name: '', Phone_Number: '', Address: '', Date_of_Birth: '',
    ID_Proof_Type: '', ID_Proof_Number: '', Gender: ''
  });
  const toast = useToast();
  const user = getCurrentUser();

  useEffect(() => {
    if (!user?.ID) {
      toast.error('User not logged in');
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // Try to get the user profile
        // The API should automatically include the Authorization header via axios interceptor
        const response = await usersApi.getById(user.ID);
        
        // Handle the response - check both direct data and wrapped format
        let data = response;
        if (response?.data && typeof response.data === 'object') {
          // If response is wrapped, unwrap it
          data = response.data.data || response.data;
        }
        
        if (!data) {
          throw new Error('No profile data returned');
        }

        setProfile({
          Full_Name:      data.Full_Name || '',
          Phone_Number:   data.Phone_Number || '',
          Address:        data.Address || '',
          Date_of_Birth:  data.Date_of_Birth || '',
          ID_Proof_Type:  data.ID_Proof_Type || '',
          ID_Proof_Number: data.ID_Proof_Number || '',
          Gender:         data.Gender || '',
        });
      } catch (err) {
        console.error('Profile load error:', err);
        if (err.status === 401) {
          toast.error('Session expired. Please log in again.');
        } else {
          toast.error('Failed to load profile: ' + (err.message || 'Unknown error'));
        }
      }
      finally {
        setLoading(false);
      }
    })();
  }, [user?.ID]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await usersApi.updateProfile(user.ID, profile);
      // Update session storage
      const updated = { ...user, ...profile };
      sessionStorage.setItem('rail_user', JSON.stringify(updated));
      toast.success('Profile updated successfully');
    } catch (e) { toast.error(e.message || 'Failed to update profile'); }
    finally { setSaving(false); }
  };

  if (loading) return <Spinner />;

  return (
    <div style={{ padding: '24px', maxWidth: 640, margin: '0 auto' }}>
      <PageHeader icon="user" iconAccent="var(--accent-blue)" title="My Profile" subtitle="Update your personal details" />
      <Card padding={24}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Full Name" value={profile.Full_Name}
            onChange={e => setProfile({ ...profile, Full_Name: e.target.value })} required />
          <Field label="Phone Number" value={profile.Phone_Number}
            onChange={e => setProfile({ ...profile, Phone_Number: e.target.value })} />
          <Field label="Address" value={profile.Address}
            onChange={e => setProfile({ ...profile, Address: e.target.value })} />
          <Dropdown label="Gender" value={profile.Gender}
            onChange={e => setProfile({ ...profile, Gender: e.target.value })}
            options={[{ value: '', label: 'Select' }, { value: 'Male', label: 'Male' }, { value: 'Female', label: 'Female' }, { value: 'Other', label: 'Other' }]} />
          <Field label="Date of Birth" type="date" value={profile.Date_of_Birth}
            onChange={e => setProfile({ ...profile, Date_of_Birth: e.target.value })} />
          <Dropdown label="ID Proof Type" value={profile.ID_Proof_Type}
            onChange={e => setProfile({ ...profile, ID_Proof_Type: e.target.value })}
            options={[{ value: '', label: 'Select' }, { value: 'Aadhaar', label: 'Aadhaar' }, { value: 'PAN', label: 'PAN Card' }, { value: 'Passport', label: 'Passport' }, { value: 'Voter_ID', label: 'Voter ID' }]} />
          <Field label="ID Proof Number" value={profile.ID_Proof_Number}
            onChange={e => setProfile({ ...profile, ID_Proof_Number: e.target.value })} />
          <div style={{ marginTop: 24 }}>
            <Button onClick={handleSave} disabled={saving} variant="primary" accent="var(--accent-blue)" icon="check" style={{ width: '100%' }}>{saving ? 'Saving...' : 'Save Profile'}</Button>
          </div>
        </div>
      </Card>

      <Card style={{ maxWidth: '600px', marginTop: '1rem' }}>
        <h3 style={{ margin: '0 0 0.5rem' }}>Account Information</h3>
        <p style={{ margin: 0, opacity: 0.6, fontSize: '0.85rem' }}>
          <strong>Email:</strong> {user?.Email || '—'} (cannot be changed)<br />
          <strong>Role:</strong> {user?.Role || 'User'}<br />
          <strong>Account ID:</strong> {user?.ID || '—'}
        </p>
      </Card>
    </div>
  );
}
