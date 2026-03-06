import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchDmMessages, clearDmMessages } from '../../store/dmSlice';
import { dmApi } from '../../services/api';
import { getSocket } from '../../services/socket';
import { IconPlus, IconSend, IconX } from '../common/Icons';
import UserProfileModal from '../common/UserProfileModal';

export default function DmChatArea() {
  const { conversationId } = useParams();
  const dispatch = useAppDispatch();
  const { messages, conversations } = useAppSelector((state) => state.dm);
  const { user } = useAppSelector((state) => state.auth);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [profileUser, setProfileUser] = useState<{ id: string; name: string; avatar: string | null } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
            return <a key={i} href={att.url} target="_blank" rel="noreferrer"><img src={att.url} alt={att.name} style={{ maxWidth: 300, maxHeight: 200, borderRadius: 8 }} /></a>;
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
                {renderAttachments(msg.attachments)}
              </div>
            </div>
          ))}
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
