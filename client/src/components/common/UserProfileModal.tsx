import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../../hooks/useAppDispatch';
import { friendApi, dmApi, authApi } from '../../services/api';
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

interface FullProfile {
  bio: string | null;
  pronouns: string | null;
  profile_color: string | null;
  banner_url: string | null;
  status: string;
  custom_status: string | null;
  avatar_url: string | null;
  created_at: string;
}

export default function UserProfileModal({ userId, username, avatarUrl, bio, status, profileColor, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useAppSelector((state) => state.auth);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState<FriendshipStatus>('none');
  const [profile, setProfile] = useState<FullProfile | null>(null);

  const isSelf = currentUser?.id === userId;

  // Fetch full user profile for bio, pronouns, color
  useEffect(() => {
    authApi.getUserProfile(userId).then(res => {
      setProfile(res.data.user);
    }).catch(() => {});
  }, [userId]);

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

  // Use profile data if available, fallback to props
  const displayBio = profile?.bio || bio;
  const displayColor = profile?.profile_color || profileColor || 'var(--brand-color)';
  const displayStatus = profile?.status || status || 'offline';
  const displayPronouns = profile?.pronouns;
  const displayCustomStatus = profile?.custom_status;
  const displayAvatar = profile?.avatar_url || avatarUrl;
  const displayBanner = profile?.banner_url;
  const createdAt = profile?.created_at;

  const statusColor = displayStatus === 'online' ? 'var(--green)' : displayStatus === 'idle' ? 'var(--yellow)' : displayStatus === 'dnd' ? 'var(--red)' : 'var(--text-muted)';

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

  const formatJoinDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <>
      <div className="profile-modal-overlay" onClick={onClose} />
      <div className="profile-modal animate-fade-in">
        <div className="profile-modal-banner" style={{
          background: displayBanner ? `url(${displayBanner}) center/cover` : displayColor,
        }} />
        <button className="profile-modal-close" onClick={onClose}><IconX size={18} /></button>

        <div className="profile-modal-avatar">
          {displayAvatar ? (
            <img src={displayAvatar} alt={username} />
          ) : (
            <div className="profile-modal-avatar-fallback">
              {username[0]?.toUpperCase() || '?'}
            </div>
          )}
          <div className="profile-modal-status-dot" style={{ background: statusColor }} />
        </div>

        <div className="profile-modal-body">
          <h2 className="profile-modal-username">{username}</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="profile-modal-status" style={{ textTransform: 'capitalize' }}>{displayStatus}</span>
            {displayPronouns && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{displayPronouns}</span>
            )}
          </div>
          {displayCustomStatus && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{displayCustomStatus}</div>
          )}

          {displayBio && (
            <div className="profile-modal-section">
              <h3>About Me</h3>
              <p>{displayBio}</p>
            </div>
          )}

          {createdAt && (
            <div className="profile-modal-section">
              <h3>Member Since</h3>
              <p style={{ fontSize: 13 }}>{formatJoinDate(createdAt)}</p>
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
