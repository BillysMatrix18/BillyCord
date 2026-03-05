import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchConversations, clearConversationUnread } from '../../store/dmSlice';
import { toggleSettings } from '../../store/uiSlice';
import { setUserStatus } from '../../store/authSlice';
import { authApi, dmApi } from '../../services/api';
import { IconSettings, IconUsers, IconSearch } from '../common/Icons';

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online', color: 'var(--green)', desc: 'Ready to chat' },
  { value: 'idle', label: 'Idle', color: 'var(--yellow)', desc: 'You may be away' },
  { value: 'dnd', label: 'Do Not Disturb', color: 'var(--red)', desc: 'Block notifications' },
  { value: 'offline', label: 'Invisible', color: 'var(--text-muted)', desc: 'Appear offline' },
] as const;

export default function DmSidebar() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const dispatch = useAppDispatch();
  const { conversations } = useAppSelector((state) => state.dm);
  const { user } = useAppSelector((state) => state.auth);
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  // Mark conversation as read when opened
  useEffect(() => {
    if (conversationId) {
      dispatch(clearConversationUnread(conversationId));
      dmApi.markRead(conversationId).catch(() => {});
    }
  }, [conversationId, dispatch]);

  const handleStatusChange = async (status: string) => {
    dispatch(setUserStatus(status));
    setShowStatus(false);
    try { await authApi.updateProfile({ status }); } catch { /* ignore */ }
  };

  return (
    <div className="channel-sidebar">
      {/* Search bar instead of "Direct Messages" header */}
      <div className="dm-search-bar">
        <button>
          <IconSearch size={14} />
          Find or start a conversation
        </button>
      </div>

      <div className="channel-list" style={{ padding: '8px' }}>
        <div
          className={`channel-item ${!conversationId ? 'active' : ''}`}
          onClick={() => navigate('/channels/@me')}
          style={{ marginBottom: 4 }}
        >
          <span className="channel-icon"><IconUsers size={20} /></span>
          <span className="channel-name">Friends</span>
        </div>

        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '12px 8px 6px', letterSpacing: '0.02em' }}>
          Direct Messages
        </div>

        {conversations.map(conv => {
          const displayName = conv.is_group
            ? conv.name || conv.participants?.map(p => p.username).join(', ')
            : conv.participants?.[0]?.username || 'Unknown';
          const status = conv.is_group ? undefined : conv.participants?.[0]?.status;
          const unread = conv.unread_count || 0;

          return (
            <div
              key={conv.id}
              className={`channel-item ${conversationId === conv.id ? 'active' : ''}`}
              onClick={() => navigate(`/channels/@me/${conv.id}`)}
              style={{ padding: '8px' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: 'var(--radius-full)', background: 'var(--brand-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0, position: 'relative',
              }}>
                {displayName[0]?.toUpperCase() || '?'}
                {status && <div className={`member-status-dot ${status}`} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="channel-name" style={{ fontSize: 14 }}>{displayName}</div>
                {conv.last_message && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.last_message.content.substring(0, 30)}
                  </div>
                )}
              </div>
              {unread > 0 && (
                <div className="unread-badge">{unread > 99 ? '99+' : unread}</div>
              )}
            </div>
          );
        })}

        {conversations.length === 0 && (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <p>No conversations yet</p>
          </div>
        )}
      </div>

      {/* User panel */}
      <div className="user-panel" style={{ position: 'relative' }}>
        <div className="user-avatar" style={{ cursor: 'pointer' }} onClick={() => setShowStatus(!showStatus)}>
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : user?.username?.[0]?.toUpperCase() || '?'}
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
    </div>
  );
}
