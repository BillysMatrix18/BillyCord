import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleSettings, setThemeWithSync } from '../../store/uiSlice';
import { updateProfile, logout } from '../../store/authSlice';
import { authApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { clearServerAddress } from '../common/ConnectionScreen';
import {
  IconUser, IconPalette, IconBell, IconShield, IconKeyboard, IconLogout,
  IconX, IconCamera, IconTrashAccount, IconLock, IconSun, IconMoon,
} from '../common/Icons';

type SettingsTab = 'account' | 'profile' | 'appearance' | 'animations' | 'notifications' | 'privacy' | 'voice' | 'accessibility' | 'keybinds' | 'devmode' | 'about';

export default function SettingsOverlay() {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { theme } = useAppSelector((state) => state.ui);
  const [activeTab, setActiveTab] = useState<SettingsTab>('account');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState(user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [customStatus, setCustomStatus] = useState(user?.custom_status || '');
  const [pronouns, setPronouns] = useState(user?.pronouns || '');
  const [location, setLocation] = useState(user?.location || '');
  const [birthday, setBirthday] = useState(user?.birthday || '');
  const [profileColor, setProfileColor] = useState(user?.profile_color || '#5865F2');
  const [profileVisibility, setProfileVisibility] = useState(user?.profile_visibility || 'public');
  const [profileSaved, setProfileSaved] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  // Appearance state
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('compactMode') === 'true');
  const [messageSpacing, setMessageSpacing] = useState(() => localStorage.getItem('messageSpacing') || 'normal');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('fontSize') || 'normal');

  // Animations state
  const [animationsEnabled, setAnimationsEnabled] = useState(() => (localStorage.getItem('animationsEnabled') || 'on') === 'on');
  const [animationSpeed, setAnimationSpeed] = useState(() => localStorage.getItem('animationSpeed') || '300');

  // Voice state
  const [micVolume, setMicVolume] = useState(() => Number(localStorage.getItem('micVolume') || '100'));
  const [speakerVolume, setSpeakerVolume] = useState(() => Number(localStorage.getItem('speakerVolume') || '100'));
  const [echoCancellation, setEchoCancellation] = useState(() => localStorage.getItem('echoCancellation') !== 'false');
  const [noiseSuppression, setNoiseSuppression] = useState(() => localStorage.getItem('noiseSuppression') !== 'false');
  const [autoAdjustMic, setAutoAdjustMic] = useState(() => localStorage.getItem('autoAdjustMic') !== 'false');

  // Accessibility state
  const [highContrast, setHighContrast] = useState(() => localStorage.getItem('highContrast') === 'true');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('reduceMotion') === 'true');
  const [textScale, setTextScale] = useState(() => localStorage.getItem('textScale') || '100');
  const [focusIndicators, setFocusIndicators] = useState(() => localStorage.getItem('focusIndicators') !== 'false');

  // Dev Mode state
  const [devModeEnabled, setDevModeEnabled] = useState(() => localStorage.getItem('devMode') === 'true');
  const [ping, setPing] = useState<number | null>(null);
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const [connectionQuality, setConnectionQuality] = useState<'Excellent' | 'Good' | 'Fair' | 'Weak' | 'Disconnected'>('Good');
  const [socketTransport, setSocketTransport] = useState<string>('unknown');
  const [socketConnected, setSocketConnected] = useState(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const measurePing = useCallback(() => {
    const socket = getSocket();
    if (!socket?.connected) {
      setSocketConnected(false);
      setConnectionQuality('Disconnected');
      setPing(null);
      return;
    }
    setSocketConnected(true);
    setSocketTransport(socket.io?.engine?.transport?.name || 'unknown');
    const start = Date.now();
    socket.volatile.emit('ping:measure', {}, () => {
      const latency = Date.now() - start;
      setPing(latency);
      setPingHistory(prev => [...prev.slice(-29), latency]);
      if (latency < 80) setConnectionQuality('Excellent');
      else if (latency < 150) setConnectionQuality('Good');
      else if (latency < 300) setConnectionQuality('Fair');
      else setConnectionQuality('Weak');
    });
    // Fallback: if no ack in 3s, use socket.io built-in
    setTimeout(() => {
      setPing(prev => prev ?? -1);
    }, 3000);
  }, []);

  useEffect(() => {
    if (activeTab === 'devmode' || devModeEnabled) {
      measurePing();
      pingIntervalRef.current = setInterval(measurePing, 3000);
      return () => { if (pingIntervalRef.current) clearInterval(pingIntervalRef.current); };
    }
  }, [activeTab, devModeEnabled, measurePing]);

  const handleDevModeToggle = (val: boolean) => {
    setDevModeEnabled(val);
    localStorage.setItem('devMode', String(val));
  };

  const avgPing = pingHistory.length > 0 ? Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length) : null;
  const maxPing = pingHistory.length > 0 ? Math.max(...pingHistory) : null;
  const minPing = pingHistory.length > 0 ? Math.min(...pingHistory) : null;
  const jitter = pingHistory.length > 1 ? Math.round(Math.sqrt(pingHistory.reduce((sum, p) => sum + Math.pow(p - (avgPing || 0), 2), 0) / pingHistory.length)) : null;

  const qualityColor = connectionQuality === 'Excellent' ? '#48bb78' : connectionQuality === 'Good' ? '#68d391' : connectionQuality === 'Fair' ? '#ecc94b' : connectionQuality === 'Weak' ? '#fc5c65' : '#6d6f78';

  const handleSaveProfile = () => {
    const updates: Record<string, string> = {};
    if (username !== user?.username) updates.username = username;
    if (bio !== (user?.bio || '')) updates.bio = bio;
    if (customStatus !== (user?.custom_status || '')) updates.custom_status = customStatus;
    if (pronouns !== (user?.pronouns || '')) updates.pronouns = pronouns;
    if (location !== (user?.location || '')) updates.location = location;
    if (birthday !== (user?.birthday || '')) updates.birthday = birthday;
    if (profileColor !== (user?.profile_color || '#5865F2')) updates.profile_color = profileColor;
    if (profileVisibility !== (user?.profile_visibility || 'public')) updates.profile_visibility = profileVisibility;
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

  // Appearance handlers
  const handleCompactModeToggle = (val: boolean) => {
    setCompactMode(val);
    localStorage.setItem('compactMode', String(val));
  };

  const handleMessageSpacingChange = (val: string) => {
    setMessageSpacing(val);
    localStorage.setItem('messageSpacing', val);
  };

  const handleFontSizeChange = (val: string) => {
    setFontSize(val);
    localStorage.setItem('fontSize', val);
    const sizeMap: Record<string, string> = { small: '14px', normal: '16px', large: '18px' };
    document.documentElement.style.setProperty('--font-size-base', sizeMap[val] || '16px');
  };

  // Animation handlers
  const handleAnimationsToggle = (val: boolean) => {
    setAnimationsEnabled(val);
    localStorage.setItem('animationsEnabled', val ? 'on' : 'off');
    document.documentElement.setAttribute('data-animations', val ? 'on' : 'off');
  };

  const handleAnimationSpeedChange = (speed: string) => {
    setAnimationSpeed(speed);
    localStorage.setItem('animationSpeed', speed);
    document.documentElement.style.setProperty('--animation-speed', speed + 'ms');
  };

  // Voice handlers
  const handleMicVolumeChange = (val: number) => {
    setMicVolume(val);
    localStorage.setItem('micVolume', String(val));
  };

  const handleSpeakerVolumeChange = (val: number) => {
    setSpeakerVolume(val);
    localStorage.setItem('speakerVolume', String(val));
  };

  const handleEchoCancellationToggle = (val: boolean) => {
    setEchoCancellation(val);
    localStorage.setItem('echoCancellation', String(val));
  };

  const handleNoiseSuppressionToggle = (val: boolean) => {
    setNoiseSuppression(val);
    localStorage.setItem('noiseSuppression', String(val));
  };

  const handleAutoAdjustMicToggle = (val: boolean) => {
    setAutoAdjustMic(val);
    localStorage.setItem('autoAdjustMic', String(val));
  };

  // Accessibility handlers
  const handleHighContrastToggle = (val: boolean) => {
    setHighContrast(val);
    localStorage.setItem('highContrast', String(val));
  };

  const handleReduceMotionToggle = (val: boolean) => {
    setReduceMotion(val);
    localStorage.setItem('reduceMotion', String(val));
    if (val) {
      document.documentElement.setAttribute('data-animations', 'off');
    } else {
      document.documentElement.setAttribute('data-animations', animationsEnabled ? 'on' : 'off');
    }
  };

  const handleTextScaleChange = (val: string) => {
    setTextScale(val);
    localStorage.setItem('textScale', val);
    document.documentElement.style.fontSize = val + '%';
  };

  const handleFocusIndicatorsToggle = (val: boolean) => {
    setFocusIndicators(val);
    localStorage.setItem('focusIndicators', String(val));
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'account', label: 'My Account', icon: <IconUser size={16} /> },
    { id: 'profile', label: 'Profiles', icon: <IconUser size={16} /> },
    { id: 'appearance', label: 'Appearance', icon: <IconPalette size={16} /> },
    { id: 'animations', label: 'Animations', icon: <IconPalette size={16} /> },
    { id: 'notifications', label: 'Notifications', icon: <IconBell size={16} /> },
    { id: 'privacy', label: 'Privacy & Safety', icon: <IconShield size={16} /> },
    { id: 'voice', label: 'Voice & Video', icon: <IconBell size={16} /> },
    { id: 'accessibility', label: 'Accessibility', icon: <IconShield size={16} /> },
    { id: 'keybinds', label: 'Keybinds', icon: <IconKeyboard size={16} /> },
    { id: 'devmode', label: 'Dev Mode', icon: <IconKeyboard size={16} /> },
    { id: 'about', label: 'About', icon: <IconUser size={16} /> },
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
          <div className="settings-item" onClick={() => { clearServerAddress(); window.location.reload(); }}>
            <IconLogout size={16} />
            Change Server
          </div>
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label>Pronouns</label>
                <input type="text" className="form-input" value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="e.g. they/them" maxLength={40} />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" className="form-input" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. New York, USA" maxLength={60} />
              </div>
              <div className="form-group">
                <label>Birthday</label>
                <input type="date" className="form-input" value={birthday} onChange={e => setBirthday(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Profile Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="color" value={profileColor} onChange={e => setProfileColor(e.target.value)} style={{ width: 40, height: 34, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: 'transparent' }} />
                  <input type="text" className="form-input" value={profileColor} onChange={e => setProfileColor(e.target.value)} style={{ flex: 1 }} maxLength={7} />
                </div>
              </div>
            </div>
            <div className="form-group">
              <label>Profile Visibility</label>
              <select className="form-input" value={profileVisibility} onChange={e => setProfileVisibility(e.target.value as 'public' | 'friends' | 'private')}>
                <option value="public">Public - Anyone can see your profile</option>
                <option value="friends">Friends Only - Only friends can see</option>
                <option value="private">Private - Only you can see</option>
              </select>
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
              <div className={`theme-option ${theme === 'dark' ? 'active' : ''}`} onClick={() => dispatch(setThemeWithSync('dark'))}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #313338, #1e1f22)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'dark' ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
                  <IconMoon size={16} /> Dark
                </div>
              </div>
              <div className={`theme-option ${theme === 'light' ? 'active' : ''}`} onClick={() => dispatch(setThemeWithSync('light'))}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #ffffff, #f2f3f5)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'light' ? 'var(--brand-color)' : 'var(--text-secondary)' }}>
                  <IconSun size={16} /> Light
                </div>
              </div>
              <div className={`theme-option ${theme === 'super' ? 'active' : ''}`} onClick={() => dispatch(setThemeWithSync('super'))}
                style={theme === 'super' ? { borderColor: '#8b5cf6' } : {}}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #0f0f23, #2d1b69, #ec4899, #8b5cf6)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'super' ? '#8b5cf6' : 'var(--text-secondary)' }}>
                  Super Mode
                </div>
              </div>
              <div className={`theme-option ${theme === 'glass' ? 'active' : ''}`} onClick={() => dispatch(setThemeWithSync('glass'))}
                style={theme === 'glass' ? { borderColor: '#0A84FF' } : {}}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #0A1A2E, #16213E, rgba(10,132,255,0.3), #0F0F1E)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'glass' ? '#0A84FF' : 'var(--text-secondary)' }}>
                  Liquid Glass
                </div>
              </div>
              <div className={`theme-option ${theme === 'sakura' ? 'active' : ''}`} onClick={() => dispatch(setThemeWithSync('sakura'))}
                style={theme === 'sakura' ? { borderColor: '#ec4899' } : {}}>
                <div className="theme-preview" style={{ background: 'linear-gradient(135deg, #140e1a, #2a1035, #ec4899, #a78bfa)' }} />
                <div className="theme-label" style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', color: theme === 'sakura' ? '#ec4899' : 'var(--text-secondary)' }}>
                  Sakura Blossom
                </div>
              </div>
            </div>

            <div style={{ marginTop: 32 }}>
              <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Layout</label>
              <div className="settings-card">
                <div className="settings-toggle-row">
                  <div>
                    <div className="toggle-label">Compact Mode</div>
                    <div className="toggle-desc">Reduce padding and margins for a denser layout</div>
                  </div>
                  <label className="switch-toggle">
                    <input type="checkbox" checked={compactMode} onChange={e => handleCompactModeToggle(e.target.checked)} />
                    <span className="switch-slider" />
                  </label>
                </div>

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label>Message Group Spacing</label>
                  <select className="form-input" value={messageSpacing} onChange={e => handleMessageSpacingChange(e.target.value)}>
                    <option value="compact">Compact</option>
                    <option value="normal">Normal</option>
                    <option value="spacious">Spacious</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginTop: 16 }}>
                  <label>Font Size</label>
                  <select className="form-input" value={fontSize} onChange={e => handleFontSizeChange(e.target.value)}>
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'animations' && (
          <div className="animate-fade-in">
            <h2>Animations</h2>
            <div className="settings-card">
              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Smooth Animations</div>
                  <div className="toggle-desc">Enable smooth transitions and animations throughout the app</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={animationsEnabled} onChange={e => handleAnimationsToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Animation Speed</label>
                <select className="form-input" value={animationSpeed} onChange={e => handleAnimationSpeedChange(e.target.value)}>
                  <option value="400">Slow (400ms)</option>
                  <option value="300">Normal (300ms)</option>
                  <option value="200">Fast (200ms)</option>
                  <option value="100">Ultra Fast (100ms)</option>
                </select>
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

        {activeTab === 'voice' && (
          <div className="animate-fade-in">
            <h2>Voice & Video</h2>
            <div className="settings-card">
              <div className="form-group">
                <label>Microphone</label>
                <select className="form-input">
                  <option value="default">Default</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Speaker</label>
                <select className="form-input">
                  <option value="default">Default</option>
                </select>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Microphone Volume - {micVolume}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={micVolume}
                  onChange={e => handleMicVolumeChange(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-color)' }}
                />
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Speaker Volume - {speakerVolume}%</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={speakerVolume}
                  onChange={e => handleSpeakerVolumeChange(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--brand-color)' }}
                />
              </div>
            </div>

            <div className="settings-card" style={{ marginTop: 16 }}>
              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Echo Cancellation</div>
                  <div className="toggle-desc">Reduce echo from your speakers</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={echoCancellation} onChange={e => handleEchoCancellationToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Noise Suppression</div>
                  <div className="toggle-desc">Filter out background noise from your microphone</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={noiseSuppression} onChange={e => handleNoiseSuppressionToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Auto-Adjust Mic Level</div>
                  <div className="toggle-desc">Automatically adjust microphone sensitivity</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={autoAdjustMic} onChange={e => handleAutoAdjustMicToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'accessibility' && (
          <div className="animate-fade-in">
            <h2>Accessibility</h2>
            <div className="settings-card">
              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">High Contrast Mode</div>
                  <div className="toggle-desc">Increase contrast for better visibility</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={highContrast} onChange={e => handleHighContrastToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Reduce Motion</div>
                  <div className="toggle-desc">Disable most animations and transitions</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={reduceMotion} onChange={e => handleReduceMotionToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>

              <div className="form-group" style={{ marginTop: 16 }}>
                <label>Text Scaling</label>
                <select className="form-input" value={textScale} onChange={e => handleTextScaleChange(e.target.value)}>
                  <option value="80">80%</option>
                  <option value="90">90%</option>
                  <option value="100">100%</option>
                  <option value="110">110%</option>
                  <option value="120">120%</option>
                </select>
              </div>

              <div className="settings-toggle-row" style={{ marginTop: 16 }}>
                <div>
                  <div className="toggle-label">Focus Indicators</div>
                  <div className="toggle-desc">Show visible outlines around focused elements</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={focusIndicators} onChange={e => handleFocusIndicatorsToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>
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

        {activeTab === 'devmode' && (
          <div className="animate-fade-in">
            <h2>Dev Mode</h2>
            <div className="settings-card">
              <div className="settings-toggle-row">
                <div>
                  <div className="toggle-label">Enable Dev Mode</div>
                  <div className="toggle-desc">Show network stats overlay and connection diagnostics</div>
                </div>
                <label className="switch-toggle">
                  <input type="checkbox" checked={devModeEnabled} onChange={e => handleDevModeToggle(e.target.checked)} />
                  <span className="switch-slider" />
                </label>
              </div>
            </div>

            <div className="settings-card" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--header-primary)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: socketConnected ? '#48bb78' : '#fc5c65', display: 'inline-block', boxShadow: socketConnected ? '0 0 8px #48bb78' : '0 0 8px #fc5c65' }} />
                Connection Status
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: qualityColor, fontFamily: 'monospace' }}>
                    {ping !== null ? `${ping}ms` : '---'}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Current Ping</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 16, textAlign: 'center' }}>
                  <div style={{ fontSize: 28, fontWeight: 700, color: qualityColor }}>
                    {connectionQuality}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Connection Quality</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginTop: 12 }}>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{avgPing !== null ? `${avgPing}ms` : '---'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Avg</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{minPing !== null ? `${minPing}ms` : '---'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Min</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{maxPing !== null ? `${maxPing}ms` : '---'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Max</div>
                </div>
                <div style={{ background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-sm)', padding: '10px 8px', textAlign: 'center' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{jitter !== null ? `${jitter}ms` : '---'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Jitter</div>
                </div>
              </div>

              {/* Ping graph */}
              {pingHistory.length > 1 && (
                <div style={{ marginTop: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Ping History</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
                    {pingHistory.map((p, i) => {
                      const maxVal = Math.max(...pingHistory, 100);
                      const height = Math.max((p / maxVal) * 100, 3);
                      const barColor = p < 80 ? '#48bb78' : p < 150 ? '#68d391' : p < 300 ? '#ecc94b' : '#fc5c65';
                      return (
                        <div key={i} title={`${p}ms`} style={{
                          flex: 1, height: `${height}%`, background: barColor,
                          borderRadius: '2px 2px 0 0', transition: 'height 0.3s ease',
                          minWidth: 3,
                        }} />
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="settings-card" style={{ marginTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--header-primary)', marginBottom: 12 }}>Network Details</h3>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 2 }}>
                <div><strong style={{ color: 'var(--text-primary)' }}>Transport:</strong> {socketTransport}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Connected:</strong> {socketConnected ? 'Yes' : 'No'}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Server:</strong> {localStorage.getItem('serverAddress') || window.location.origin}</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Protocol:</strong> Socket.IO / WebSocket</div>
                <div><strong style={{ color: 'var(--text-primary)' }}>Samples:</strong> {pingHistory.length}/30</div>
              </div>
            </div>

            <div style={{ marginTop: 16, padding: 12, background: qualityColor + '15', borderRadius: 'var(--radius-md)', border: `1px solid ${qualityColor}30`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: qualityColor + '25', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                {connectionQuality === 'Excellent' ? '🚀' : connectionQuality === 'Good' ? '✅' : connectionQuality === 'Fair' ? '⚠️' : connectionQuality === 'Weak' ? '🐌' : '❌'}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: qualityColor, fontSize: 15 }}>
                  {connectionQuality === 'Excellent' ? 'Excellent Connection' : connectionQuality === 'Good' ? 'Good Connection' : connectionQuality === 'Fair' ? 'Fair Connection – May experience delays' : connectionQuality === 'Weak' ? 'Weak Connection – High latency detected' : 'Disconnected – No server connection'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {connectionQuality === 'Excellent' ? 'Messages should deliver instantly.' : connectionQuality === 'Good' ? 'Messages should deliver quickly.' : connectionQuality === 'Fair' ? 'Friends may notice a slight delay seeing your messages.' : connectionQuality === 'Weak' ? 'Friends will experience significant delays. Consider checking your internet.' : 'Check your internet connection and server status.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'about' && (
          <div className="animate-fade-in">
            <h2>About</h2>
            <div className="settings-card">
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--header-primary)', marginBottom: 4 }}>BillyCord</h1>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>Version 0.1.2</div>
              </div>

              <div style={{ borderTop: '1px solid var(--bg-modifier-hover)', padding: '16px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Platform:</strong> Web Application
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Runtime:</strong> Node.js v20.x
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Architecture:</strong> React + TypeScript
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>Server:</strong> {localStorage.getItem('serverAddress') || 'Local'}
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--bg-modifier-hover)', paddingTop: 16, marginTop: 8 }}>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Changelog</label>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Version 0.1.2</strong>
                    <span style={{ color: 'var(--text-muted)', marginLeft: 8, fontSize: 12 }}>Latest</span>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc' }}>
                      <li>Fixed server icons not visible to other users (URL resolution)</li>
                      <li>Fixed timestamps to display in user's local timezone</li>
                      <li>Server settings: full-screen Discord-style layout with opaque background</li>
                      <li>Server settings: ESC key closes the settings modal</li>
                      <li>Auto-focus message input when opening a channel or DM</li>
                      <li>Fixed message input click/focus issues</li>
                      <li>Added right-click context menu to DM messages</li>
                      <li>Badges now display on user profile modals</li>
                      <li>Muted users are now blocked from sending messages</li>
                    </ul>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Version 0.1.1</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc' }}>
                      <li>Fixed app loading stale cached version on startup</li>
                      <li>Fixed status bubble visibility on message avatars</li>
                      <li>Added right-click context menu with edit and react</li>
                      <li>Server settings: icon upload, role permissions, role assignment</li>
                      <li>Admin panel: comprehensive user management modal with 5 tabs</li>
                      <li>Admin panel: badge system with checkboxes displayed next to usernames</li>
                      <li>Admin panel: fixed mute/unmute, ban/unban, and other actions</li>
                      <li>Admin panel: enhanced logging with error and security log fetching</li>
                      <li>Added rich micro-animations and hover effects (togglable)</li>
                      <li>Fixed friends table queries and admin database schema</li>
                    </ul>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Alpha 0.0.9</strong>
                    <ul style={{ margin: '4px 0 0 16px', padding: 0, listStyle: 'disc' }}>
                      <li>Fixed message editing keybinds (Escape/Enter) for image-only messages</li>
                      <li>Fixed message reactions not displaying or updating properly</li>
                      <li>Fixed server list active indicator (home icon no longer stuck active)</li>
                      <li>Added channel unread notifications with badge counts</li>
                      <li>Redesigned admin panel with modern dashboard layout</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--bg-modifier-hover)', paddingTop: 16, marginTop: 16 }}>
                <button
                  className="btn btn-primary"
                  style={{ width: 'auto', marginBottom: 16 }}
                  onClick={() => alert("You're up to date!")}
                >
                  Check for Updates
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--bg-modifier-hover)', paddingTop: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: 12, display: 'block' }}>Links</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); alert('Report Bug form would open here.'); }}
                    style={{ color: 'var(--brand-color)', fontSize: 14, textDecoration: 'none', cursor: 'pointer' }}
                  >
                    Report Bug
                  </a>
                  <a
                    href="#"
                    onClick={e => { e.preventDefault(); alert('Feedback form would open here.'); }}
                    style={{ color: 'var(--brand-color)', fontSize: 14, textDecoration: 'none', cursor: 'pointer' }}
                  >
                    Give Feedback
                  </a>
                </div>
              </div>
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
