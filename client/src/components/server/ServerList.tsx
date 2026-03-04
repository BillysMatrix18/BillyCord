import { useNavigate, useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { toggleCreateServer, toggleJoinServer } from '../../store/uiSlice';

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
        DC
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
        title="Add a Server"
      >
        +
      </div>

      <div
        className="server-icon"
        onClick={() => dispatch(toggleJoinServer())}
        title="Join a Server"
        style={{ color: 'var(--green)', fontSize: 20 }}
      >
        &#x2192;
      </div>
    </div>
  );
}
