import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServer } from '../../store/serverSlice';
import { setChannels, setCategories, setCurrentChannel } from '../../store/channelSlice';
import { toggleSettings } from '../../store/uiSlice';
import { setUserStatus } from '../../store/authSlice';
import { authApi } from '../../services/api';
import { useVoice } from '../../hooks/useVoice';
import {
  IconHash, IconVolume, IconChevronDown, IconSettings, IconMic, IconMicOff,
  IconHeadphones, IconHeadphonesOff, IconPhoneOff,
} from '../common/Icons';
import ServerSettingsModal from '../server/ServerSettingsModal';

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online', color: 'var(--green)', desc: 'Ready to chat' },
  { value: 'idle', label: 'Idle', color: 'var(--yellow)', desc: 'You may be away' },
  { value: 'dnd', label: 'Do Not Disturb', color: 'var(--red)', desc: 'Block notifications' },
  { value: 'offline', label: 'Invisible', color: 'var(--text-muted)', desc: 'Appear offline' },
] as const;

export default function ChannelSidebar() {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { currentServer } = useAppSelector((state) => state.servers);
  const { channels, categories } = useAppSelector((state) => state.channels);
  const { user } = useAppSelector((state) => state.auth);
  const { currentVoiceChannel, voiceUsers, isMuted, isDeafened, joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } = useVoice();
  const [showStatus, setShowStatus] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('collapsedCategories');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch { return new Set(); }
  });

  useEffect(() => {
    if (serverId) {
      dispatch(fetchServer(serverId)).then((result) => {
        if (fetchServer.fulfilled.match(result)) {
          dispatch(setChannels(result.payload.channels));
          dispatch(setCategories(result.payload.categories));
        }
      });
    }
  }, [serverId, dispatch]);

  useEffect(() => {
    if (channelId) {
      const channel = channels.find(c => c.id === channelId);
      if (channel) dispatch(setCurrentChannel(channel));
    }
  }, [channelId, channels, dispatch]);

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  const handleChannelClick = (channel: { id: string; type: string }) => {
    if (channel.type === 'voice') {
      currentVoiceChannel === channel.id ? leaveVoiceChannel() : joinVoiceChannel(channel.id);
    } else {
      navigate(`/channels/${serverId}/${channel.id}`);
    }
  };

  const toggleCategory = (catId: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      next.has(catId) ? next.delete(catId) : next.add(catId);
      localStorage.setItem('collapsedCategories', JSON.stringify([...next]));
      return next;
    });
  };

  const categorized = categories.map(cat => ({
    ...cat,
    channels: textChannels.filter(c => c.category_id === cat.id),
  }));
  const uncategorizedText = textChannels.filter(c => !c.category_id);

  const handleStatusChange = async (status: string) => {
    dispatch(setUserStatus(status));
    setShowStatus(false);
    try { await authApi.updateProfile({ status }); } catch { /* ignore */ }
  };

  return (
    <div className="channel-sidebar">
      <div className="server-header" onClick={() => setShowServerSettings(true)} style={{ cursor: 'pointer' }}>
        <span>{currentServer?.name || 'Loading...'}</span>
        <IconChevronDown size={16} />
      </div>

      <div className="channel-list">
        {uncategorizedText.map(ch => (
          <div
            key={ch.id}
            className={`channel-item ${channelId === ch.id ? 'active' : ''}`}
            onClick={() => handleChannelClick(ch)}
          >
            <span className="channel-icon"><IconHash size={18} /></span>
            <span className="channel-name">{ch.name}</span>
          </div>
        ))}

        {categorized.map(cat => (
          <div key={cat.id}>
            <div className="channel-category" onClick={() => toggleCategory(cat.id)}>
              <span style={{
                display: 'flex', transition: 'transform 0.2s',
                transform: collapsedCategories.has(cat.id) ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}>
                <IconChevronDown size={12} />
              </span>
              <span className="channel-category-name">{cat.name}</span>
            </div>
            {!collapsedCategories.has(cat.id) && cat.channels.map(ch => (
              <div
                key={ch.id}
                className={`channel-item ${channelId === ch.id ? 'active' : ''}`}
                onClick={() => handleChannelClick(ch)}
              >
                <span className="channel-icon"><IconHash size={18} /></span>
                <span className="channel-name">{ch.name}</span>
              </div>
            ))}
          </div>
        ))}

        {voiceChannels.length > 0 && (
          <div>
            <div className="channel-category">
              <IconChevronDown size={12} />
              <span className="channel-category-name">Voice Channels</span>
            </div>
            {voiceChannels.map(ch => (
              <div
                key={ch.id}
                className={`channel-item ${currentVoiceChannel === ch.id ? 'active' : ''}`}
                onClick={() => handleChannelClick(ch)}
              >
                <span className="channel-icon"><IconVolume size={18} /></span>
                <span className="channel-name">{ch.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice panel */}
      {currentVoiceChannel && (
        <div className="voice-panel">
          <div className="voice-info">
            <div>
              <div className="voice-status">Voice Connected</div>
              <div className="voice-channel-name">
                {channels.find(c => c.id === currentVoiceChannel)?.name || 'Voice Channel'}
              </div>
            </div>
            <button onClick={leaveVoiceChannel} style={{ color: 'var(--red)', fontSize: 18 }} title="Disconnect">
              <IconPhoneOff size={18} />
            </button>
          </div>
          <div className="voice-users">
            {voiceUsers.map(u => (
              <div key={u.socketId} className="voice-user">
                <span style={{ width: 20, height: 20, borderRadius: 'var(--radius-full)', background: 'var(--brand-color)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                  {u.username[0]}
                </span>
                {u.username}
              </div>
            ))}
          </div>
          <div className="voice-controls">
            <button className={isMuted ? 'active' : ''} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? <IconMicOff size={16} /> : <IconMic size={16} />}
            </button>
            <button className={isDeafened ? 'active' : ''} onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
              {isDeafened ? <IconHeadphonesOff size={16} /> : <IconHeadphones size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div className="user-panel" style={{ position: 'relative' }}>
        <div className="user-avatar" style={{ cursor: 'pointer' }} onClick={() => setShowStatus(!showStatus)}>
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.username} />
          ) : (
            user?.username?.[0]?.toUpperCase() || '?'
          )}
          {user?.status && <div className={`member-status-dot ${user.status}`} style={{ borderColor: 'var(--bg-quaternary)' }} />}
        </div>
        <div className="user-info" style={{ cursor: 'pointer' }} onClick={() => setShowStatus(!showStatus)}>
          <div className="username">{user?.username}</div>
          <div className="status-text" style={{ textTransform: 'capitalize' }}>{user?.custom_status || user?.status}</div>
        </div>
        <div className="user-panel-buttons">
          <button onClick={() => dispatch(toggleSettings())} title="User Settings">
            <IconSettings size={18} />
          </button>
        </div>

        {showStatus && (
          <div className="status-selector-popup" onClick={(e) => e.stopPropagation()}>
            {STATUS_OPTIONS.map(opt => (
              <div key={opt.value} className="status-option" onClick={() => handleStatusChange(opt.value)}>
                <div className="status-dot" style={{ background: opt.color }} />
                <div>
                  <div className="status-label">{opt.label}</div>
                  <div className="status-desc">{opt.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showServerSettings && serverId && (
        <ServerSettingsModal serverId={serverId} onClose={() => setShowServerSettings(false)} />
      )}
    </div>
  );
}
