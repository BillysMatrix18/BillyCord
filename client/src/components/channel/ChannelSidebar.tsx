import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServer } from '../../store/serverSlice';
import { setChannels, setCategories, setCurrentChannel } from '../../store/channelSlice';
import { toggleSettings } from '../../store/uiSlice';
import { setUserStatus } from '../../store/authSlice';
import { authApi, channelApi } from '../../services/api';
import { useVoice } from '../../hooks/useVoice';
import { getSocket } from '../../services/socket';
import { Channel } from '../../types';
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

  // Drag-and-drop state
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'above' | 'below'>('below');
  const [dragType, setDragType] = useState<'text' | 'voice' | null>(null);
  const dragCounter = useRef(0);

  const isOwner = currentServer?.owner_id === user?.id;

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

  // Listen for channel reorder events from other clients
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !serverId) return;
    const handler = (data: { serverId: string }) => {
      if (data.serverId === serverId) {
        dispatch(fetchServer(serverId)).then((result) => {
          if (fetchServer.fulfilled.match(result)) {
            dispatch(setChannels(result.payload.channels));
          }
        });
      }
    };
    socket.on('channel:reordered', handler);
    return () => { socket.off('channel:reordered', handler); };
  }, [serverId, dispatch]);

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

  // --- Drag and Drop handlers ---
  const handleDragStart = useCallback((e: React.DragEvent, channel: Channel) => {
    if (!isOwner) return;
    setDragId(channel.id);
    setDragType(channel.type as 'text' | 'voice');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', channel.id);
    // Add drag styling after a tick so the drag image captures the original style
    setTimeout(() => {
      const el = document.querySelector(`[data-channel-id="${channel.id}"]`) as HTMLElement;
      if (el) el.style.opacity = '0.4';
    }, 0);
  }, [isOwner]);

  const handleDragEnd = useCallback(() => {
    // Reset opacity
    if (dragId) {
      const el = document.querySelector(`[data-channel-id="${dragId}"]`) as HTMLElement;
      if (el) el.style.opacity = '1';
    }
    setDragId(null);
    setDragOverId(null);
    setDragType(null);
    dragCounter.current = 0;
  }, [dragId]);

  const handleDragOver = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    setDragOverPos(e.clientY < midY ? 'above' : 'below');
    setDragOverId(targetId);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverId(targetId);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverId(null);
      dragCounter.current = 0;
    }
  }, []);

  // Handle drop on a category header itself (move channel into that category)
  const handleCategoryDrop = useCallback(async (e: React.DragEvent, categoryId: string) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverId(null);

    if (!dragId || !serverId || !dragType) {
      handleDragEnd();
      return;
    }

    const draggedChannel = channels.find(c => c.id === dragId);
    if (!draggedChannel || draggedChannel.category_id === categoryId) {
      handleDragEnd();
      return;
    }

    // Optimistic update: move channel into new category at position 0
    const updatedChannels = channels.map(ch =>
      ch.id === dragId ? { ...ch, category_id: categoryId, position: 0 } : ch
    );
    dispatch(setChannels(updatedChannels));
    handleDragEnd();

    // Persist category change to server
    try {
      await channelApi.update(serverId, dragId, { category_id: categoryId });
      const socket = getSocket();
      if (socket) socket.emit('channel:reorder', { serverId });
    } catch (error) {
      console.error('Failed to move channel to category:', error);
      dispatch(fetchServer(serverId)).then((result) => {
        if (fetchServer.fulfilled.match(result)) {
          dispatch(setChannels(result.payload.channels));
        }
      });
    }
  }, [dragId, dragType, serverId, channels, dispatch, handleDragEnd]);

  const handleDrop = useCallback(async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    dragCounter.current = 0;
    setDragOverId(null);

    if (!dragId || !serverId || dragId === targetId || !dragType) {
      handleDragEnd();
      return;
    }

    const draggedChannel = channels.find(c => c.id === dragId);
    const targetChannel = channels.find(c => c.id === targetId);
    if (!draggedChannel || !targetChannel) {
      handleDragEnd();
      return;
    }

    // Determine drop position
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dropBelow = e.clientY >= midY;

    // Check if we're moving across categories
    const targetCategoryId = targetChannel.category_id;
    const movingCategory = draggedChannel.category_id !== targetCategoryId;

    // Get channels in the TARGET category (or uncategorized/voice group)
    let list: Channel[];
    if (dragType === 'voice') {
      list = [...voiceChannels];
    } else {
      list = targetCategoryId
        ? channels.filter(c => c.type === 'text' && c.category_id === targetCategoryId)
        : channels.filter(c => c.type === 'text' && !c.category_id);
    }

    // Remove dragged channel from the list if it's already there
    const filteredList = list.filter(c => c.id !== dragId);

    // Find target index in the filtered list
    const targetIndex = filteredList.findIndex(c => c.id === targetId);
    if (targetIndex === -1) {
      handleDragEnd();
      return;
    }

    // Insert at the right position
    const insertIndex = dropBelow ? targetIndex + 1 : targetIndex;
    const movedChannel = { ...draggedChannel, category_id: targetCategoryId };
    filteredList.splice(insertIndex, 0, movedChannel);

    // Build order payload for channels in this group
    const order = filteredList.map((ch, i) => ({ id: ch.id, position: i }));

    // Optimistic update
    const updatedChannels = channels.map(ch => {
      if (ch.id === dragId) {
        return { ...ch, category_id: targetCategoryId, position: order.find(o => o.id === ch.id)?.position ?? ch.position };
      }
      const reordered = order.find(o => o.id === ch.id);
      return reordered ? { ...ch, position: reordered.position } : ch;
    });
    updatedChannels.sort((a, b) => a.position - b.position);
    dispatch(setChannels(updatedChannels));

    handleDragEnd();

    // Persist to server
    try {
      // If category changed, update the channel's category first
      if (movingCategory) {
        await channelApi.update(serverId, dragId, { category_id: targetCategoryId || null });
      }
      await channelApi.reorder(serverId, order);
      const socket = getSocket();
      if (socket) socket.emit('channel:reorder', { serverId });
    } catch (error) {
      console.error('Failed to reorder channels:', error);
      dispatch(fetchServer(serverId)).then((result) => {
        if (fetchServer.fulfilled.match(result)) {
          dispatch(setChannels(result.payload.channels));
        }
      });
    }
  }, [dragId, dragType, serverId, textChannels, voiceChannels, channels, dispatch, handleDragEnd]);

  const renderChannel = (ch: Channel, isVoice = false) => {
    const isActive = isVoice ? currentVoiceChannel === ch.id : channelId === ch.id;
    const isDragging = dragId === ch.id;
    const isDragOver = dragOverId === ch.id && dragId !== ch.id;

    return (
      <div
        key={ch.id}
        data-channel-id={ch.id}
        className={`channel-item ${isActive ? 'active' : ''}`}
        onClick={() => handleChannelClick(ch)}
        draggable={isOwner}
        onDragStart={(e) => handleDragStart(e, ch)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, ch.id)}
        onDragEnter={(e) => handleDragEnter(e, ch.id)}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, ch.id)}
        style={{
          cursor: isOwner ? (isDragging ? 'grabbing' : 'grab') : undefined,
          borderTop: isDragOver && dragOverPos === 'above' ? '2px solid var(--brand-color)' : '2px solid transparent',
          borderBottom: isDragOver && dragOverPos === 'below' ? '2px solid var(--brand-color)' : '2px solid transparent',
          opacity: isDragging ? 0.4 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        <span className="channel-icon">
          {isVoice ? <IconVolume size={18} /> : <IconHash size={18} />}
        </span>
        <span className="channel-name">{ch.name}</span>
      </div>
    );
  };

  return (
    <div className="channel-sidebar">
      <div className="server-header" onClick={() => setShowServerSettings(true)} style={{ cursor: 'pointer' }}>
        <span>{currentServer?.name || 'Loading...'}</span>
        <IconChevronDown size={16} />
      </div>

      <div className="channel-list">
        {uncategorizedText.map(ch => renderChannel(ch))}

        {categorized.map(cat => (
          <div key={cat.id}>
            <div className="channel-category" onClick={() => toggleCategory(cat.id)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
              onDrop={(e) => handleCategoryDrop(e, cat.id)}
            >
              <span style={{
                display: 'flex', transition: 'transform 0.2s',
                transform: collapsedCategories.has(cat.id) ? 'rotate(-90deg)' : 'rotate(0deg)',
              }}>
                <IconChevronDown size={12} />
              </span>
              <span className="channel-category-name">{cat.name}</span>
            </div>
            {!collapsedCategories.has(cat.id) && cat.channels.map(ch => renderChannel(ch))}
          </div>
        ))}

        {voiceChannels.length > 0 && (
          <div>
            <div className="channel-category">
              <IconChevronDown size={12} />
              <span className="channel-category-name">Voice Channels</span>
            </div>
            {voiceChannels.map(ch => renderChannel(ch, true))}
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
