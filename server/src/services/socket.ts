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

// Track active voice calls: callId -> { participants, status, etc }
interface ActiveCall {
  id: string;
  initiatorId: string;
  conversationId?: string;
  callType: 'dm' | 'group' | 'channel';
  participants: Map<string, { socketId: string; userId: string; username: string }>;
  startTime: number;
  missedTimer?: ReturnType<typeof setTimeout>;
}
const activeCalls = new Map<string, ActiveCall>();

// Track which user is in which call: userId -> callId
const userCallMap = new Map<string, string>();

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

    // ─── Voice Calls (DM / Group) ───

    // Initiate a voice call
    socket.on('voice:call:initiate', safe(async (data: unknown) => {
      const { callId, conversationId, callType, callerName, callerAvatar } = data as {
        callId: string; conversationId: string; callType: 'dm' | 'group';
        callerName: string; callerAvatar: string | null;
      };

      // Check if user is already in a call
      if (userCallMap.has(userId)) return;

      // Create active call record
      const call: ActiveCall = {
        id: callId,
        initiatorId: userId,
        conversationId,
        callType,
        participants: new Map(),
        startTime: Date.now(),
      };
      call.participants.set(userId, { socketId: socket.id, userId, username });
      activeCalls.set(callId, call);
      userCallMap.set(userId, callId);

      // Save to database
      try {
        await query(
          `INSERT INTO voice_calls (id, initiator_id, conversation_id, call_type, status)
           VALUES ($1, $2, $3, $4, 'ringing')`,
          [callId, userId, conversationId, callType]
        );
        await query(
          `INSERT INTO voice_call_participants (call_id, user_id) VALUES ($1, $2)`,
          [callId, userId]
        );
      } catch (e) {
        console.error('Failed to save call record:', e);
      }

      // Get conversation members and notify them
      try {
        const members = await query(
          'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id != $2',
          [conversationId, userId]
        );
        for (const member of members.rows) {
          if (!userCallMap.has(member.user_id)) {
            io.to(`user:${member.user_id}`).emit('voice:call:incoming', {
              callId,
              callerId: userId,
              callerName,
              callerAvatar,
              conversationId,
              callType,
            });
          }
        }
      } catch (e) {
        console.error('Failed to notify call recipients:', e);
      }

      // Auto-timeout after 60s
      call.missedTimer = setTimeout(async () => {
        const c = activeCalls.get(callId);
        if (c && c.participants.size <= 1) {
          // No one joined - mark as missed
          try {
            await query("UPDATE voice_calls SET status = 'missed', end_time = datetime('now') WHERE id = $1", [callId]);
          } catch { /* ignore */ }
          c.participants.forEach((p) => {
            io.to(`user:${p.userId}`).emit('voice:call:rejected', { callId, reason: 'missed' });
          });
          c.participants.forEach((p) => userCallMap.delete(p.userId));
          activeCalls.delete(callId);
        }
      }, 60000);
    }));

    // Accept a voice call
    socket.on('voice:call:accept', safe(async (data: unknown) => {
      const { callId, avatarUrl } = data as { callId: string; userId?: string; username?: string; avatarUrl?: string | null };

      const call = activeCalls.get(callId);
      if (!call) return;

      // Check if user is already in a call
      if (userCallMap.has(userId)) return;

      // Clear timeout
      if (call.missedTimer) { clearTimeout(call.missedTimer); call.missedTimer = undefined; }

      // Add participant
      call.participants.set(userId, { socketId: socket.id, userId, username });
      userCallMap.set(userId, callId);

      // Update DB
      try {
        await query("UPDATE voice_calls SET status = 'active' WHERE id = $1", [callId]);
        await query("INSERT INTO voice_call_participants (call_id, user_id) VALUES ($1, $2)", [callId, userId]);
      } catch { /* ignore */ }

      // Notify all existing participants
      call.participants.forEach((p) => {
        if (p.userId !== userId) {
          io.to(`user:${p.userId}`).emit('voice:call:accepted', {
            callId,
            userId,
            username,
            socketId: socket.id,
            avatarUrl: avatarUrl || null,
          });
        }
      });

      // Send existing participants to the joiner
      call.participants.forEach((p) => {
        if (p.userId !== userId) {
          io.to(`user:${userId}`).emit('voice:call:participant-joined', {
            callId,
            userId: p.userId,
            username: p.username,
            socketId: p.socketId,
            avatarUrl: null,
          });
        }
      });
    }));

    // Reject a voice call
    socket.on('voice:call:reject', safe(async (data: unknown) => {
      const { callId } = data as { callId: string };
      const call = activeCalls.get(callId);
      if (!call) return;

      if (call.missedTimer) { clearTimeout(call.missedTimer); call.missedTimer = undefined; }

      try {
        await query("UPDATE voice_calls SET status = 'declined', end_time = datetime('now') WHERE id = $1", [callId]);
      } catch { /* ignore */ }

      // Notify initiator
      call.participants.forEach((p) => {
        io.to(`user:${p.userId}`).emit('voice:call:rejected', { callId, reason: 'declined' });
      });

      call.participants.forEach((p) => userCallMap.delete(p.userId));
      activeCalls.delete(callId);
    }));

    // End a voice call
    socket.on('voice:call:end', safe(async (data: unknown) => {
      const { callId } = data as { callId: string; reason?: string };
      const call = activeCalls.get(callId);
      if (!call) return;

      if (call.missedTimer) { clearTimeout(call.missedTimer); call.missedTimer = undefined; }

      const duration = Math.floor((Date.now() - call.startTime) / 1000);
      try {
        await query(
          "UPDATE voice_calls SET status = 'ended', end_time = datetime('now'), duration_seconds = $1 WHERE id = $2",
          [duration, callId]
        );
        // Update all participant leave times
        await query(
          "UPDATE voice_call_participants SET left_at = datetime('now') WHERE call_id = $1 AND left_at IS NULL",
          [callId]
        );
      } catch { /* ignore */ }

      // Notify all participants
      call.participants.forEach((p) => {
        io.to(`user:${p.userId}`).emit('voice:call:ended', { callId, duration });
      });

      call.participants.forEach((p) => userCallMap.delete(p.userId));
      activeCalls.delete(callId);
    }));

    // Mute toggle in call
    socket.on('voice:call:mute-toggle', safe((data: unknown) => {
      const { callId, muted } = data as { callId: string; muted: boolean };
      const call = activeCalls.get(callId);
      if (!call) return;
      call.participants.forEach((p) => {
        if (p.userId !== userId) {
          io.to(`user:${p.userId}`).emit('voice:call:mute-status', { userId, muted });
        }
      });
    }));

    // Deafen toggle in call
    socket.on('voice:call:deafen-toggle', safe((data: unknown) => {
      const { callId, deafened } = data as { callId: string; deafened: boolean };
      const call = activeCalls.get(callId);
      if (!call) return;
      call.participants.forEach((p) => {
        if (p.userId !== userId) {
          io.to(`user:${p.userId}`).emit('voice:call:deafen-status', { userId, deafened });
        }
      });
    }));

    // Heartbeat
    socket.on('voice:call:heartbeat', safe((_data: unknown) => {
      // Just keeps the connection alive, server tracks last heartbeat
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

      // Remove from active voice calls
      const callId = userCallMap.get(userId);
      if (callId) {
        const call = activeCalls.get(callId);
        if (call) {
          call.participants.delete(userId);
          userCallMap.delete(userId);
          // Notify remaining participants
          call.participants.forEach((p) => {
            io.to(`user:${p.userId}`).emit('voice:call:participant-left', { userId, socketId: socket.id });
          });
          // If no participants left, end the call
          if (call.participants.size === 0) {
            if (call.missedTimer) clearTimeout(call.missedTimer);
            const duration = Math.floor((Date.now() - call.startTime) / 1000);
            try {
              await query(
                "UPDATE voice_calls SET status = 'ended', end_time = datetime('now'), duration_seconds = $1 WHERE id = $2",
                [duration, callId]
              );
            } catch { /* ignore */ }
            activeCalls.delete(callId);
          } else if (call.participants.size === 1 && call.callType !== 'channel') {
            // Only one person left in a DM/group call, end it
            const remaining = Array.from(call.participants.values())[0];
            io.to(`user:${remaining.userId}`).emit('voice:call:ended', { callId });
            userCallMap.delete(remaining.userId);
            const duration = Math.floor((Date.now() - call.startTime) / 1000);
            try {
              await query(
                "UPDATE voice_calls SET status = 'ended', end_time = datetime('now'), duration_seconds = $1 WHERE id = $2",
                [duration, callId]
              );
            } catch { /* ignore */ }
            activeCalls.delete(callId);
          }
        }
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
