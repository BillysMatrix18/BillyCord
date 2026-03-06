import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks/useAppDispatch';
import { friendApi, dmApi } from '../../services/api';
import { IconX, IconMessage, IconUser, IconShield } from './Icons';

interface UserProfileModalProps {
  userId: string;
  username: string;
  avatarUrl: string | null;
  bio?: string | null;
  status?: string;
  profileColor?: string;
  onClose: () => void;
}

type FriendshipStatus = 'none' | 'friends' | 'pending_sent' | 'pending_received' | 'blocked' | 'self';

export default function UserProfileModal({ userId, username, avatarUrl, bio, status, profileColor, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector((state) => state.auth);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');

  const isSelf = currentUser?.id === userId;

  useEffect(() => {
    if (!isSelf) {
      friendApi.getStatus(userId).then(res => {
        setFriendshipStatus(res.data.status);
      }).catch(() => {});
    }
  }, [userId, isSelf]);

  const handleAddFriend = async () => {
    setLoading(true);
    try {
      await friendApi.sendRequest(username);
      setActionStatus('Friend request sent!');
      setFriendshipStatus('pending_sent');
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setActionStatus(error.response?.data?.error || 'Failed to send request');
    }
    setLoading(false);
  };

  const handleMessage = async () => {
    setLoading(true);
    try {
      const response = await dmApi.createConversation([userId]);
      const convId = response.data.conversation.id;
      navigate(`/channels/@me/${convId}`);
      onClose();
    } catch {
      setActionStatus('Failed to open DM');
    }
    setLoading(false);
  };

  const handleBlock = async () => {
    setLoading(true);
    try {
      await friendApi.block(userId);
      setActionStatus('User blocked');
      setFriendshipStatus('blocked');
    } catch {
      setActionStatus('Failed to block user');
    }
    setLoading(false);
  };

  const statusColor = status === 'online' ? 'var(--green)' : status === 'idle' ? 'var(--yellow)' : status === 'dnd' ? 'var(--red)' : 'var(--text-muted)';

  const renderFriendButton = () => {
    switch (friendshipStatus) {
      case 'friends':
        return (
          <button className="btn btn-secondary" disabled style={{ opacity: 0.7 }}>
            <IconUser size={16} /> Friends
          </button>
        );
      case 'pending_sent':
        return (
          <button className="btn btn-secondary" disabled style={{ opacity: 0.7 }}>
            <IconUser size={16} /> Request Pending
          </button>
        );
      case 'pending_received':
        return (
          <button className="btn btn-primary" onClick={handleAddFriend} disabled={loading}>
            <IconUser size={16} /> Accept Request
          </button>
        );
      case 'blocked':
        return (
          <button className="btn btn-secondary" disabled style={{ opacity: 0.5 }}>
            <IconShield size={16} /> Blocked
          </button>
        );
      default:
        return (
          <button className="btn btn-secondary" onClick={handleAddFriend} disabled={loading}>
            <IconUser size={16} /> Add Friend
          </button>
        );
    }
  };

  return (
    <>
      <div className="profile-modal-overlay" onClick={onClose} />
      <div className="profile-modal animate-fade-in">
        <div className="profile-modal-banner" style={{ background: profileColor || 'var(--brand-color)' }} />
        <button className="profile-modal-close" onClick={onClose}><IconX size={18} /></button>

        <div className="profile-modal-avatar">
          {avatarUrl ? (
            <img src={avatarUrl} alt={username} />
          ) : (
            <div className="profile-modal-avatar-fallback">
              {username[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="profile-modal-status-dot" style={{ background: statusColor }} />
        </div>

        <div className="profile-modal-body">
          <h2 className="profile-modal-username">{username}</h2>
          <span className="profile-modal-status" style={{ textTransform: 'capitalize' }}>{status || 'offline'}</span>

          {bio && (
            <div className="profile-modal-section">
              <h3>About Me</h3>
              <p>{bio}</p>
            </div>
          )}

          {actionStatus && (
            <div className="profile-modal-action-status">{actionStatus}</div>
          )}

          {!isSelf && (
            <div className="profile-modal-actions">
              <button className="btn btn-primary" onClick={handleMessage} disabled={loading}>
                <IconMessage size={16} /> Message
              </button>
              {renderFriendButton()}
              {friendshipStatus !== 'blocked' && (
                <button className="btn btn-danger" onClick={handleBlock} disabled={loading}>
                  <IconShield size={16} /> Block
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
