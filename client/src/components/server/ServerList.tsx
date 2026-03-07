import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleCreateServer, toggleJoinServer, toggleSettings } from '../../store/uiSlice';
import { clearServerUnread } from '../../store/serverSlice';
import { serverApi, resolveUploadUrl } from '../../services/api';
import { IconHome, IconPlus, IconCompass, IconSettings } from '../common/Icons';

export default function ServerList() {
  const navigate = useNavigate();
  const location = useLocation();
  const { servers } = useAppSelector((state) => state.servers);
  const { conversations } = useAppSelector((state) => state.dm);
  const dispatch = useAppDispatch();

  // Extract serverId from URL path: /channels/:serverId/...
  const pathParts = location.pathname.split('/');
  const channelsIdx = pathParts.indexOf('channels');
  const serverId = channelsIdx !== -1 && pathParts[channelsIdx + 1] && pathParts[channelsIdx + 1] !== '@me'
    ? pathParts[channelsIdx + 1]
    : undefined;

  // Calculate total unread DMs for the home button badge
  const totalDmUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  // Mark server as read when selected
  useEffect(() => {
    if (serverId) {
      dispatch(clearServerUnread(serverId));
      serverApi.markRead(serverId).catch(() => {});
    }
  }, [serverId, dispatch]);

  return (
    <div className="server-list">
      {/* Home / DM button */}
      <div
        className={`server-icon ${!serverId ? 'active' : ''}`}
        onClick={() => navigate('/channels/@me')}
        title="Direct Messages"
        style={{ position: 'relative' }}
      >
        <IconHome size={24} />
        {totalDmUnread > 0 && (
          <div className="unread-badge server-unread-badge">{totalDmUnread > 99 ? '99+' : totalDmUnread}</div>
        )}
      </div>

      <div className="server-separator" />

      {servers.map((server) => {
        const unread = server.unread_count || 0;
        return (
          <div
            key={server.id}
            className={`server-icon ${serverId === server.id ? 'active' : ''}`}
            onClick={() => navigate(`/channels/${server.id}`)}
            title={server.name}
            style={{ position: 'relative' }}
          >
            {server.icon_url ? (
              <img src={resolveUploadUrl(server.icon_url) || ''} alt={server.name} />
            ) : (
              server.name.substring(0, 2).toUpperCase()
            )}
            {unread > 0 && (
              <div className="unread-badge server-unread-badge">{unread > 99 ? '99+' : unread}</div>
            )}
          </div>
        );
      })}

      <div className="server-separator" />

      <div
        className="server-icon add-server"
        onClick={() => dispatch(toggleCreateServer())}
        title="Create a Server"
      >
        <IconPlus size={22} />
      </div>

      <div
        className="server-icon join-server"
        onClick={() => dispatch(toggleJoinServer())}
        title="Join a Server"
      >
        <IconCompass size={22} />
      </div>

      {/* Bottom navigation */}
      <div className="server-list-nav">
        <div className="server-separator" />
        <div className="nav-icon" onClick={() => dispatch(toggleSettings())} title="User Settings">
          <IconSettings size={20} />
        </div>
      </div>
    </div>
  );
}
