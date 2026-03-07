import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchMessages, sendMessage, clearMessages, setMessagePinned, addOptimisticMessage } from '../../store/messageSlice';
import { toggleMemberList, togglePinnedMessages } from '../../store/uiSlice';
import { getSocket } from '../../services/socket';
import { messageApi } from '../../services/api';
import { Message } from '../../types';
import MessageItem from './MessageItem';
import { IconHash, IconPin, IconUsers, IconPlus, IconSend, IconX } from '../common/Icons';

export default function ChatArea() {
  const { channelId } = useParams();
  const dispatch = useAppDispatch();
  const { messages, loading, hasMore, typingUsers } = useAppSelector((state) => state.messages);
  const { currentChannel } = useAppSelector((state) => state.channels);
  const { showPinnedMessages } = useAppSelector((state) => state.ui);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [pinnedLoading, setPinnedLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);

  const fetchPinned = useCallback(async () => {
    if (!channelId) return;
    setPinnedLoading(true);
    try {
      const res = await messageApi.getPinned(channelId);
      setPinnedMessages(res.data.messages);
    } catch (err) {
      console.error('Failed to fetch pinned messages:', err);
    }
    setPinnedLoading(false);
  }, [channelId]);

  useEffect(() => {
    if (showPinnedMessages && channelId) fetchPinned();
  }, [showPinnedMessages, channelId, fetchPinned]);

  const handleUnpin = async (messageId: string) => {
    try {
      await messageApi.unpin(messageId);
      setPinnedMessages(prev => prev.filter(m => m.id !== messageId));
      dispatch(setMessagePinned({ messageId, pinned: false }));
    } catch (err) {
      console.error('Failed to unpin message:', err);
    }
  };

  useEffect(() => {
    if (channelId) {
      dispatch(clearMessages());
      dispatch(fetchMessages({ channelId }));
      const socket = getSocket();
      if (socket) socket.emit('channel:join', channelId);
      return () => { if (socket) socket.emit('channel:leave', channelId); };
    }
  }, [channelId, dispatch]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-focus message input when channel changes
  useEffect(() => {
    if (channelId) {
      setTimeout(() => messageInputRef.current?.focus(), 100);
    }
  }, [channelId]);

  const handleScroll = () => {
    const container = messagesContainerRef.current;
    if (container && container.scrollTop === 0 && hasMore && !loading && channelId && messages.length > 0) {
      dispatch(fetchMessages({ channelId, before: messages[0].created_at }));
    }
  };

  const handleTyping = () => {
    const socket = getSocket();
    if (!socket || !channelId) return;
    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing:start', { channelId });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop', { channelId });
    }, 2000);
  };

  const { user } = useAppSelector((state) => state.auth);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      setPendingFiles(prev => [...prev, ...files]);
    }
    // Reset input so same file can be re-selected
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
    if ((!messageText.trim() && pendingFiles.length === 0) || !channelId) return;
    const content = messageText;
    const filesToSend = [...pendingFiles];

    // Optimistic: show message instantly (text only for now)
    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (user) {
      dispatch(addOptimisticMessage({
        id: tempId,
        channel_id: channelId,
        sender_id: user.id,
        sender_name: user.username,
        sender_avatar: user.avatar_url,
        content,
        attachments: filesToSend.map(f => f.name),
        edited: false,
        pinned: false,
        reactions: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    setMessageText('');
    setPendingFiles([]);
    setIsTyping(false);

    try {
      let result;
      if (filesToSend.length > 0) {
        setUploading(true);
        result = await messageApi.sendWithFiles(channelId, content, filesToSend);
        setUploading(false);
      } else {
        const action = await dispatch(sendMessage({ channelId, content, tempId }));
        if (sendMessage.fulfilled.match(action)) {
          result = { data: { message: action.payload } };
        }
      }

      if (result?.data?.message) {
        const socket = getSocket();
        if (socket) {
          socket.emit('message:send', { channelId, message: result.data.message });
          socket.emit('typing:stop', { channelId });
        }
        // Replace optimistic message if we used file upload path
        if (filesToSend.length > 0) {
          dispatch(addOptimisticMessage(result.data.message)); // will replace via addMessage logic
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setUploading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.sender_id !== curr.sender_id) return true;
    return new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime() > 5 * 60 * 1000;
  };

  const formatTime = (dateStr: string) => {
    // Append Z if no timezone info, so the browser treats it as UTC before converting to local
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

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="hash"><IconHash size={22} /></span>
          <span className="channel-name">{currentChannel?.name || 'channel'}</span>
          {currentChannel?.topic && (
            <>
              <div className="divider" />
              <span className="topic">{currentChannel.topic}</span>
            </>
          )}
        </div>
        <div className="chat-header-right">
          <button onClick={() => dispatch(togglePinnedMessages())} title="Pinned Messages">
            <IconPin size={20} />
          </button>
          <button onClick={() => dispatch(toggleMemberList())} title="Member List">
            <IconUsers size={20} />
          </button>
        </div>
      </div>

      {showPinnedMessages && (
        <div className="pinned-messages-panel animate-fade-in">
          <div className="pinned-messages-header">
            <IconPin size={16} />
            <span>Pinned Messages</span>
            <button className="pinned-close" onClick={() => dispatch(togglePinnedMessages())}>
              <IconX size={16} />
            </button>
          </div>
          <div className="pinned-messages-list">
            {pinnedLoading && (
              <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                <div className="loading-spinner" style={{ margin: '0 auto' }} />
              </div>
            )}
            {!pinnedLoading && pinnedMessages.length === 0 && (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <IconPin size={40} />
                <p>No pinned messages yet</p>
                <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Pin important messages so they're easy to find later.</p>
              </div>
            )}
            {pinnedMessages.map(msg => (
              <div key={msg.id} className="pinned-message-item">
                <div className="pinned-message-author">
                  <div className="message-avatar" style={{ width: 24, height: 24, fontSize: 11 }}>
                    {msg.sender_avatar ? <img src={msg.sender_avatar} alt="" /> : msg.sender_name?.[0]?.toUpperCase()}
                  </div>
                  <span className="author">{msg.sender_name}</span>
                  <span className="timestamp">{formatTime(msg.created_at)}</span>
                </div>
                <div className="pinned-message-content">{msg.content}</div>
                <button className="pinned-unpin-btn" onClick={() => handleUnpin(msg.id)}>
                  <IconX size={12} /> Unpin
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="messages-container" ref={messagesContainerRef} onScroll={handleScroll}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
            <div className="loading-spinner" style={{ margin: '0 auto' }} />
          </div>
        )}
        <div className="messages-list">
          {messages.map((msg, index) => (
            <MessageItem key={msg.id} message={msg} showHeader={shouldShowHeader(index)} formatTime={formatTime} />
          ))}
        </div>
        <div ref={messagesEndRef} />
      </div>

      {typingUsers.length > 0 && (
        <div className="typing-indicator">
          <strong>{typingUsers.map(u => u.username).join(', ')}</strong>
          {typingUsers.length === 1 ? ' is typing...' : ' are typing...'}
        </div>
      )}

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
            placeholder={`Message #${currentChannel?.name || 'channel'}`}
            value={messageText}
            onChange={(e) => { setMessageText(e.target.value); handleTyping(); }}
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
    </div>
  );
}
