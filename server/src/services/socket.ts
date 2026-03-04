import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { verifyAccessToken } from '../utils/jwt';
import { query } from '../config/database';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  username?: string;
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
    pingTimeout: 60000,
    pingInterval: 25000,
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

      const userResult = await query('SELECT username FROM users WHERE id = $1', [payload.userId]);
      if (userResult.rows.length > 0) {
        socket.username = userResult.rows[0].username;
      }

      // Update user status to online
      await query("UPDATE users SET status = 'online', last_seen = NOW() WHERE id = $1", [payload.userId]);

      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId!;
    const username = socket.username || 'Unknown';

    console.log(`User connected: ${username} (${userId})`);

    // Join user's personal room for DMs and notifications
    socket.join(`user:${userId}`);

    // Broadcast online status
    socket.broadcast.emit('user:status', { userId, status: 'online' });

    // Join a channel room for real-time messages
    socket.on('channel:join', (channelId: string) => {
      socket.join(`channel:${channelId}`);
      console.log(`${username} joined channel ${channelId}`);
    });

    socket.on('channel:leave', (channelId: string) => {
      socket.leave(`channel:${channelId}`);
    });

    // Join a server room
    socket.on('server:join', (serverId: string) => {
      socket.join(`server:${serverId}`);
    });

    socket.on('server:leave', (serverId: string) => {
      socket.leave(`server:${serverId}`);
    });

    // Handle new messages (real-time broadcast)
    socket.on('message:send', (data: { channelId: string; message: Record<string, unknown> }) => {
      io.to(`channel:${data.channelId}`).emit('message:new', data.message);
    });

    // Handle message edit
    socket.on('message:edit', (data: { channelId: string; message: Record<string, unknown> }) => {
      io.to(`channel:${data.channelId}`).emit('message:updated', data.message);
    });

    // Handle message delete
    socket.on('message:delete', (data: { channelId: string; messageId: string }) => {
      io.to(`channel:${data.channelId}`).emit('message:deleted', { messageId: data.messageId });
    });

    // Typing indicator
    socket.on('typing:start', (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:start', { userId, username });
    });

    socket.on('typing:stop', (data: { channelId: string }) => {
      socket.to(`channel:${data.channelId}`).emit('typing:stop', { userId });
    });

    // Reactions
    socket.on('reaction:add', (data: { channelId: string; messageId: string; emoji: string }) => {
      io.to(`channel:${data.channelId}`).emit('reaction:added', {
        messageId: data.messageId,
        emoji: data.emoji,
        userId,
        username,
      });
    });

    socket.on('reaction:remove', (data: { channelId: string; messageId: string; emoji: string }) => {
      io.to(`channel:${data.channelId}`).emit('reaction:removed', {
        messageId: data.messageId,
        emoji: data.emoji,
        userId,
      });
    });

    // Direct messages
    socket.on('dm:send', (data: { conversationId: string; message: Record<string, unknown>; participantIds: string[] }) => {
      // Send to all participants
      data.participantIds.forEach((pid: string) => {
        io.to(`user:${pid}`).emit('dm:new', {
          conversationId: data.conversationId,
          message: data.message,
        });
      });
    });

    // DM typing
    socket.on('dm:typing:start', (data: { conversationId: string; participantIds: string[] }) => {
      data.participantIds.forEach((pid: string) => {
        if (pid !== userId) {
          io.to(`user:${pid}`).emit('dm:typing:start', {
            conversationId: data.conversationId,
            userId,
            username,
          });
        }
      });
    });

    socket.on('dm:typing:stop', (data: { conversationId: string; participantIds: string[] }) => {
      data.participantIds.forEach((pid: string) => {
        if (pid !== userId) {
          io.to(`user:${pid}`).emit('dm:typing:stop', {
            conversationId: data.conversationId,
            userId,
          });
        }
      });
    });

    // Voice channel - join
    socket.on('voice:join', (data: { channelId: string }) => {
      const { channelId } = data;

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
    });

    // Voice channel - leave
    socket.on('voice:leave', (data: { channelId: string }) => {
      const { channelId } = data;
      leaveVoiceChannel(socket, channelId, userId, io);
    });

    // WebRTC signaling
    socket.on('voice:offer', (data: { targetSocketId: string; offer: unknown }) => {
      io.to(data.targetSocketId).emit('voice:offer', {
        offer: data.offer,
        senderSocketId: socket.id,
        userId,
        username,
      });
    });

    socket.on('voice:answer', (data: { targetSocketId: string; answer: unknown }) => {
      io.to(data.targetSocketId).emit('voice:answer', {
        answer: data.answer,
        senderSocketId: socket.id,
      });
    });

    socket.on('voice:ice-candidate', (data: { targetSocketId: string; candidate: unknown }) => {
      io.to(data.targetSocketId).emit('voice:ice-candidate', {
        candidate: data.candidate,
        senderSocketId: socket.id,
      });
    });

    // Voice mute/unmute
    socket.on('voice:mute', (data: { channelId: string; muted: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit('voice:user-muted', {
        userId,
        muted: data.muted,
      });
    });

    socket.on('voice:deafen', (data: { channelId: string; deafened: boolean }) => {
      socket.to(`voice:${data.channelId}`).emit('voice:user-deafened', {
        userId,
        deafened: data.deafened,
      });
    });

    // Friend request notifications
    socket.on('friend:request', (data: { targetUserId: string }) => {
      io.to(`user:${data.targetUserId}`).emit('friend:request-received', {
        fromUserId: userId,
        fromUsername: username,
      });
    });

    // Server member events
    socket.on('server:member-joined', (data: { serverId: string }) => {
      io.to(`server:${data.serverId}`).emit('server:member-joined', {
        userId,
        username,
      });
    });

    // Disconnect
    socket.on('disconnect', async () => {
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
    });
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
