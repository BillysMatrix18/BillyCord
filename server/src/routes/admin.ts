import { Router, Request, Response, NextFunction } from 'express';
import { query, getDbPath } from '../config/database';
import { runLogExport } from '../services/logExporter';
import { logAdminAction } from '../services/logger';
import { reloadSettings } from '../services/settingsCache';

const router = Router();

// Admin authentication via ADMIN_SECRET header
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'billycord-admin-2024';

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const secret = req.headers['x-admin-secret'] as string;
  if (!secret || secret !== ADMIN_SECRET) {
    res.status(403).json({ error: 'Invalid admin credentials' });
    return;
  }
  next();
}

router.use(requireAdmin);

// ── Stats & Analytics ──────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [usersResult, onlineResult, serversResult, channelsResult, messagesResult, dmsResult, friendsResult] =
      await Promise.all([
        query('SELECT COUNT(*) as count FROM users'),
        query("SELECT COUNT(*) as count FROM users WHERE status = 'online'"),
        query('SELECT COUNT(*) as count FROM servers'),
        query('SELECT COUNT(*) as count FROM channels'),
        query('SELECT COUNT(*) as count FROM messages'),
        query('SELECT COUNT(*) as count FROM direct_messages'),
        query("SELECT COUNT(*) as count FROM friends WHERE status = 'accepted'"),
      ]);

    // New users today
    const newToday = await query(
      "SELECT COUNT(*) as count FROM users WHERE date(created_at) = date('now')"
    );
    // New users this week
    const newThisWeek = await query(
      "SELECT COUNT(*) as count FROM users WHERE created_at >= datetime('now', '-7 days')"
    );
    // Active users last 24h
    const activeLast24h = await query(
      "SELECT COUNT(*) as count FROM users WHERE last_seen >= datetime('now', '-1 day')"
    );

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count),
      onlineUsers: parseInt(onlineResult.rows[0].count),
      totalServers: parseInt(serversResult.rows[0].count),
      totalChannels: parseInt(channelsResult.rows[0].count),
      totalMessages: parseInt(messagesResult.rows[0].count),
      totalDMs: parseInt(dmsResult.rows[0].count),
      totalFriendships: parseInt(friendsResult.rows[0].count),
      newUsersToday: parseInt(newToday.rows[0].count),
      newUsersThisWeek: parseInt(newThisWeek.rows[0].count),
      activeUsersLast24h: parseInt(activeLast24h.rows[0].count),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version,
      platform: process.platform,
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// Analytics — messages per day for last 30 days
router.get('/analytics/messages', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM messages
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Analytics — user signups per day for last 30 days
router.get('/analytics/users', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT date(created_at) as day, COUNT(*) as count
       FROM users
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY date(created_at)
       ORDER BY day ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Analytics — most active channels
router.get('/analytics/channels', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT c.name as channel_name, s.name as server_name, COUNT(m.id) as message_count
       FROM messages m
       JOIN channels c ON m.channel_id = c.id
       JOIN servers s ON c.server_id = s.id
       WHERE m.created_at >= datetime('now', '-7 days')
       GROUP BY m.channel_id
       ORDER BY message_count DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Analytics — most active users
router.get('/analytics/active-users', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT u.username, u.avatar_url, COUNT(m.id) as message_count
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.created_at >= datetime('now', '-7 days')
       GROUP BY m.sender_id
       ORDER BY message_count DESC
       LIMIT 20`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// ── User Management ────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = req.query.search as string;
    let sql = `SELECT id, username, email, status, custom_status, avatar_url, created_at, last_seen
               FROM users`;
    const params: unknown[] = [];
    if (search) {
      sql += ` WHERE LOWER(username) LIKE LOWER($1) OR LOWER(email) LIKE LOWER($1)`;
      params.push(`%${search}%`);
    }
    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

router.get('/users/:userId', async (req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, username, email, avatar_url, banner_url, bio, status, custom_status,
              theme, pronouns, location, birthday, social_links, profile_color,
              profile_visibility, email_verified, created_at, last_seen
       FROM users WHERE id = $1`,
      [req.params.userId]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: 'User not found' }); return; }

    // Get user's servers
    const servers = await query(
      `SELECT s.id, s.name FROM server_members sm JOIN servers s ON sm.server_id = s.id WHERE sm.user_id = $1`,
      [req.params.userId]
    );
    // Get user's message count
    const msgCount = await query('SELECT COUNT(*) as count FROM messages WHERE sender_id = $1', [req.params.userId]);

    res.json({ ...result.rows[0], servers: servers.rows, messageCount: parseInt(msgCount.rows[0].count) });
  } catch (err) {
    console.error('Admin user detail error:', err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM users WHERE id = $1', [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Ban/unban user (set status)
router.post('/users/:userId/ban', async (req: Request, res: Response) => {
  try {
    const { reason } = req.body;
    await query("UPDATE users SET status = 'offline', custom_status = $1 WHERE id = $2", [`BANNED: ${reason || 'No reason'}`, req.params.userId]);
    // Disconnect their socket
    const io = req.app.get('io');
    if (io) io.to(`user:${req.params.userId}`).emit('force:disconnect', { reason: 'You have been banned.' });
    res.json({ success: true });
  } catch (err) {
    console.error('Admin ban error:', err);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

router.post('/users/:userId/unban', async (req: Request, res: Response) => {
  try {
    await query("UPDATE users SET custom_status = NULL WHERE id = $1", [req.params.userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin unban error:', err);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// Reset user password (admin sets a new one)
router.post('/users/:userId/reset-password', async (req: Request, res: Response) => {
  try {
    const bcrypt = require('bcryptjs');
    const newPassword = req.body.newPassword || 'TempPass123!';
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.params.userId]);
    res.json({ success: true, message: `Password reset. New: ${newPassword}` });
  } catch (err) {
    console.error('Admin reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// Edit user profile (admin)
router.patch('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const allowedFields = ['username', 'email', 'bio', 'avatar_url', 'status', 'custom_status', 'profile_color', 'theme'];
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = $${idx}`);
        values.push(req.body[field]);
        idx++;
      }
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${updates.join(', ')} WHERE id = $${idx}
       RETURNING id, username, email, avatar_url, bio, status, custom_status, profile_color, theme, created_at, last_seen`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logAdminAction('user_edited', { userId, changes: Object.keys(req.body).filter(k => allowedFields.includes(k)) });
    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error('Admin edit user error:', err);
    res.status(500).json({ error: 'Failed to edit user' });
  }
});

// ── Server Management ──────────────────────────────────────────────

router.get('/servers', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT s.id, s.name, s.description, s.created_at, u.username as owner_name,
              (SELECT COUNT(*) FROM server_members sm WHERE sm.server_id = s.id) as member_count,
              (SELECT COUNT(*) FROM channels c WHERE c.server_id = s.id) as channel_count
       FROM servers s
       LEFT JOIN users u ON s.owner_id = u.id
       ORDER BY s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin servers error:', err);
    res.status(500).json({ error: 'Failed to fetch servers' });
  }
});

router.delete('/servers/:serverId', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM servers WHERE id = $1', [req.params.serverId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete server error:', err);
    res.status(500).json({ error: 'Failed to delete server' });
  }
});

// ── Configurable Settings ──────────────────────────────────────────

router.get('/settings', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM server_settings ORDER BY category, setting_key');
    // Also include runtime info
    res.json({
      settings: result.rows,
      runtime: {
        port: parseInt(process.env.PORT || '3001'),
        environment: process.env.NODE_ENV || 'development',
        nodeEnv: process.env.NODE_ENV || 'development',
        databaseConnected: true,
        redisEnabled: !!process.env.REDIS_URL,
      },
      dbPath: getDbPath(),
    });
  } catch (err) {
    console.error('Admin settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.patch('/settings/:key', async (req: Request, res: Response) => {
  try {
    const { value } = req.body;
    if (value === undefined) { res.status(400).json({ error: 'Value is required' }); return; }
    await query(
      "UPDATE server_settings SET setting_value = $1, updated_at = datetime('now') WHERE setting_key = $2",
      [String(value), req.params.key]
    );
    // Reload settings cache so changes take effect immediately
    await reloadSettings();
    res.json({ success: true, key: req.params.key, value });
  } catch (err) {
    console.error('Admin update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

// Bulk save all settings
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      res.status(400).json({ error: 'Settings object is required' });
      return;
    }
    for (const [key, value] of Object.entries(settings)) {
      await query(
        "INSERT OR REPLACE INTO server_settings (setting_key, setting_value, data_type, category, description, updated_at) VALUES ($1, $2, COALESCE((SELECT data_type FROM server_settings WHERE setting_key = $1), 'string'), COALESCE((SELECT category FROM server_settings WHERE setting_key = $1), 'general'), COALESCE((SELECT description FROM server_settings WHERE setting_key = $1), ''), datetime('now'))",
        [key, String(value)]
      );
    }
    // Reload settings cache so changes take effect immediately
    await reloadSettings();
    res.json({ success: true, updated: Object.keys(settings).length });
  } catch (err) {
    console.error('Admin bulk settings error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── Announcements ──────────────────────────────────────────────────

router.post('/announce', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) { res.status(400).json({ error: 'Message required' }); return; }
    const io = req.app.get('io');

    // Get all real users (not billybot)
    const usersResult = await query("SELECT id FROM users WHERE id != 'billybot'");
    const users = usersResult.rows;
    let sentCount = 0;

    const formattedContent = `**[SYSTEM ANNOUNCEMENT]**\n\n${message}`;

    for (const user of users) {
      try {
        // Find existing 1:1 conversation between billybot and this user
        let convId: string | null = null;
        const existingConv = await query(
          `SELECT c.id FROM conversations c
           WHERE c.is_group = 0
           AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
           AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = 'billybot')
           AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1)`,
          [user.id]
        );

        if (existingConv.rows.length > 0) {
          convId = existingConv.rows[0].id;
        } else {
          // Create new conversation
          const newConv = await query(
            `INSERT INTO conversations (is_group, name, owner_id) VALUES (0, NULL, NULL) RETURNING id`
          );
          convId = newConv.rows[0].id;
          await query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, 'billybot')`, [convId]);
          await query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, [convId, user.id]);
        }

        // Send the DM
        const msgResult = await query(
          `INSERT INTO direct_messages (conversation_id, sender_id, content) VALUES ($1, 'billybot', $2) RETURNING *`,
          [convId, formattedContent]
        );

        // Increment unread count for the user
        await query(
          `UPDATE conversation_members SET unread_count = unread_count + 1 WHERE conversation_id = $1 AND user_id = $2`,
          [convId, user.id]
        );

        // Emit DM event via socket
        if (io) {
          io.to(`user:${user.id}`).emit('dm:new', {
            conversationId: convId,
            message: {
              ...msgResult.rows[0],
              sender_name: 'BillyBot',
              sender_avatar: null,
            },
          });
        }

        sentCount++;
      } catch (err) {
        console.error(`Failed to send announcement DM to user ${user.id}:`, err);
      }
    }

    // Save to announcements table
    await query(
      `INSERT INTO announcements (content, created_by, sent_to_count) VALUES ($1, 'admin', $2)`,
      [message, sentCount]
    );

    // Also broadcast the banner announcement
    if (io) {
      io.emit('admin:announcement', { message, timestamp: new Date().toISOString() });
    }

    res.json({ success: true, message: 'Announcement sent as DM to all users', sentToCount: sentCount });
  } catch (err) {
    console.error('Admin announce error:', err);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

router.get('/announcements', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin announcements error:', err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
});

// ── Message Management ─────────────────────────────────────────────

router.get('/messages/search', async (req: Request, res: Response) => {
  try {
    const { q, userId, channelId } = req.query;
    let sql = `SELECT m.id, m.content, m.created_at, u.username as sender,
                      c.name as channel_name, s.name as server_name
               FROM messages m
               LEFT JOIN users u ON m.sender_id = u.id
               LEFT JOIN channels c ON m.channel_id = c.id
               LEFT JOIN servers s ON c.server_id = s.id WHERE 1=1`;
    const params: unknown[] = [];
    let idx = 1;
    if (q) { sql += ` AND LOWER(m.content) LIKE LOWER($${idx++})`; params.push(`%${q}%`); }
    if (userId) { sql += ` AND m.sender_id = $${idx++}`; params.push(userId); }
    if (channelId) { sql += ` AND m.channel_id = $${idx++}`; params.push(channelId); }
    sql += ` ORDER BY m.created_at DESC LIMIT 100`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Admin message search error:', err);
    res.status(500).json({ error: 'Failed to search messages' });
  }
});

router.delete('/messages/:messageId', async (req: Request, res: Response) => {
  try {
    await query('DELETE FROM messages WHERE id = $1', [req.params.messageId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Purge messages by user
router.delete('/messages/purge/:userId', async (req: Request, res: Response) => {
  try {
    const result = await query('DELETE FROM messages WHERE sender_id = $1', [req.params.userId]);
    res.json({ success: true, deletedCount: result.rowCount });
  } catch (err) {
    console.error('Admin purge messages error:', err);
    res.status(500).json({ error: 'Failed to purge messages' });
  }
});

// ── Activity & Logs ────────────────────────────────────────────────

router.get('/activity', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT m.id, m.content, m.created_at, u.username as sender,
              c.name as channel_name, s.name as server_name
       FROM messages m
       LEFT JOIN users u ON m.sender_id = u.id
       LEFT JOIN channels c ON m.channel_id = c.id
       LEFT JOIN servers s ON c.server_id = s.id
       ORDER BY m.created_at DESC LIMIT 50`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin activity error:', err);
    res.status(500).json({ error: 'Failed to fetch activity' });
  }
});

router.get('/logs', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    let sql = 'SELECT * FROM admin_logs';
    const params: unknown[] = [];
    if (type) { sql += ' WHERE admin_action = $1'; params.push(type); }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Admin logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// ── User Preferences (category collapse, etc.) ─────────────────────

router.get('/preferences/:userId/:serverId', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM user_preferences WHERE user_id = $1 AND server_id = $2',
      [req.params.userId, req.params.serverId]
    );
    res.json(result.rows[0] || { collapsed_categories: '[]' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// ── Comprehensive Logs ────────────────────────────────────────────

router.get('/user-activity', async (req: Request, res: Response) => {
  try {
    const { userId, action } = req.query;
    let sql = 'SELECT * FROM user_activity_logs WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;
    if (userId) { sql += ` AND user_id = $${idx++}`; params.push(userId); }
    if (action) { sql += ` AND action_type = $${idx++}`; params.push(action); }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('User activity logs error:', err);
    res.status(500).json({ error: 'Failed to fetch user activity logs' });
  }
});

router.get('/security-logs', async (req: Request, res: Response) => {
  try {
    const { eventType, userId } = req.query;
    let sql = 'SELECT * FROM security_logs WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;
    if (eventType) { sql += ` AND event_type = $${idx++}`; params.push(eventType); }
    if (userId) { sql += ` AND user_id = $${idx++}`; params.push(userId); }
    sql += ' ORDER BY created_at DESC LIMIT 500';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Security logs error:', err);
    res.status(500).json({ error: 'Failed to fetch security logs' });
  }
});

router.get('/error-logs', async (_req: Request, res: Response) => {
  try {
    const result = await query('SELECT * FROM error_logs ORDER BY created_at DESC LIMIT 200');
    res.json(result.rows);
  } catch (err) {
    console.error('Error logs error:', err);
    res.status(500).json({ error: 'Failed to fetch error logs' });
  }
});

router.get('/deleted-messages', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;
    let sql = 'SELECT * FROM deleted_messages';
    const params: unknown[] = [];
    if (userId) { sql += ' WHERE deleted_by = $1'; params.push(userId); }
    sql += ' ORDER BY deleted_at DESC LIMIT 200';
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Deleted messages error:', err);
    res.status(500).json({ error: 'Failed to fetch deleted messages' });
  }
});

router.get('/message-history/:messageId', async (req: Request, res: Response) => {
  try {
    const result = await query(
      'SELECT * FROM message_history WHERE message_id = $1 ORDER BY edited_at DESC',
      [req.params.messageId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Message history error:', err);
    res.status(500).json({ error: 'Failed to fetch message history' });
  }
});

// Trigger manual log export
router.post('/export-logs', async (_req: Request, res: Response) => {
  try {
    await runLogExport();
    logAdminAction('export_logs', 'system', 'manual');
    res.json({ success: true, message: 'Logs exported successfully' });
  } catch (err) {
    console.error('Log export error:', err);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

export default router;
