import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleCreateServer, toggleJoinServer, toggleSettings } from '../../store/uiSlice';
import { IconHome, IconPlus, IconCompass, IconSettings } from '../common/Icons';

export default function ServerList() {
  const navigate = useNavigate();
  const { serverId } = useParams();
  const { servers } = useAppSelector((state) => state.servers);
  const dispatch = useAppDispatch();

  return (
    <div className="server-list">
      {/* Home / DM button */}
      <div
        className={`server-icon ${!serverId ? 'active' : ''}`}
        onClick={() => navigate('/channels/@me')}
        title="Direct Messages"
      >
        <IconHome size={24} />
      </div>

      <div className="server-separator" />

      {servers.map((server) => (
        <div
          key={server.id}
          className={`server-icon ${serverId === server.id ? 'active' : ''}`}
          onClick={() => navigate(`/channels/${server.id}`)}
          title={server.name}
        >
          {server.icon_url ? (
            <img src={server.icon_url} alt={server.name} />
          ) : (
            server.name.substring(0, 2).toUpperCase()
          )}
        </div>
      ))}

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
