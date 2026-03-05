import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchDmMessages, clearDmMessages } from '../../store/dmSlice';
import { dmApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { IconPlus, IconSend } from '../common/Icons';
import UserProfileModal from '../common/UserProfileModal';

export default function DmChatArea() {
  const { conversationId } = useParams();
  const dispatch = useAppDispatch();
  const { messages, conversations } = useAppSelector((state) => state.dm);
  const { user } = useAppSelector((state) => state.auth);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [profileUser, setProfileUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null);

  const conversation = conversations.find(c => c.id === conversationId);
  const displayName = conversation?.is_group
    ? conversation.name || conversation.participants?.map(p => p.username).join(', ')
    : conversation?.participants?.[0]?.username || 'Unknown';

  useEffect(() => {
    if (conversationId) {
      dispatch(clearDmMessages());
      dispatch(fetchDmMessages({ conversationId }));
    }
  }, [conversationId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!messageText.trim() || !conversationId) return;
    try {
      const response = await dmApi.sendMessage(conversationId, messageText);
      const socket = getSocket();
      if (socket && conversation) {
        const participantIds = conversation.participants?.map(p => p.id) || [];
        socket.emit('dm:send', {
          conversationId,
          message: response.data.message,
          participantIds: [...participantIds, user?.id],
        });
      }
      setMessageText('');
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to send DM:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return date.toLocaleDateString();
  };

  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.sender_id !== curr.sender_id) return true;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left">
          <span style={{ fontSize: 20, color: 'var(--channel-icon)' }}>@</span>
          <span className="channel-name">{displayName}</span>
        </div>
      </div>

      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, index) => (
            <div key={msg.id} className={`message ${shouldShowHeader(index) ? 'message-group-start' : ''}`}>
              {shouldShowHeader(index) ? (
                <div
                  className="message-avatar clickable"
                  onClick={() => setProfileUser({ id: msg.sender_id, name: msg.sender_name, avatar: msg.sender_avatar })}
                >
                  {msg.sender_avatar ? <img src={msg.sender_avatar} alt="" /> : msg.sender_name?.[0]?.toUpperCase() || '?'}
                </div>
              ) : (
                <div style={{ width: 40, flexShrink: 0 }} />
              )}
              <div className="message-body">
                {shouldShowHeader(index) && (
                  <div className="message-header">
                    <span
                      className="author clickable"
                      onClick={() => setProfileUser({ id: msg.sender_id, name: msg.sender_name, avatar: msg.sender_avatar })}
                    >
                      {msg.sender_name}
                    </span>
                    <span className="timestamp">{formatTime(msg.created_at)}</span>
                  </div>
                )}
                <div className="message-content">{msg.content}</div>
              </div>
            </div>
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      <div className="message-input-container">
        <div className="message-input-wrapper">
          <button title="Attach file"><IconPlus size={20} /></button>
          <textarea
            className="message-input"
            placeholder={`Message @${displayName}`}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button onClick={handleSend} title="Send" style={{ opacity: messageText.trim() ? 1 : 0.3 }}>
            <IconSend size={20} />
          </button>
        </div>
      </div>

      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          username={profileUser.name}
          avatarUrl={profileUser.avatar}
          onClose={() => setProfileUser(null)}
        />
      )}
    </div>
  );
}
