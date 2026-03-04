import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchConversations } from '../../store/dmSlice';
import { toggleSettings } from '../../store/uiSlice';
import { logout } from '../../store/authSlice';

export default function DmSidebar() {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const dispatch = useAppDispatch();
  const { conversations } = useAppSelector((state) => state.dm);
  const { user } = useAppSelector((state) => state.auth);

  useEffect(() => {
    dispatch(fetchConversations());
  }, [dispatch]);

  return (
    <div className="channel-sidebar">
      <div className="server-header">
        <span>Direct Messages</span>
      </div>

      <div className="channel-list" style={{ padding: '8px' }}>
        {/* Friends link */}
        <div
          className={`channel-item ${!conversationId ? 'active' : ''}`}
          onClick={() => navigate('/channels/@me')}
          style={{ marginBottom: 8 }}
        >
          <span className="channel-icon">&#x1F465;</span>
          <span className="channel-name">Friends</span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '8px 0 4px', letterSpacing: '0.02em' }}>
          Direct Messages
        </div>

        {conversations.map(conv => {
          const displayName = conv.is_group
            ? conv.name || conv.participants?.map(p => p.username).join(', ')
            : conv.participants?.[0]?.username || 'Unknown';
          const status = conv.is_group ? undefined : conv.participants?.[0]?.status;

          return (
            <div
              key={conv.id}
              className={`channel-item ${conversationId === conv.id ? 'active' : ''}`}
              onClick={() => navigate(`/channels/@me/${conv.id}`)}
              style={{ padding: '8px' }}
            >
              <div style={{
                width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-color)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0,
                position: 'relative',
              }}>
                {displayName[0]?.toUpperCase() || '?'}
                {status && (
                  <div className={`member-status-dot ${status}`} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="channel-name" style={{ fontSize: 15 }}>{displayName}</div>
                {conv.last_message && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {conv.last_message.content.substring(0, 30)}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {conversations.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-muted)', fontSize: 14 }}>
            No conversations yet
          </div>
        )}
      </div>

      {/* User panel */}
      <div className="user-panel">
        <div className="user-avatar">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : user?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div className="user-info">
          <div className="username">{user?.username}</div>
          <div className="status-text" style={{ textTransform: 'capitalize' }}>{user?.status}</div>
        </div>
        <div className="user-panel-buttons">
          <button onClick={() => dispatch(toggleSettings())} title="Settings">&#x2699;</button>
          <button onClick={() => dispatch(logout())} title="Logout">&#x2190;</button>
        </div>
      </div>
    </div>
  );
}
