import { useEffect, useRef, useState, useCallback, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchMessages, sendMessage, clearMessages } from '../../store/messageSlice';
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

  const handleSend = () => {
    if (!messageText.trim() || !channelId) return;
    dispatch(sendMessage({ channelId, content: messageText })).then((result) => {
      if (sendMessage.fulfilled.match(result)) {
        const socket = getSocket();
        if (socket) {
          socket.emit('message:send', { channelId, message: result.payload });
          socket.emit('typing:stop', { channelId });
        }
      }
    });
    setMessageText('');
    setIsTyping(false);
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
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
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

      <div className="message-input-container">
        <div className="message-input-wrapper">
          <button title="Attach file"><IconPlus size={20} /></button>
          <textarea
            className="message-input"
            placeholder={`Message #${currentChannel?.name || 'channel'}`}
            value={messageText}
            onChange={(e) => { setMessageText(e.target.value); handleTyping(); }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button onClick={handleSend} title="Send" style={{ opacity: messageText.trim() ? 1 : 0.3 }}>
            <IconSend size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
