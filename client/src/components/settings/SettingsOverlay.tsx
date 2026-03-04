import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleSettings } from '../../store/uiSlice';
import { setTheme } from '../../store/uiSlice';
import { updateProfile, logout } from '../../store/authSlice';
import { authApi } from '../../services/api';

type SettingsTab = 'account' | 'profile' | 'appearance' | 'notifications' | 'privacy' | 'keybinds';

export default function SettingsOverlay() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { theme } = useAppSelector((state) => state.ui);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');

  // Profile editing
  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');

  // Password change
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const handleSaveProfile = () => {
    const updates: Record<string, string> = {};
    if (username !== user?.username) updates.username = username;
    if (bio !== (user?.bio || '')) updates.bio = bio;
    if (customStatus !== (user?.custom_status || '')) updates.custom_status = customStatus;
    if (Object.keys(updates).length > 0) {
      dispatch(updateProfile(updates));
    }
  };

  const handleChangePassword = async () => {
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPasswordMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
    } catch {
      setPasswordMessage('Failed to change password.');
    }
  };

  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'account', label: 'My Account' },
    { id: 'profile', label: 'Profiles' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'privacy', label: 'Privacy & Safety' },
    { id: 'keybinds', label: 'Keybinds' },
  ];

  return (
    <div className="settings-overlay">
      <div className="settings-sidebar">
        <div className="settings-sidebar-inner">
          <div className="settings-category">User Settings</div>
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`settings-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--bg-quaternary)', margin: '8px 0' }} />
          <div className="settings-item" style={{ color: 'var(--red)' }} onClick={() => { dispatch(logout()); dispatch(toggleSettings()); }}>
            Log Out
          </div>
        </div>
      </div>

      <div className="settings-content">
        {activeTab === 'account' && (
          <div>
            <h2>My Account</h2>
            <div style={{
              background: 'var(--bg-secondary)', borderRadius: 8, padding: 16,
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div className="user-avatar" style={{ width: 80, height: 80, fontSize: 32 }}>
                {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : user?.username?.[0]?.toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--header-primary)' }}>{user?.username}</div>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{user?.email}</div>
              </div>
            </div>

            <div style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 16 }}>Password</h2>
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" className="form-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              {passwordMessage && (
                <div style={{ color: passwordMessage.includes('success') ? 'var(--green)' : 'var(--red)', fontSize: 14, marginBottom: 8 }}>
                  {passwordMessage}
                </div>
              )}
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || newPassword.length < 8}>
                Change Password
              </button>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div>
            <h2>Profile</h2>
            <div className="form-group">
              <label>Username</label>
              <input type="text" className="form-input" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Bio</label>
              <textarea className="form-input" value={bio} onChange={e => setBio(e.target.value)}
                style={{ minHeight: 80, resize: 'vertical' }} maxLength={190} />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{bio.length}/190</div>
            </div>
            <div className="form-group">
              <label>Custom Status</label>
              <input type="text" className="form-input" value={customStatus} onChange={e => setCustomStatus(e.target.value)}
                maxLength={128} placeholder="Set a custom status" />
            </div>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleSaveProfile}>
              Save Changes
            </button>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div>
            <h2>Appearance</h2>
            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 8, display: 'block' }}>
                Theme
              </label>
              <div style={{ display: 'flex', gap: 16 }}>
                <div
                  onClick={() => dispatch(setTheme('dark'))}
                  style={{
                    padding: '16px 24px', borderRadius: 8, cursor: 'pointer',
                    background: theme === 'dark' ? 'var(--brand-color)' : 'var(--bg-secondary)',
                    color: theme === 'dark' ? '#fff' : 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  Dark
                </div>
                <div
                  onClick={() => dispatch(setTheme('light'))}
                  style={{
                    padding: '16px 24px', borderRadius: 8, cursor: 'pointer',
                    background: theme === 'light' ? 'var(--brand-color)' : 'var(--bg-secondary)',
                    color: theme === 'light' ? '#fff' : 'var(--text-primary)',
                    fontWeight: 600,
                  }}
                >
                  Light
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div>
            <h2>Notification Settings</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Enable desktop notifications
                </label>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Enable notification sounds
                </label>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Enable unread message badges
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div>
            <h2>Privacy & Safety</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Allow direct messages from server members
                </label>
              </div>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked />
                  Allow friend requests from everyone
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'keybinds' && (
          <div>
            <h2>Keybinds</h2>
            <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Toggle Mute', 'Ctrl + Shift + M'],
                    ['Toggle Deafen', 'Ctrl + Shift + D'],
                    ['Navigate Channels', 'Alt + Up/Down'],
                    ['Search', 'Ctrl + K'],
                    ['Toggle Pins', 'Ctrl + P'],
                    ['Toggle Member List', 'Ctrl + U'],
                  ].map(([action, binding]) => (
                    <tr key={action} style={{ borderBottom: '1px solid var(--bg-quaternary)' }}>
                      <td style={{ padding: '12px 0', color: 'var(--text-primary)' }}>{action}</td>
                      <td style={{ padding: '12px 0', textAlign: 'right' }}>
                        <code style={{ background: 'var(--bg-tertiary)', padding: '4px 8px', borderRadius: 4, fontSize: 13 }}>
                          {binding}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <button className="settings-close" onClick={() => dispatch(toggleSettings())}>
        &#x2715;
      </button>
    </div>
  );
}
