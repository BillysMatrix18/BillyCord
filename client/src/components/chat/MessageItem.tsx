import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { messageApi } from '../../services/api';
import { removeMessage, updateMessage, setMessagePinned } from '../../store/messageSlice';
import { getSocket } from '../../services/socket';
import { Message } from '../../types';
import { IconSmile, IconEdit, IconPin, IconTrash } from '../common/Icons';
import UserProfileModal from '../common/UserProfileModal';
import ImageModal from '../common/ImageModal';

interface MessageItemProps {
  message: Message;
  showHeader: boolean;
  formatTime: (date: string) => string;
  onReply?: (message: Message) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function MessageItem({ message, showHeader, formatTime, onReply }: MessageItemProps) {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [showReactions, setShowReactions] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [copyToast, setCopyToast] = useState(false);
  const [imageModalSrc, setImageModalSrc] = useState<string | null>(null);

  const handleDelete = async () => {
    try {
      await messageApi.delete(message.id);
      dispatch(removeMessage(message.id));
      const socket = getSocket();
      if (socket) socket.emit('message:delete', { channelId: message.channel_id, messageId: message.id });
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
      if (socket) socket.emit('message:edit', { channelId: message.channel_id, message: response.data.message });
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleReaction = async (emoji: string) => {
    try {
      await messageApi.addReaction(message.id, emoji);
      const socket = getSocket();
      if (socket) socket.emit('reaction:add', { channelId: message.channel_id, messageId: message.id, emoji });
      setShowReactions(false);
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleRemoveReaction = async (emoji: string) => {
    try {
      await messageApi.removeReaction(message.id, emoji);
      const socket = getSocket();
      if (socket) socket.emit('reaction:remove', { channelId: message.channel_id, messageId: message.id, emoji });
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
  };

  const handlePin = async () => {
    try {
      if (message.pinned) {
        await messageApi.unpin(message.id);
      } else {
        await messageApi.pin(message.id);
      }
      dispatch(setMessagePinned({ messageId: message.id, pinned: !message.pinned }));
    } catch (error) {
      console.error('Failed to pin/unpin message:', error);
    }
  };

  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setContextMenu(null);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  }, [message.content]);

  const handleCopyId = useCallback(() => {
    navigator.clipboard.writeText(message.id);
    setContextMenu(null);
  }, [message.id]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const menuW = 220, menuH = 300;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setContextMenu({ x, y });
  }, []);

  const handleReply = useCallback(() => {
    if (onReply) onReply(message);
    setContextMenu(null);
  }, [message, onReply]);

  const groupedReactions = message.reactions?.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = { emoji: r.emoji, users: [], count: 0 };
    acc[r.emoji].users.push(r.username);
    acc[r.emoji].count++;
    return acc;
  }, {} as Record<string, { emoji: string; users: string[]; count: number }>) || {};

  const isAuthor = user?.id === message.sender_id;

  const renderContent = (content: string) => {
    return content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 4px;border-radius:3px;font-size:14px">$1</code>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
  };

  return (
    <div className={`message ${showHeader ? 'message-group-start' : ''}`} onContextMenu={handleContextMenu}>
      {showHeader ? (
        <div className="message-avatar clickable" onClick={() => setShowProfile(true)}>
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
            <span className="author clickable" onClick={() => setShowProfile(true)}>{message.sender_name}</span>
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

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {(message.attachments as unknown[]).map((att, i) => {
              const a = typeof att === 'string' ? { url: att, name: att, type: '', size: 0 } : att as { url: string; name: string; type: string; size: number };
              const isImage = a.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.url || a.name);
              const isVideo = a.type?.startsWith('video/') || /\.(mp4|webm)$/i.test(a.url || a.name);
              const isAudio = a.type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a)$/i.test(a.url || a.name);
              const url = a.url || a.name;

              if (isImage) return (
                <div key={i} onClick={() => setImageModalSrc(url)} style={{ display: 'block', maxWidth: 400, borderRadius: 8, overflow: 'hidden', cursor: 'pointer' }}>
                  <img src={url} alt={a.name} style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8, display: 'block' }}
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
              );
              if (isVideo) return (
                <video key={i} controls style={{ maxWidth: 400, maxHeight: 300, borderRadius: 8 }}><source src={url} /></video>
              );
              if (isAudio) return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                  <span style={{ fontSize: 20 }}>🎵</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{a.name}</div>
                    <audio controls style={{ width: '100%', height: 32, marginTop: 4 }}><source src={url} /></audio>
                  </div>
                </div>
              );
              return (
                <a key={i} href={url} target="_blank" rel="noopener noreferrer" download
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, textDecoration: 'none', color: 'var(--text-link)', fontSize: 13 }}>
                  <span style={{ fontSize: 20 }}>📄</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    {a.size > 0 && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{a.size < 1024 ? `${a.size} B` : a.size < 1048576 ? `${(a.size / 1024).toFixed(1)} KB` : `${(a.size / 1048576).toFixed(1)} MB`}</div>}
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {Object.keys(groupedReactions).length > 0 && (
          <div className="message-reactions">
            {Object.values(groupedReactions).map((reaction) => (
              <div
                key={reaction.emoji}
                className="reaction-badge"
                onClick={() => {
                  const hasReacted = message.reactions.some(r => r.emoji === reaction.emoji && r.user_id === user?.id);
                  hasReacted ? handleRemoveReaction(reaction.emoji) : handleReaction(reaction.emoji);
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

      {/* Message action buttons */}
      <div className="message-actions">
        <button onClick={() => setShowReactions(!showReactions)} title="Add Reaction">
          <IconSmile size={16} />
        </button>
        {isAuthor && (
          <button onClick={() => { setIsEditing(true); setEditContent(message.content); }} title="Edit">
            <IconEdit size={16} />
          </button>
        )}
        <button onClick={handlePin} title={message.pinned ? 'Unpin Message' : 'Pin Message'}
          style={message.pinned ? { color: 'var(--brand-color)' } : {}}>
          <IconPin size={16} />
        </button>
        {isAuthor && (
          <button onClick={handleDelete} title="Delete" style={{ color: 'var(--red)' }}>
            <IconTrash size={16} />
          </button>
        )}
      </div>

      {/* Quick reaction picker */}
      {showReactions && (
        <div style={{
          position: 'absolute', top: -40, right: 60,
          background: 'var(--bg-floating)', borderRadius: 'var(--radius-md)', padding: '4px 8px',
          display: 'flex', gap: 4, boxShadow: 'var(--shadow-lg)', zIndex: 10,
        }}>
          {QUICK_REACTIONS.map(emoji => (
            <button key={emoji} onClick={() => handleReaction(emoji)}
              style={{ fontSize: 20, padding: '4px 6px', cursor: 'pointer', borderRadius: 'var(--radius-sm)' }}>
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
          <div className="context-menu animate-fade-in" style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}>
            <div className="context-menu-item" onClick={() => { setShowReactions(true); setContextMenu(null); }}>
              <span className="context-menu-icon">😀</span> Add Reaction
            </div>
            {onReply && (
              <div className="context-menu-item" onClick={handleReply}>
                <span className="context-menu-icon">↩</span> Reply
              </div>
            )}
            {isAuthor && (
              <div className="context-menu-item" onClick={() => { setIsEditing(true); setEditContent(message.content); setContextMenu(null); }}>
                <span className="context-menu-icon">✏️</span> Edit Message
              </div>
            )}
            {isAuthor && (
              <div className="context-menu-item" onClick={() => { handlePin(); setContextMenu(null); }}>
                <span className="context-menu-icon">📌</span> {message.pinned ? 'Unpin Message' : 'Pin Message'}
              </div>
            )}
            <div className="context-menu-item" onClick={handleCopyText}>
              <span className="context-menu-icon">📋</span> Copy Text
            </div>
            <div className="context-menu-item" onClick={handleCopyId}>
              <span className="context-menu-icon">#</span> Copy Message ID
            </div>
            {isAuthor && (
              <>
                <div className="context-menu-separator" />
                <div className="context-menu-item context-menu-danger" onClick={() => { handleDelete(); setContextMenu(null); }}>
                  <span className="context-menu-icon">🗑️</span> Delete Message
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Copy toast */}
      {copyToast && (
        <div className="copy-toast animate-fade-in">Copied to clipboard</div>
      )}

      {/* User profile modal */}
      {showProfile && (
        <UserProfileModal
          userId={message.sender_id}
          username={message.sender_name}
          avatarUrl={message.sender_avatar}
          status={undefined}
          onClose={() => setShowProfile(false)}
        />
      )}

      {/* Image viewer modal */}
      {imageModalSrc && (
        <ImageModal src={imageModalSrc} onClose={() => setImageModalSrc(null)} />
      )}
    </div>
  );
}
