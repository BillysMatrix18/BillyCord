import { useState } from 'react';
import { useAppSelector } from '../../hooks/useAppDispatch';
import { ServerMember } from '../../types';
import UserProfileModal from '../common/UserProfileModal';

export default function MemberList() {
  const { members } = useAppSelector((state) => state.servers);
  const [selectedMember, setSelectedMember] = useState<ServerMember | null>(null);

  const onlineMembers = members.filter(m => m.status !== 'offline');
  const offlineMembers = members.filter(m => m.status === 'offline');

  const renderMember = (member: ServerMember, isOffline = false) => (
    <div
      key={member.id}
      className="member-item clickable"
      style={isOffline ? { opacity: 0.5 } : undefined}
      onClick={() => setSelectedMember(member)}
    >
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
  );

  return (
    <div className="member-list">
      {onlineMembers.length > 0 && (
        <>
          <div className="member-list-header">Online — {onlineMembers.length}</div>
          {onlineMembers.map((member) => renderMember(member))}
        </>
      )}

      {offlineMembers.length > 0 && (
        <>
          <div className="member-list-header">Offline — {offlineMembers.length}</div>
          {offlineMembers.map((member) => renderMember(member, true))}
        </>
      )}

      {selectedMember && (
        <UserProfileModal
          userId={selectedMember.id}
          username={selectedMember.username}
          avatarUrl={selectedMember.avatar_url}
          status={selectedMember.status}
          bio={null}
          onClose={() => setSelectedMember(null)}
        />
      )}
    </div>
  );
}
