import { useEffect, useRef, useState, KeyboardEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchMessages, sendMessage, clearMessages } from '../../store/messageSlice';
import { toggleMemberList, togglePinnedMessages } from '../../store/uiSlice';
import { getSocket } from '../../services/socket';
import MessageItem from './MessageItem';
import { formatDistanceToNow } from 'date-fns';

export default function ChatArea() {
  const { channelId } = useParams();
  const dispatch = useAppDispatch();
  const { messages, loading, hasMore, typingUsers } = useAppSelector((state) => state.messages);
  const { currentChannel } = useAppSelector((state) => state.channels);
  const [messageText, setMessageText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (channelId) {
      dispatch(clearMessages());
      dispatch(fetchMessages({ channelId }));

      // Join channel room for real-time updates
      const socket = getSocket();
      if (socket) {
        socket.emit('channel:join', channelId);
      }

      return () => {
        if (socket) {
          socket.emit('channel:leave', channelId);
        }
      };
    }
  }, [channelId, dispatch]);

  useEffect(() => {
    // Auto-scroll to bottom on new messages
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

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing:stop', { channelId });
    }, 2000);
  };

  const handleSend = () => {
    if (!messageText.trim() || !channelId) return;

    dispatch(sendMessage({ channelId, content: messageText })).then((result) => {
      if (sendMessage.fulfilled.match(result)) {
        // Broadcast to channel
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group consecutive messages by the same user
  const shouldShowHeader = (index: number) => {
    if (index === 0) return true;
    const prev = messages[index - 1];
    const curr = messages[index];
    if (prev.sender_id !== curr.sender_id) return true;
    const timeDiff = new Date(curr.created_at).getTime() - new Date(prev.created_at).getTime();
    return timeDiff > 5 * 60 * 1000; // 5 minutes
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    } else if (diffDays === 1) {
      return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="chat-area">
      <div className="chat-header">
        <div className="chat-header-left">
          <span className="hash">#</span>
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
            &#x1F4CC;
          </button>
          <button onClick={() => dispatch(toggleMemberList())} title="Member List">
            &#x1F465;
          </button>
        </div>
      </div>

      <div
        className="messages-container"
        ref={messagesContainerRef}
        onScroll={handleScroll}
      >
        {loading && (
          <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
            Loading messages...
          </div>
        )}
        <div className="messages-list">
          {messages.map((msg, index) => (
            <MessageItem
              key={msg.id}
              message={msg}
              showHeader={shouldShowHeader(index)}
              formatTime={formatTime}
            />
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
          <button title="Attach file">+</button>
          <textarea
            className="message-input"
            placeholder={`Message #${currentChannel?.name || 'channel'}`}
            value={messageText}
            onChange={(e) => { setMessageText(e.target.value); handleTyping(); }}
            onKeyDown={handleKeyDown}
            rows={1}
          />
          <button onClick={handleSend} title="Send" style={{ opacity: messageText.trim() ? 1 : 0.5 }}>
            &#x27A4;
          </button>
        </div>
      </div>
    </div>
  );
}
