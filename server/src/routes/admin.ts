import { Router, Request, Response, NextFunction } from 'express';
import { query } from '../config/database';

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

// GET /api/admin/stats — dashboard statistics
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [usersResult, onlineResult, serversResult, channelsResult, messagesResult] =
      await Promise.all([
        query('SELECT COUNT(*) as count FROM users'),
        query("SELECT COUNT(*) as count FROM users WHERE status = 'online'"),
        query('SELECT COUNT(*) as count FROM servers'),
        query('SELECT COUNT(*) as count FROM channels'),
        query('SELECT COUNT(*) as count FROM messages'),
      ]);

    res.json({
      totalUsers: parseInt(usersResult.rows[0].count),
      onlineUsers: parseInt(onlineResult.rows[0].count),
      totalServers: parseInt(serversResult.rows[0].count),
      totalChannels: parseInt(channelsResult.rows[0].count),
      totalMessages: parseInt(messagesResult.rows[0].count),
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users — list all users
router.get('/users', async (_req: Request, res: Response) => {
  try {
    const result = await query(
      `SELECT id, username, email, status, custom_status, created_at, last_seen
       FROM users ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// DELETE /api/admin/users/:userId — delete a user
router.delete('/users/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    await query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Admin delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/servers — list all servers
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

// GET /api/admin/settings — get current server settings
router.get('/settings', (_req: Request, res: Response) => {
  res.json({
    port: parseInt(process.env.PORT || '3001'),
    nodeEnv: process.env.NODE_ENV || 'development',
    debugMode: process.env.DEBUG === 'true',
    maxUploadSize: '10mb',
    jwtExpiry: '15m',
    rateLimitWindow: '15min',
    rateLimitMax: 100,
    databaseConnected: true,
    redisEnabled: !!process.env.REDIS_URL,
  });
});

// POST /api/admin/announce — send announcement to all connected users
router.post('/announce', (req: Request, res: Response) => {
  try {
    const { message } = req.body;
    if (!message) {
      res.status(400).json({ error: 'Message required' });
      return;
    }
    const io = req.app.get('io');
    if (io) {
      io.emit('admin:announcement', { message, timestamp: new Date().toISOString() });
    }
    res.json({ success: true, message: 'Announcement sent' });
  } catch (err) {
    console.error('Admin announce error:', err);
    res.status(500).json({ error: 'Failed to send announcement' });
  }
});

// GET /api/admin/activity — recent activity (last 50 messages)
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

export default router;
