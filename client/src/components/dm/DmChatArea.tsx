import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchDmMessages, clearDmMessages } from '../../store/dmSlice';
import { dmApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { IconPlus, IconSend, IconX, IconSmile, IconEdit, IconPin, IconTrash } from '../common/Icons';
import UserProfileModal from '../common/UserProfileModal';
import ImageModal from '../common/ImageModal';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👎', '🎉'];

export default function DmChatArea() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { messages, conversations } = useAppSelector((state) => state.dm);
  const { user } = useAppSelector((state) => state.auth);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [profileUser, setProfileUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const [imageModalSrc, setImageModalSrc] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [reactingId, setReactingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; msgId: string } | null>(null);
  const [copyToast, setCopyToast] = useState(false);

  const conversation = conversations.find(c => c.id === conversationId);
  const otherParticipant = conversation?.is_group ? null : conversation?.participants?.[0];
  const displayName = conversation?.is_group
    ? conversation.name || conversation.participants?.map(p => p.username).join(', ')
    : otherParticipant?.username || 'Unknown';
  const headerAvatar = conversation?.is_group ? conversation.icon_url : otherParticipant?.avatar_url;

  useEffect(() => {
    if (conversationId) {
      dispatch(clearDmMessages());
      dispatch(fetchDmMessages({ conversationId }));
    }
  }, [conversationId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus message input when conversation changes
  useEffect(() => {
    if (conversationId) {
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [conversationId]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleSend = async () => {
    if ((!messageText.trim() && pendingFiles.length === 0) || !conversationId) return;
    const content = messageText;
    const filesToSend = [...pendingFiles];
    setMessageText('');
    setPendingFiles([]);

    try {
      let response;
      if (filesToSend.length > 0) {
        setUploading(true);
        response = await dmApi.sendWithFiles(conversationId, content, filesToSend);
        setUploading(false);
      } else {
        response = await dmApi.sendMessage(conversationId, content);
      }

      const socket = getSocket();
      if (socket && conversation) {
        const participantIds = conversation.participants?.map(p => p.id) || [];
        socket.emit('dm:send', {
          conversationId,
          message: response.data.message,
          participantIds: [...participantIds, user?.id],
        });
      }
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to send DM:', error);
      setUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleEdit = async (messageId: string) => {
    if (!editContent.trim() || !conversationId) return;
    try {
      await dmApi.editMessage(messageId, editContent);
      setEditingId(null);
      setEditContent('');
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to edit message:', error);
    }
  };

  const handleDelete = async (messageId: string) => {
    if (!conversationId) return;
    try {
      await dmApi.deleteMessage(messageId);
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to delete message:', error);
    }
  };

  const handleReaction = async (messageId: string, emoji: string) => {
    if (!conversationId) return;
    try {
      await dmApi.addReaction(messageId, emoji);
      setReactingId(null);
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  const handleRemoveReaction = async (messageId: string, emoji: string) => {
    if (!conversationId) return;
    try {
      await dmApi.removeReaction(messageId, emoji);
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to remove reaction:', error);
    }
  };

  const handlePin = async (messageId: string, isPinned: boolean) => {
    if (!conversationId) return;
    try {
      if (isPinned) {
        await dmApi.unpinMessage(messageId);
      } else {
        await dmApi.pinMessage(messageId);
      }
      dispatch(fetchDmMessages({ conversationId }));
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  const formatTime = (dateStr: string) => {
    const normalized = dateStr.includes('Z') || dateStr.includes('+') || dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
    const date = new Date(normalized);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.round((startOfToday.getTime() - startOfDate.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    if (diffDays === 1) return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.sender_id !== curr.sender_id) return true;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
  };

  const renderContent = (content: string) => {
    if (!content) return null;
    // Simple markdown: bold, italic, code, strikethrough
    // Server already escapes < and > to prevent HTML injection
    const html = content
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:1px 4px;border-radius:3px;font-size:0.9em">$1</code>')
      .replace(/~~(.+?)~~/g, '<del>$1</del>');
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  };

  const getGroupedReactions = (reactions: unknown): { emoji: string; users: { user_id: string; username: string }[] }[] => {
    let parsed: Array<{ emoji: string; user_id: string; username: string }> = [];
    if (typeof reactions === 'string') {
      try {
        const arr = JSON.parse(reactions);
        if (Array.isArray(arr) && arr.length > 0 && arr[0]?.emoji) parsed = arr;
      } catch { /* ignore */ }
    } else if (Array.isArray(reactions)) {
      parsed = reactions.filter(r => r?.emoji);
    }
    const grouped = new Map<string, { user_id: string; username: string }[]>();
    for (const r of parsed) {
      if (!grouped.has(r.emoji)) grouped.set(r.emoji, []);
      grouped.get(r.emoji)!.push({ user_id: r.user_id, username: r.username });
    }
    return Array.from(grouped.entries()).map(([emoji, users]) => ({ emoji, users }));
  };

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault();
    const menuW = 220, menuH = 300;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 8);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 8);
    setContextMenu({ x, y, msgId });
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setContextMenu(null);
    setCopyToast(true);
    setTimeout(() => setCopyToast(false), 2000);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setContextMenu(null);
  };

  const renderAttachments = (attachments: unknown) => {
    if (!attachments) return null;
    let parsed: Array<{ url?: string; name?: string; type?: string; size?: number } | string> = [];
    if (typeof attachments === 'string') {
      try { parsed = JSON.parse(attachments); } catch { return null; }
    } else if (Array.isArray(attachments)) {
      parsed = attachments;
    }
    if (!parsed || parsed.length === 0) return null;

    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
        {parsed.map((att, i) => {
          if (typeof att === 'string') {
            return <a key={i} href={att} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: 13 }}>{att}</a>;
          }
          const isImage = att.type?.startsWith('image/');
          const isVideo = att.type?.startsWith('video/');
          const isAudio = att.type?.startsWith('audio/');
          if (isImage) {
            return <div key={i} onClick={() => setImageModalSrc(att.url || '')} style={{ cursor: 'pointer' }}><img src={att.url} alt={att.name} style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8 }} /></div>;
          }
          if (isVideo) {
            return <video key={i} src={att.url} controls style={{ maxWidth: 300, borderRadius: 8 }} />;
          }
          if (isAudio) {
            return <audio key={i} src={att.url} controls />;
          }
          return (
            <a key={i} href={att.url} download={att.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-tertiary)', borderRadius: 8, color: 'var(--accent)', fontSize: 13, textDecoration: 'none' }}>
              <span>📄</span> {att.name}
            </a>
          );
        })}
      </div>
    );
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, cursor: otherParticipant ? 'pointer' : undefined, overflow: 'hidden', flexShrink: 0 }}
            onClick={() => otherParticipant && setProfileUser({ id: otherParticipant.id, name: otherParticipant.username, avatar: otherParticipant.avatar_url })}
          >
            {headerAvatar
              ? <img src={headerAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ color: 'var(--text-primary)' }}>{displayName?.[0]?.toUpperCase() || '?'}</span>}
          </div>
          <span
            className="channel-name"
            style={{ cursor: otherParticipant ? 'pointer' : undefined }}
            onClick={() => otherParticipant && setProfileUser({ id: otherParticipant.id, name: otherParticipant.username, avatar: otherParticipant.avatar_url })}
          >
            {displayName}
          </span>
        </div>
        <div className="chat-header-right">
          <button onClick={() => navigate('/channels/@me')} title="Close DM"
            style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <IconX size={20} />
          </button>
        </div>
      </div>

      <div className="messages-container">
        <div className="messages-list">
          {messages.map((msg, index) => {
            const isOwn = msg.sender_id === user?.id;
            const isPinned = msg.pinned === true || msg.pinned === 1;
            const isEdited = msg.edited === true || msg.edited === 1;
            const groupedReactions = getGroupedReactions(msg.reactions);

            return (
              <div key={msg.id} className={`message ${shouldShowHeader(index) ? 'message-group-start' : ''}`}
                onContextMenu={(e) => handleContextMenu(e, msg.id)}
                style={{ position: 'relative', borderLeft: isPinned ? '2px solid var(--accent)' : undefined,
                  paddingLeft: isPinned ? 6 : undefined }}>
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
                <div className="message-body" style={{ flex: 1 }}>
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
                  {editingId === msg.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(msg.id); }
                          if (e.key === 'Escape') { setEditingId(null); setEditContent(''); }
                        }}
                        style={{
                          background: 'var(--bg-tertiary)', color: 'var(--text-primary)',
                          border: '1px solid var(--accent)', borderRadius: 4,
                          padding: '6px 8px', fontSize: 14, resize: 'none', fontFamily: 'inherit',
                        }}
                        rows={2}
                        autoFocus
                      />
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Enter to save &middot; Escape to cancel
                      </div>
                    </div>
                  ) : (
                    <div className="message-content">
                      {renderContent(msg.content)}
                      {isEdited && <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>(edited)</span>}
                    </div>
                  )}
                  {renderAttachments(msg.attachments)}

                  {/* Reactions */}
                  {groupedReactions.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                      {groupedReactions.map(({ emoji, users }) => {
                        const didReact = users.some(u => u.user_id === user?.id);
                        return (
                          <button key={emoji}
                            onClick={() => didReact ? handleRemoveReaction(msg.id, emoji) : handleReaction(msg.id, emoji)}
                            title={users.map(u => u.username).join(', ')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 4,
                              padding: '2px 6px', borderRadius: 4, fontSize: 13, cursor: 'pointer',
                              background: didReact ? 'rgba(88,101,242,0.3)' : 'var(--bg-tertiary)',
                              border: didReact ? '1px solid var(--accent)' : '1px solid transparent',
                              color: 'var(--text-primary)',
                            }}>
                            <span>{emoji}</span>
                            <span style={{ fontSize: 11 }}>{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Message actions toolbar */}
                <div className="message-actions">
                  <button title="Add Reaction" onClick={() => setReactingId(reactingId === msg.id ? null : msg.id)}
                    style={actionBtnStyle}><IconSmile size={16} /></button>
                  {isOwn && <button title="Edit" onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }}
                    style={actionBtnStyle}><IconEdit size={16} /></button>}
                  <button title={isPinned ? 'Unpin' : 'Pin'} onClick={() => handlePin(msg.id, isPinned)}
                    style={{ ...actionBtnStyle, color: isPinned ? 'var(--accent)' : undefined }}><IconPin size={16} /></button>
                  {isOwn && <button title="Delete" onClick={() => handleDelete(msg.id)}
                    style={{ ...actionBtnStyle, color: '#ed4245' }}><IconTrash size={16} /></button>}
                </div>

                {/* Quick reaction picker */}
                {reactingId === msg.id && (
                  <div style={{
                    position: 'absolute', top: -40, right: 8,
                    display: 'flex', gap: 2, background: 'var(--bg-floating)',
                    border: '1px solid var(--border)', borderRadius: 8, padding: '4px 6px',
                    zIndex: 10,
                  }}>
                    {QUICK_REACTIONS.map(emoji => (
                      <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                        style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer',
                          padding: '2px 4px', borderRadius: 4 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {/* File preview bar */}
      {pendingFiles.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 16px', background: 'var(--bg-secondary)',
          borderTop: '1px solid var(--bg-quaternary)', flexWrap: 'wrap', alignItems: 'center',
        }}>
          {pendingFiles.map((file, i) => {
            const isImage = file.type.startsWith('image/');
            return (
              <div key={i} style={{
                position: 'relative', background: 'var(--bg-tertiary)', borderRadius: 8,
                padding: isImage ? 0 : '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
                maxWidth: 200, overflow: 'hidden',
              }}>
                {isImage ? (
                  <img src={URL.createObjectURL(file)} alt={file.name}
                    style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
                ) : (
                  <>
                    <span style={{ fontSize: 20 }}>📄</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatFileSize(file.size)}</div>
                    </div>
                  </>
                )}
                <button onClick={() => removePendingFile(i)} style={{
                  position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)',
                  border: 'none', borderRadius: '50%', width: 20, height: 20, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                }}>
                  <IconX size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="message-input-container">
        <div className="message-input-wrapper">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
          />
          <button title="Attach file" onClick={() => fileInputRef.current?.click()}>
            <IconPlus size={20} />
          </button>
          <textarea
            ref={messageInputRef}
            className="message-input"
            placeholder={`Message @${displayName}`}
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button onClick={handleSend} title="Send"
            disabled={uploading}
            style={{ opacity: (messageText.trim() || pendingFiles.length > 0) ? 1 : 0.3 }}>
            {uploading ? <div className="loading-spinner" style={{ width: 20, height: 20 }} /> : <IconSend size={20} />}
          </button>
        </div>
      </div>

      {/* Right-click context menu */}
      {contextMenu && (() => {
        const msg = messages.find(m => m.id === contextMenu.msgId);
        if (!msg) return null;
        const isOwn = msg.sender_id === user?.id;
        const isPinned = msg.pinned === true || msg.pinned === 1;
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div className="context-menu animate-fade-in"
              style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000 }}>
              <div className="context-menu-item" onClick={() => {
                setReactingId(reactingId === msg.id ? null : msg.id);
                setContextMenu(null);
              }}>
                <span className="context-menu-icon">😀</span> Add Reaction
              </div>
              {isOwn && (
                <div className="context-menu-item" onClick={() => {
                  setEditingId(msg.id); setEditContent(msg.content);
                  setContextMenu(null);
                }}>
                  <span className="context-menu-icon">✏️</span> Edit Message
                </div>
              )}
              <div className="context-menu-item" onClick={() => {
                handlePin(msg.id, isPinned);
                setContextMenu(null);
              }}>
                <span className="context-menu-icon">📌</span> {isPinned ? 'Unpin Message' : 'Pin Message'}
              </div>
              <div className="context-menu-item" onClick={() => handleCopyText(msg.content)}>
                <span className="context-menu-icon">📋</span> Copy Text
              </div>
              <div className="context-menu-item" onClick={() => handleCopyId(msg.id)}>
                <span className="context-menu-icon">#</span> Copy Message ID
              </div>
              {isOwn && (
                <>
                  <div className="context-menu-separator" />
                  <div className="context-menu-item context-menu-danger" onClick={() => {
                    handleDelete(msg.id);
                    setContextMenu(null);
                  }}>
                    <span className="context-menu-icon">🗑️</span> Delete Message
                  </div>
                </>
              )}
            </div>
          </>
        );
      })()}

      {/* Copy toast */}
      {copyToast && (
        <div className="copy-toast animate-fade-in">Copied to clipboard</div>
      )}

      {profileUser && (
        <UserProfileModal
          userId={profileUser.id}
          username={profileUser.name}
          avatarUrl={profileUser.avatar}
          onClose={() => setProfileUser(null)}
        />
      )}

      {imageModalSrc && (
        <ImageModal src={imageModalSrc} onClose={() => setImageModalSrc(null)} />
      )}
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: 'var(--text-muted)',
  cursor: 'pointer', padding: 4, borderRadius: 4, display: 'flex',
  alignItems: 'center',
};
