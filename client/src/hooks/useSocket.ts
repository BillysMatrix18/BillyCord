import { useEffect, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket, getSocket } from '../services/socket';
import { useAppDispatch, useAppSelector } from './useAppDispatch';
import { addMessage, updateMessage, removeMessage, addTypingUser, removeTypingUser, addReactionToMessage, removeReactionFromMessage } from '../store/messageSlice';
import { updateMemberStatus } from '../store/serverSlice';
import { addDmMessage } from '../store/dmSlice';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!isAuthenticated) return;

    const token = localStorage.getItem('accessToken');
    if (!token) return;

    const socket = connectSocket(token);
    socketRef.current = socket;

    // Listen for events
    socket.on('message:new', (message) => {
      dispatch(addMessage(message));
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

    socket.on('dm:new', ({ message }) => {
      dispatch(addDmMessage(message));
    });

    return () => {
      disconnectSocket();
    };
  }, [isAuthenticated, dispatch]);

  return getSocket;
}
