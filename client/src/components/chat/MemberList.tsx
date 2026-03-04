import { useAppSelector } from '../../hooks/useAppDispatch';

export default function MemberList() {
  const { members } = useAppSelector((state) => state.servers);

  const onlineMembers = members.filter(m => m.status !== 'offline');
  const offlineMembers = members.filter(m => m.status === 'offline');

  return (
    <div className="member-list">
      {onlineMembers.length > 0 && (
        <>
          <div className="member-list-header">Online — {onlineMembers.length}</div>
          {onlineMembers.map((member) => (
            <div key={member.id} className="member-item">
              <div className="member-avatar" style={{ position: 'relative' }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.username} />
                ) : (
                  member.username[0].toUpperCase()
                )}
                <div className={`member-status-dot ${member.status}`} />
              </div>
              <span className="member-name">{member.nickname || member.username}</span>
            </div>
          ))}
        </>
      )}

      {offlineMembers.length > 0 && (
        <>
          <div className="member-list-header">Offline — {offlineMembers.length}</div>
          {offlineMembers.map((member) => (
            <div key={member.id} className="member-item" style={{ opacity: 0.5 }}>
              <div className="member-avatar" style={{ position: 'relative' }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt={member.username} />
                ) : (
                  member.username[0].toUpperCase()
                )}
                <div className="member-status-dot offline" />
              </div>
              <span className="member-name">{member.nickname || member.username}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
