import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchFriends, fetchPendingRequests, sendFriendRequest } from '../../store/friendSlice';
import { friendApi } from '../../services/api';
import { IconCheck, IconX, IconMessage } from '../common/Icons';

type Tab = 'online' | 'all' | 'pending' | 'add';

export default function FriendsPage() {
  const dispatch = useAppDispatch();
  const { friends, pendingIncoming, pendingOutgoing } = useAppSelector((state) => state.friends);
  const [activeTab, setActiveTab] = useState<Tab>('online');
  const [addUsername, setAddUsername] = useState('');
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');

  useEffect(() => {
    dispatch(fetchFriends());
    dispatch(fetchPendingRequests());
  }, [dispatch]);

  const handleAddFriend = async () => {
    if (!addUsername.trim()) return;
    setAddError('');
    setAddSuccess('');
    const result = await dispatch(sendFriendRequest(addUsername));
    if (sendFriendRequest.fulfilled.match(result)) {
      setAddSuccess(`Friend request sent to ${addUsername}!`);
      setAddUsername('');
      dispatch(fetchPendingRequests());
    } else {
      setAddError(result.payload as string || 'Failed to send request');
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'decline') => {
    try {
      await friendApi.respond(requestId, action);
      dispatch(fetchFriends());
      dispatch(fetchPendingRequests());
    } catch (error) {
      console.error('Failed to respond:', error);
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    try {
      await friendApi.remove(friendId);
      dispatch(fetchFriends());
    } catch (error) {
      console.error('Failed to remove friend:', error);
    }
  };

  const onlineFriends = friends.filter(f => f.friend_status !== 'offline');
  const displayFriends = activeTab === 'online' ? onlineFriends : friends;

  return (
    <div className="friends-page">
      <div className="friends-header">
        <strong style={{ color: 'var(--header-primary)', fontSize: 16 }}>Friends</strong>
        <div style={{ width: 1, height: 24, background: 'var(--bg-quaternary)' }} />
        <button className={`tab ${activeTab === 'online' ? 'active' : ''}`} onClick={() => setActiveTab('online')}>Online</button>
        <button className={`tab ${activeTab === 'all' ? 'active' : ''}`} onClick={() => setActiveTab('all')}>All</button>
        <button className={`tab ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
          Pending
          {pendingIncoming.length > 0 && (
            <span style={{
              marginLeft: 6, background: 'var(--red)', color: '#fff',
              borderRadius: 'var(--radius-full)', width: 18, height: 18, fontSize: 10,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
            }}>
              {pendingIncoming.length}
            </span>
          )}
        </button>
        <button className="tab add-friend" onClick={() => setActiveTab('add')}>Add Friend</button>
      </div>

      {activeTab === 'add' ? (
        <div className="add-friend-section">
          <h2>ADD FRIEND</h2>
          <p>You can add friends with their username.</p>
          {addError && <div className="error-message" style={{ marginBottom: 8 }}>{addError}</div>}
          {addSuccess && <div className="animate-fade-in" style={{ color: 'var(--green)', fontSize: 14, marginBottom: 8 }}>{addSuccess}</div>}
          <div className="add-friend-input">
            <input type="text" placeholder="Enter a username" value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddFriend()} />
            <button onClick={handleAddFriend} disabled={!addUsername.trim()}>Send Friend Request</button>
          </div>
        </div>
      ) : activeTab === 'pending' ? (
        <div className="friends-list">
          {pendingIncoming.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '16px 8px 8px' }}>
                Incoming — {pendingIncoming.length}
              </div>
              {pendingIncoming.map(req => (
                <div key={req.id} className="friend-item">
                  <div className="user-avatar" style={{ width: 40, height: 40, fontSize: 16 }}>
                    {req.avatar_url ? <img src={req.avatar_url} alt="" /> : req.username[0].toUpperCase()}
                  </div>
                  <div className="friend-info">
                    <div className="friend-name">{req.username}</div>
                    <div className="friend-status-text">Incoming Friend Request</div>
                  </div>
                  <div className="friend-actions">
                    <button onClick={() => handleRespond(req.id, 'accept')} title="Accept" style={{ color: 'var(--green)' }}>
                      <IconCheck size={18} />
                    </button>
                    <button onClick={() => handleRespond(req.id, 'decline')} title="Decline" style={{ color: 'var(--red)' }}>
                      <IconX size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
          {pendingOutgoing.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '16px 8px 8px' }}>
                Outgoing — {pendingOutgoing.length}
              </div>
              {pendingOutgoing.map(req => (
                <div key={req.id} className="friend-item">
                  <div className="user-avatar" style={{ width: 40, height: 40, fontSize: 16 }}>
                    {req.avatar_url ? <img src={req.avatar_url} alt="" /> : req.username[0].toUpperCase()}
                  </div>
                  <div className="friend-info">
                    <div className="friend-name">{req.username}</div>
                    <div className="friend-status-text">Outgoing Friend Request</div>
                  </div>
                </div>
              ))}
            </>
          )}
          {pendingIncoming.length === 0 && pendingOutgoing.length === 0 && (
            <div className="empty-state"><p>No pending friend requests.</p></div>
          )}
        </div>
      ) : (
        <div className="friends-list">
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', padding: '8px' }}>
            {activeTab === 'online' ? 'Online' : 'All Friends'} — {displayFriends.length}
          </div>
          {displayFriends.map(friend => (
            <div key={friend.id} className="friend-item">
              <div className="user-avatar" style={{ width: 40, height: 40, fontSize: 16, position: 'relative' }}>
                {friend.friend_avatar ? <img src={friend.friend_avatar} alt="" /> : friend.friend_username[0].toUpperCase()}
                <div className={`member-status-dot ${friend.friend_status}`} />
              </div>
              <div className="friend-info">
                <div className="friend-name">{friend.friend_username}</div>
                <div className="friend-status-text" style={{ textTransform: 'capitalize' }}>{friend.friend_status}</div>
              </div>
              <div className="friend-actions">
                <button title="Message"><IconMessage size={18} /></button>
                <button onClick={() => handleRemoveFriend(friend.friend_id)} title="Remove Friend" style={{ color: 'var(--red)' }}>
                  <IconX size={18} />
                </button>
              </div>
            </div>
          ))}
          {displayFriends.length === 0 && (
            <div className="empty-state">
              <p>{activeTab === 'online' ? 'No friends online right now.' : 'No friends yet. Add some!'}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
