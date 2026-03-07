import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { query } from '../config/database';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
  restoredStatus?: string;
}

// Track users in voice channels: channelId -> Set of { socketId, userId, username }
const voiceChannelUsers = new Map<string, Set<{ socketId: string; userId: string; username: string }>>();

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    // Compression: reduces payload size for faster transmission over long distances
    perMessageDeflate: {
      threshold: 256, // only compress messages larger than 256 bytes
      zlibDeflateOptions: { level: 6 },
    },
    // Connection optimization
    pingTimeout: 30000,
    pingInterval: 15000,
    // Prefer WebSocket, skip polling upgrade delay
    transports: ['websocket', 'polling'],
    // Allow larger payloads for file attachments
    maxHttpBufferSize: 1e7,
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.userId;

      const userResult = await query('SELECT username, status FROM users WHERE id = $1', [payload.userId]);
      if (userResult.rows.length > 0) {
        socket.username = userResult.rows[0].username;
      }

      // Restore user's chosen status on reconnect (respect dnd/idle), only change from offline → online
      const prevStatus = userResult.rows[0]?.status;
      const restoreStatus = (prevStatus === 'dnd' || prevStatus === 'idle') ? prevStatus : 'online';
      socket.restoredStatus = restoreStatus;
      await query("UPDATE users SET status = $1, last_seen = NOW() WHERE id = $2", [restoreStatus, payload.userId]);

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // Wrap socket event handlers to prevent unhandled errors from crashing the server
  function safe(handler: (...args: unknown[]) => void | Promise<void>) {
    return (...args: unknown[]) => {
      try {
        const result = handler(...args);
        if (result && typeof (result as Promise<void>).catch === 'function') {
          (result as Promise<void>).catch(err => console.error('Socket handler error:', err));
        }
      } catch (err) {
        console.error('Socket handler error:', err);
      }
    };
  }

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username || 'Unknown';

    console.log(`User connected: ${username} (${userId})`);

    // Join user's personal room for DMs and notifications
    socket.join(`user:${userId}`);

    // Broadcast user's restored status (respects dnd/idle choice)
    const connectedStatus = socket.restoredStatus || 'online';
    socket.broadcast.emit('user:status', { userId, status: connectedStatus });

    // Join a channel room for real-time messages
    socket.on('channel:join', safe((channelId: unknown) => {
      socket.join(`channel:${channelId}`);
    }));

    socket.on('channel:leave', safe((channelId: unknown) => {
      socket.leave(`channel:${channelId}`);
    }));

    // Join a server room
    socket.on('server:join', safe((serverId: unknown) => {
      socket.join(`server:${serverId}`);
    }));

    socket.on('server:leave', safe((serverId: unknown) => {
      socket.leave(`server:${serverId}`);
    }));

    // Handle new messages (real-time broadcast)
    socket.on('message:send', safe((data: unknown) => {
      const { channelId, message } = data as { channelId: string; message: Record<string, unknown> };
      io.to(`channel:${channelId}`).emit('message:new', message);
    }));

    // Handle message edit
    socket.on('message:edit', safe((data: unknown) => {
      const { channelId, message } = data as { channelId: string; message: Record<string, unknown> };
      io.to(`channel:${channelId}`).emit('message:updated', message);
    }));

    // Handle message delete
    socket.on('message:delete', safe((data: unknown) => {
      const { channelId, messageId } = data as { channelId: string; messageId: string };
      io.to(`channel:${channelId}`).emit('message:deleted', { messageId });
    }));

    // Typing indicator
    socket.on('typing:start', safe((data: unknown) => {
      const { channelId } = data as { channelId: string };
      socket.to(`channel:${channelId}`).emit('typing:start', { userId, username });
    }));

    socket.on('typing:stop', safe((data: unknown) => {
      const { channelId } = data as { channelId: string };
      socket.to(`channel:${channelId}`).emit('typing:stop', { userId });
    }));

    // Reactions
    socket.on('reaction:add', safe((data: unknown) => {
      const { channelId, messageId, emoji } = data as { channelId: string; messageId: string; emoji: string };
      io.to(`channel:${channelId}`).emit('reaction:added', { messageId, emoji, userId, username });
    }));

    socket.on('reaction:remove', safe((data: unknown) => {
      const { channelId, messageId, emoji } = data as { channelId: string; messageId: string; emoji: string };
      io.to(`channel:${channelId}`).emit('reaction:removed', { messageId, emoji, userId });
    }));

    // Direct messages
    socket.on('dm:send', safe((data: unknown) => {
      const { conversationId, message, participantIds } = data as { conversationId: string; message: Record<string, unknown>; participantIds: string[] };
      participantIds.forEach((pid: string) => {
        io.to(`user:${pid}`).emit('dm:new', { conversationId, message });
      });
    }));

    // DM typing
    socket.on('dm:typing:start', safe((data: unknown) => {
      const { conversationId, participantIds } = data as { conversationId: string; participantIds: string[] };
      participantIds.forEach((pid: string) => {
        if (pid !== userId) {
          io.to(`user:${pid}`).emit('dm:typing:start', { conversationId, userId, username });
        }
      });
    }));

    socket.on('dm:typing:stop', safe((data: unknown) => {
      const { conversationId, participantIds } = data as { conversationId: string; participantIds: string[] };
      participantIds.forEach((pid: string) => {
        if (pid !== userId) {
          io.to(`user:${pid}`).emit('dm:typing:stop', { conversationId, userId });
        }
      });
    }));

    // Voice channel - join
    socket.on('voice:join', safe((data: unknown) => {
      const { channelId } = data as { channelId: string };

      if (!voiceChannelUsers.has(channelId)) {
        voiceChannelUsers.set(channelId, new Set());
      }

      const users = voiceChannelUsers.get(channelId)!;
      const userInfo = { socketId: socket.id, userId, username };
      users.add(userInfo);

      socket.join(`voice:${channelId}`);

      // Notify others in the voice channel
      socket.to(`voice:${channelId}`).emit('voice:user-joined', {
        userId,
        username,
        socketId: socket.id,
      });

      // Send current participants to the joining user
      const participants = Array.from(users).filter(u => u.userId !== userId);
      socket.emit('voice:participants', { channelId, participants });
    }));

    // Voice channel - leave
    socket.on('voice:leave', safe((data: unknown) => {
      const { channelId } = data as { channelId: string };
      leaveVoiceChannel(socket, channelId, userId, io);
    }));

    // WebRTC signaling
    socket.on('voice:offer', safe((data: unknown) => {
      const { targetSocketId, offer } = data as { targetSocketId: string; offer: unknown };
      io.to(targetSocketId).emit('voice:offer', {
        offer,
        senderSocketId: socket.id,
        userId,
        username,
      });
    }));

    socket.on('voice:answer', safe((data: unknown) => {
      const { targetSocketId, answer } = data as { targetSocketId: string; answer: unknown };
      io.to(targetSocketId).emit('voice:answer', {
        answer,
        senderSocketId: socket.id,
      });
    }));

    socket.on('voice:ice-candidate', safe((data: unknown) => {
      const { targetSocketId, candidate } = data as { targetSocketId: string; candidate: unknown };
      io.to(targetSocketId).emit('voice:ice-candidate', {
        candidate,
        senderSocketId: socket.id,
      });
    }));

    // Voice mute/unmute
    socket.on('voice:mute', safe((data: unknown) => {
      const { channelId, muted } = data as { channelId: string; muted: boolean };
      socket.to(`voice:${channelId}`).emit('voice:user-muted', { userId, muted });
    }));

    socket.on('voice:deafen', safe((data: unknown) => {
      const { channelId, deafened } = data as { channelId: string; deafened: boolean };
      socket.to(`voice:${channelId}`).emit('voice:user-deafened', { userId, deafened });
    }));

    // Friend request notifications
    socket.on('friend:request', safe((data: unknown) => {
      const { targetUserId } = data as { targetUserId: string };
      io.to(`user:${targetUserId}`).emit('friend:request-received', {
        fromUserId: userId,
        fromUsername: username,
      });
    }));

    // Server member events
    socket.on('server:member-joined', safe((data: unknown) => {
      const { serverId } = data as { serverId: string };
      io.to(`server:${serverId}`).emit('server:member-joined', { userId, username });
    }));

    // Ping measurement for dev mode
    socket.on('ping:measure', safe((_data: unknown, callback: unknown) => {
      if (typeof callback === 'function') callback();
    }));

    // Channel reorder
    socket.on('channel:reorder', safe((data: unknown) => {
      const { serverId } = data as { serverId: string };
      io.to(`server:${serverId}`).emit('channel:reordered', { serverId });
    }));

    // Disconnect
    socket.on('disconnect', safe(async () => {
      console.log(`User disconnected: ${username} (${userId})`);

      // Update status to offline
      try {
        await query("UPDATE users SET status = 'offline', last_seen = NOW() WHERE id = $1", [userId]);
      } catch (err) {
        console.error('Error updating user status on disconnect:', err);
      }

      // Remove from all voice channels
      for (const [channelId] of voiceChannelUsers) {
        leaveVoiceChannel(socket, channelId, userId, io);
      }

      // Broadcast offline status
      socket.broadcast.emit('user:status', { userId, status: 'offline' });
    }));
  });

  return io;
}

function leaveVoiceChannel(socket: AuthenticatedSocket, channelId: string, userId: string, io: Server) {
  const users = voiceChannelUsers.get(channelId);
  if (users) {
    for (const user of users) {
      if (user.userId === userId) {
        users.delete(user);
        break;
      }
    }
    if (users.size === 0) {
      voiceChannelUsers.delete(channelId);
    }
  }

  socket.leave(`voice:${channelId}`);
  io.to(`voice:${channelId}`).emit('voice:user-left', { userId, socketId: socket.id });
}
