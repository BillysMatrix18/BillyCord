import { useState, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleSettings, setTheme } from '../../store/uiSlice';
import { updateProfile, logout } from '../../store/authSlice';
import { authApi } from '../../services/api';
import {
  IconUser, IconPalette, IconBell, IconShield, IconKeyboard, IconLogout,
  IconX, IconCamera, IconTrashAccount, IconLock, IconSun, IconMoon,
} from '../common/Icons';

type SettingsTab = 'account' | 'profile' | 'appearance' | 'notifications' | 'privacy' | 'keybinds';

export default function SettingsOverlay() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { theme } = useAppSelector((state) => state.ui);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  const handleSaveProfile = () => {
    const updates: Record<string, string> = {};
    if (username !== user?.username) updates.username = username;
    if (bio !== (user?.bio || '')) updates.bio = bio;
    if (customStatus !== (user?.custom_status || '')) updates.custom_status = customStatus;
    if (Object.keys(updates).length > 0) {
      dispatch(updateProfile(updates));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    }
  };

  const handleChangePassword = async () => {
    try {
      await authApi.changePassword({ currentPassword, newPassword });
      setPasswordMessage('Password changed successfully!');
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordMessage(''), 3000);
    } catch {
      setPasswordMessage('Failed to change password. Check your current password.');
    }
  };

  const handleAvatarClick = () => fileInputRef.current?.click();

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      dispatch(updateProfile({ avatar_url: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteAccount = async () => {
    try {
      await authApi.changePassword({ currentPassword: deletePassword, newPassword: '' });
      dispatch(logout());
      dispatch(toggleSettings());
    } catch {
      setPasswordMessage('Incorrect password.');
    }
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'My Account', icon: <IconUser size={16} /> },
    { id: 'profile', label: 'Profiles', icon: <IconUser size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <IconPalette size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <IconBell size={16} /> },
    { id: 'privacy', label: 'Privacy & Safety', icon: <IconShield size={16} /> },
    { id: 'keybinds', label: 'Keybinds', icon: <IconKeyboard size={16} /> },
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
              {tab.icon}
              {tab.label}
            </div>
          ))}
          <div style={{ height: 1, background: 'var(--bg-modifier-hover)', margin: '8px 0' }} />
          <div className="settings-item" style={{ color: 'var(--red)' }} onClick={() => { dispatch(logout()); dispatch(toggleSettings()); }}>
            <IconLogout size={16} />
            Log Out
          </div>
        </div>
      </div>

      <div className="settings-content">
        {activeTab === 'account' && (
          <div className="animate-fade-in">
            <h2>My Account</h2>
            <div className="settings-card">
              <div className="settings-profile-header">
                <div className="settings-avatar-wrapper" onClick={handleAvatarClick}>
                  <div className="avatar-large">
                    {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : user?.username?.[0]?.toUpperCase()}
                  </div>
                  <div className="avatar-overlay"><IconCamera size={24} /></div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                </div>
                <div className="profile-info">
                  <div className="display-name">{user?.username}</div>
                  <div className="email-text">{user?.email}</div>
                </div>
              </div>
            </div>

            <div className="settings-card">
              <h2 style={{ fontSize: 16, marginBottom: 16 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconLock size={18} />Password & Authentication</span>
              </h2>
              <div className="form-group">
                <label>Current Password</label>
                <input type="password" className="form-input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="Enter current password" />
              </div>
              <div className="form-group">
                <label>New Password</label>
                <input type="password" className="form-input" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Enter new password" />
              </div>
              {passwordMessage && (
                <div style={{ color: passwordMessage.includes('success') ? 'var(--green)' : 'var(--red)', fontSize: 14, marginBottom: 12 }}>{passwordMessage}</div>
              )}
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleChangePassword}
                disabled={!currentPassword || !newPassword || newPassword.length < 8}>
                Change Password
              </button>
            </div>

            <div className="danger-zone">
              <h3><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconTrashAccount size={18} />Delete Account</span></h3>
              <p>Permanently delete your account and all associated data. This action cannot be undone.</p>
              {!showDeleteConfirm ? (
                <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => setShowDeleteConfirm(true)}>Delete Account</button>
              ) : (
                <div className="animate-fade-in">
                  <div className="form-group" style={{ marginBottom: 12 }}>
                    <label>Confirm your password</label>
                    <input type="password" className="form-input" value={deletePassword} onChange={e => setDeletePassword(e.target.value)} placeholder="Enter your password" />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-danger" style={{ width: 'auto' }} onClick={handleDeleteAccount} disabled={!deletePassword}>Confirm Delete</button>
                    <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="animate-fade-in">
            <h2>Profile</h2>
            <div className="settings-card" style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
              <div className="settings-avatar-wrapper" onClick={handleAvatarClick}>
                <div className="avatar-large">
                  {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : user?.username?.[0]?.toUpperCase()}
                </div>
                <div className="avatar-overlay"><IconCamera size={24} /></div>
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--header-primary)', marginBottom: 4 }}>Profile Picture</div>
                <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 16px', fontSize: 13 }} onClick={handleAvatarClick}>Change Avatar</button>
              </div>
            </div>
            <div className="form-group">
              <label>Display Name</label>
              <input type="text" className="form-input" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Bio</label>
              <textarea className="form-input" value={bio} onChange={e => setBio(e.target.value)} style={{ minHeight: 80, resize: 'vertical' }} maxLength={190} placeholder="Tell us about yourself" />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{bio.length}/190</div>
            </div>
            <div className="form-group">
              <label>Custom Status</label>
              <input type="text" className="form-input" value={customStatus} onChange={e => setCustomStatus(e.target.value)} maxLength={128} placeholder="What are you up to?" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={handleSaveProfile}>Save Changes</button>
              {profileSaved && <span className="animate-fade-in" style={{ color: 'var(--green)', fontSize: 14, fontWeight: 500 }}>Profile saved!</span>}
            </div>
          </div>
        )}

        {activeTab === 'appearance' && (
          <div className="animate-fade-in">
            <h2>Appearance</h2>
            <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Theme</label>
            <div className="theme-options">
              <div className={`theme-option ${theme === 'dark' ? 'active' : ''}`} onClick={() => dispatch(setTheme('dark'))}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #313338, #1e1f22)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'dark' ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
                  <IconMoon size={16} /> Dark
                </div>
              </div>
              <div className={`theme-option ${theme === 'light' ? 'active' : ''}`} onClick={() => dispatch(setTheme('light'))}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #ffffff, #f2f3f5)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'light' ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
                  <IconSun size={16} /> Light
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="animate-fade-in">
            <h2>Notification Settings</h2>
            <div className="settings-card">
              {[
                { label: 'Desktop Notifications', desc: 'Show notifications on your desktop' },
                { label: 'Notification Sounds', desc: 'Play sounds for new messages' },
                { label: 'Unread Message Badges', desc: 'Show badge count for unread messages' },
              ].map(item => (
                <div key={item.label} className="settings-toggle-row">
                  <div>
                    <div className="toggle-label">{item.label}</div>
                    <div className="toggle-desc">{item.desc}</div>
                  </div>
                  <label className="switch-toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="switch-slider" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="animate-fade-in">
            <h2>Privacy & Safety</h2>
            <div className="settings-card">
              {[
                { label: 'Allow Direct Messages from Server Members', desc: 'Let server members message you directly' },
                { label: 'Allow Friend Requests from Everyone', desc: 'Anyone can send you a friend request' },
              ].map(item => (
                <div key={item.label} className="settings-toggle-row">
                  <div>
                    <div className="toggle-label">{item.label}</div>
                    <div className="toggle-desc">{item.desc}</div>
                  </div>
                  <label className="switch-toggle">
                    <input type="checkbox" defaultChecked />
                    <span className="switch-slider" />
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'keybinds' && (
          <div className="animate-fade-in">
            <h2>Keybinds</h2>
            <div className="settings-card" style={{ padding: 0 }}>
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
                    <tr key={action} style={{ borderBottom: '1px solid var(--bg-modifier-hover)' }}>
                      <td style={{ padding: '14px 20px', color: 'var(--text-primary)', fontSize: 14 }}>{action}</td>
                      <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                        <code style={{ background: 'var(--bg-tertiary)', padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--text-secondary)' }}>{binding}</code>
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
        <IconX size={18} />
      </button>
    </div>
  );
}
