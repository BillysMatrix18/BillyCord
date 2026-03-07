import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { attachVoiceListeners, detachVoiceListeners } from '../services/voiceService';
import { useAppDispatch, useAppSelector } from './useAppDispatch';
import { addMessage, updateMessage, removeMessage, addTypingUser, removeTypingUser, addReactionToMessage, removeReactionFromMessage, setMessagePinned } from '../store/messageSlice';
import { updateMemberStatus } from '../store/serverSlice';
import { incrementChannelUnread } from '../store/channelSlice';
import { addDmMessage, incrementConversationUnread, clearConversationUnread, fetchConversations } from '../store/dmSlice';
import { dmApi } from '../services/api';
import { notify, requestNotificationPermission } from '../services/notifications';
import { setAnnouncement } from '../store/uiSlice';
import { addIncomingRequest, removeRequest, addFriend } from '../store/friendSlice';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { isAuthenticated, user: currentUser } = useAppSelector((state) => state.auth);
  const currentUserIdRef = useRef(currentUser?.id);
  currentUserIdRef.current = currentUser?.id;
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = connectSocket(token);
    socketRef.current = socket;
    requestNotificationPermission();

    // Attach voice call listeners once socket is ready
    socket.on('connect', () => {
      attachVoiceListeners();
    });
    // Also attach immediately if already connected
    if (socket.connected) {
      attachVoiceListeners();
    }

    socket.on('message:new', (message) => {
      dispatch(addMessage(message));
      // Notify for server channel messages from other users
      if (message.sender_id !== currentUserIdRef.current) {
        notify(message.sender_name || 'New message', message.content || 'Sent an attachment');
        // Increment channel unread if not currently viewing that channel
        const currentPath = window.location.pathname;
        if (message.channel_id && !currentPath.includes(`/${message.channel_id}`)) {
          dispatch(incrementChannelUnread(message.channel_id));
        }
      }
    });

    socket.on('message:updated', (message) => {
      dispatch(updateMessage(message));
    });

    socket.on('message:deleted', ({ messageId }) => {
      dispatch(removeMessage(messageId));
    });

    socket.on('typing:start', ({ userId, username }) => {
      dispatch(addTypingUser({ userId, username }));
    });

    socket.on('typing:stop', ({ userId }) => {
      dispatch(removeTypingUser(userId));
    });

    socket.on('reaction:added', ({ messageId, emoji, userId, username }) => {
      dispatch(addReactionToMessage({ messageId, emoji, userId, username }));
    });

    socket.on('reaction:removed', ({ messageId, emoji, userId }) => {
      dispatch(removeReactionFromMessage({ messageId, emoji, userId }));
    });

    socket.on('user:status', ({ userId, status }) => {
      dispatch(updateMemberStatus({ userId, status }));
    });

    socket.on('message:pinned', ({ messageId, pinned }: { messageId: string; channelId: string; pinned: boolean }) => {
      dispatch(setMessagePinned({ messageId, pinned }));
    });

    socket.on('dm:new', ({ conversationId, message }) => {
      // Skip our own messages (sender is included in participantIds relay)
      const isOwnMessage = message.sender_id === currentUserIdRef.current;
      dispatch(addDmMessage(message));
      // Only increment unread if NOT currently viewing this conversation
      const currentPath = window.location.pathname;
      const isViewingConversation = currentPath.includes(`/@me/${conversationId}`);
      if (!isViewingConversation && !isOwnMessage) {
        dispatch(incrementConversationUnread(conversationId));
        notify(message.sender_name || 'New message', message.content || 'Sent an attachment');
      } else if (isViewingConversation) {
        // If viewing the conversation, immediately clear the server-side unread
        // so when fetchConversations re-fetches, the count stays 0
        dispatch(clearConversationUnread(conversationId));
        dmApi.markRead(conversationId).catch(() => {});
      }
      // Re-fetch conversations to update sidebar order & last_message
      dispatch(fetchConversations());
    });

    // Friend request events
    socket.on('friend:request-received', (data: { id: string; user_id: string; username: string; avatar_url: string | null; created_at: string }) => {
      dispatch(addIncomingRequest(data));
      notify('Friend Request', `${data.username} sent you a friend request`);
    });

    socket.on('friend:request-accepted', (data: { requestId: string; friend_id: string; friend_username: string; friend_avatar: string | null; friend_status: string }) => {
      dispatch(removeRequest(data.requestId));
      dispatch(addFriend({
        id: data.requestId,
        friend_id: data.friend_id,
        friend_username: data.friend_username,
        friend_avatar: data.friend_avatar,
        friend_status: data.friend_status,
        status: 'accepted',
        created_at: new Date().toISOString(),
      }));
      dispatch(fetchConversations());
    });

    socket.on('friend:request-declined', (data: { requestId: string }) => {
      dispatch(removeRequest(data.requestId));
    });

    // Admin announcements
    socket.on('admin:announcement', (data: { message: string; timestamp: string }) => {
      dispatch(setAnnouncement(data));
      // Auto-dismiss after 15 seconds
      setTimeout(() => {
        dispatch(setAnnouncement(null));
      }, 15000);
    });

    return () => {
      detachVoiceListeners();
      disconnectSocket();
    };
  }, [isAuthenticated, dispatch]);

  return getSocket;
}
