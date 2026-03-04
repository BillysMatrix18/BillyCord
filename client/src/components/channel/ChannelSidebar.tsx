import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServer } from '../../store/serverSlice';
import { setChannels, setCategories, setCurrentChannel } from '../../store/channelSlice';
import { toggleSettings } from '../../store/uiSlice';
import { logout } from '../../store/authSlice';
import { useVoice } from '../../hooks/useVoice';

export default function ChannelSidebar() {
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { currentServer } = useAppSelector((state) => state.servers);
  const { channels, categories } = useAppSelector((state) => state.channels);
  const { user } = useAppSelector((state) => state.auth);
  const { currentVoiceChannel, voiceUsers, isMuted, isDeafened, joinVoiceChannel, leaveVoiceChannel, toggleMute, toggleDeafen } = useVoice();

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
      if (channel) {
        dispatch(setCurrentChannel(channel));
      }
    }
  }, [channelId, channels, dispatch]);

  const textChannels = channels.filter(c => c.type === 'text');
  const voiceChannels = channels.filter(c => c.type === 'voice');

  const handleChannelClick = (channel: { id: string; type: string }) => {
    if (channel.type === 'voice') {
      if (currentVoiceChannel === channel.id) {
        leaveVoiceChannel();
      } else {
        joinVoiceChannel(channel.id);
      }
    } else {
      navigate(`/channels/${serverId}/${channel.id}`);
    }
  };

  // Group channels by category
  const categorized = categories.map(cat => ({
    ...cat,
    channels: textChannels.filter(c => c.category_id === cat.id),
  }));
  const uncategorizedText = textChannels.filter(c => !c.category_id);

  return (
    <div className="channel-sidebar">
      <div className="server-header">
        <span>{currentServer?.name || 'Loading...'}</span>
        <span style={{ fontSize: 12 }}>&#x25BC;</span>
      </div>

      <div className="channel-list">
        {/* Uncategorized text channels */}
        {uncategorizedText.map(ch => (
          <div
            key={ch.id}
            className={`channel-item ${channelId === ch.id ? 'active' : ''}`}
            onClick={() => handleChannelClick(ch)}
          >
            <span className="channel-icon">#</span>
            <span className="channel-name">{ch.name}</span>
          </div>
        ))}

        {/* Categorized channels */}
        {categorized.map(cat => (
          <div key={cat.id}>
            <div className="channel-category">
              <span style={{ fontSize: 10 }}>&#x25BC;</span>
              <span className="channel-category-name">{cat.name}</span>
            </div>
            {cat.channels.map(ch => (
              <div
                key={ch.id}
                className={`channel-item ${channelId === ch.id ? 'active' : ''}`}
                onClick={() => handleChannelClick(ch)}
              >
                <span className="channel-icon">#</span>
                <span className="channel-name">{ch.name}</span>
              </div>
            ))}
          </div>
        ))}

        {/* Voice channels */}
        {voiceChannels.length > 0 && (
          <div>
            <div className="channel-category">
              <span style={{ fontSize: 10 }}>&#x25BC;</span>
              <span className="channel-category-name">Voice Channels</span>
            </div>
            {voiceChannels.map(ch => (
              <div
                key={ch.id}
                className={`channel-item ${currentVoiceChannel === ch.id ? 'active' : ''}`}
                onClick={() => handleChannelClick(ch)}
              >
                <span className="channel-icon" style={{ fontSize: 18 }}>&#x1F50A;</span>
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
              &#x260E;
            </button>
          </div>
          <div className="voice-users">
            {voiceUsers.map(u => (
              <div key={u.socketId} className="voice-user">
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--brand-color)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>
                  {u.username[0]}
                </span>
                {u.username}
              </div>
            ))}
          </div>
          <div className="voice-controls">
            <button className={isMuted ? 'active' : ''} onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
              {isMuted ? '&#x1F507;' : '&#x1F3A4;'}
            </button>
            <button className={isDeafened ? 'active' : ''} onClick={toggleDeafen} title={isDeafened ? 'Undeafen' : 'Deafen'}>
              {isDeafened ? '&#x1F508;' : '&#x1F3A7;'}
            </button>
          </div>
        </div>
      )}

      {/* User panel */}
      <div className="user-panel">
        <div className="user-avatar">
          {user?.avatar_url ? (
            <img src={user.avatar_url} alt={user.username} />
          ) : (
            user?.username?.[0]?.toUpperCase() || '?'
          )}
        </div>
        <div className="user-info">
          <div className="username">{user?.username}</div>
          <div className="status-text">#{user?.id?.substring(0, 4)}</div>
        </div>
        <div className="user-panel-buttons">
          <button onClick={() => dispatch(toggleSettings())} title="Settings">
            &#x2699;
          </button>
          <button onClick={() => dispatch(logout())} title="Logout">
            &#x2190;
          </button>
        </div>
      </div>
    </div>
  );
}
