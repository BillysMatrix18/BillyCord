import { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { messageApi } from '../../services/api';
import { removeMessage, updateMessage } from '../../store/messageSlice';
import { getSocket } from '../../services/socket';
import { Message } from '../../types';

interface MessageItemProps {
  message: Message;
  showHeader: boolean;
  formatTime: (date: string) => string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageItem({ message, showHeader, formatTime }: MessageItemProps) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showReactions, setShowReactions] = useState(false);

  const handleDelete = async () => {
    try {
      await messageApi.delete(message.id);
      dispatch(removeMessage(message.id));
      const socket = getSocket();
      if (socket) {
        socket.emit('message:delete', { channelId: message.channel_id, messageId: message.id });
      }
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleEdit = async () => {
    if (!editContent.trim()) return;
    try {
      const response = await messageApi.update(message.id, editContent);
      dispatch(updateMessage(response.data.message));
      setIsEditing(false);
      const socket = getSocket();
      if (socket) {
        socket.emit('message:edit', { channelId: message.channel_id, message: response.data.message });
      }
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleReaction = async (emoji: string) => {
    try {
      await messageApi.addReaction(message.id, emoji);
      const socket = getSocket();
      if (socket) {
        socket.emit('reaction:add', {
          channelId: message.channel_id,
          messageId: message.id,
          emoji,
        });
      }
      setShowReactions(false);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleRemoveReaction = async (emoji: string) => {
    try {
      await messageApi.removeReaction(message.id, emoji);
      const socket = getSocket();
      if (socket) {
        socket.emit('reaction:remove', {
          channelId: message.channel_id,
          messageId: message.id,
          emoji,
        });
      }
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
  };

  const handlePin = async () => {
    try {
      await messageApi.pin(message.id);
    } catch (error) {
      console.error('Failed to pin message:', error);
    }
  };

  // Group reactions by emoji
  const groupedReactions = message.reactions?.reduce((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { emoji: r.emoji, users: [], count: 0 };
    }
    acc[r.emoji].users.push(r.username);
    acc[r.emoji].count++;
    return acc;
  }, {} as Record<string, { emoji: string; users: string[]; count: number }>) || {};

  const isAuthor = user?.id === message.sender_id;

  // Render message content with basic markdown
  const renderContent = (content: string) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 4px;border-radius:3px;font-size:14px">$1</code>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
  };

  return (
    <div className={`message ${showHeader ? 'message-group-start' : ''}`}>
      {showHeader ? (
        <div className="message-avatar">
          {message.sender_avatar ? (
            <img src={message.sender_avatar} alt={message.sender_name} />
          ) : (
            message.sender_name?.[0]?.toUpperCase() || '?'
          )}
        </div>
      ) : (
        <div style={{ width: 40, flexShrink: 0 }} />
      )}

      <div className="message-body">
        {showHeader && (
          <div className="message-header">
            <span className="author">{message.sender_name}</span>
            <span className="timestamp">{formatTime(message.created_at)}</span>
          </div>
        )}

        {isEditing ? (
          <div>
            <textarea
              className="form-input"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(); }
                if (e.key === 'Escape') setIsEditing(false);
              }}
              autoFocus
              style={{ width: '100%', minHeight: 40, resize: 'vertical' }}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
              escape to <span style={{ color: 'var(--text-link)', cursor: 'pointer' }} onClick={() => setIsEditing(false)}>cancel</span>
              {' '}&middot; enter to <span style={{ color: 'var(--text-link)', cursor: 'pointer' }} onClick={handleEdit}>save</span>
            </div>
          </div>
        ) : (
          <div
            className="message-content"
            dangerouslySetInnerHTML={{
              __html: renderContent(message.content) + (message.edited ? ' <span class="edited">(edited)</span>' : ''),
            }}
          />
        )}

        {/* Reactions */}
        {Object.keys(groupedReactions).length > 0 && (
          <div className="message-reactions">
            {Object.values(groupedReactions).map((reaction) => (
              <div
                key={reaction.emoji}
                className="reaction-badge"
                onClick={() => {
                  const hasReacted = message.reactions.some(
                    r => r.emoji === reaction.emoji && r.user_id === user?.id
                  );
                  if (hasReacted) {
                    handleRemoveReaction(reaction.emoji);
                  } else {
                    handleReaction(reaction.emoji);
                  }
                }}
                title={reaction.users.join(', ')}
              >
                <span>{reaction.emoji}</span>
                <span className="count">{reaction.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message action buttons (hover) */}
      <div className="message-actions">
        <button onClick={() => setShowReactions(!showReactions)} title="Add Reaction">
          &#x1F600;
        </button>
        {isAuthor && (
          <button onClick={() => { setIsEditing(true); setEditContent(message.content); }} title="Edit">
            &#x270F;
          </button>
        )}
        <button onClick={handlePin} title="Pin Message">
          &#x1F4CC;
        </button>
        {isAuthor && (
          <button onClick={handleDelete} title="Delete" style={{ color: 'var(--red)' }}>
            &#x1F5D1;
          </button>
        )}
      </div>

      {/* Quick reaction picker */}
      {showReactions && (
        <div style={{
          position: 'absolute', top: -40, right: 60,
          background: 'var(--bg-secondary)', borderRadius: 8, padding: '4px 8px',
          display: 'flex', gap: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          zIndex: 10,
        }}>
          {QUICK_REACTIONS.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleReaction(emoji)}
              style={{ fontSize: 20, padding: '2px 4px', cursor: 'pointer' }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
