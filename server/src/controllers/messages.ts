import { Request, Response } from 'express';
import { query } from '../config/database';
import { sanitizeHtml } from '../utils/validation';
import { logMessageEdit, logMessageDelete } from '../services/logger';

export async function getMessages(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;
    const { before, limit = '50' } = req.query;
    const messageLimit = Math.min(parseInt(limit as string, 10) || 50, 100);

    let sql = `
      SELECT m.*, u.username as sender_name, u.avatar_url as sender_avatar,
        COALESCE(
          (SELECT json_group_array(json_object('emoji', r.emoji, 'user_id', r.user_id, 'username', ru.username))
           FROM reactions r JOIN users ru ON ru.id = r.user_id
           WHERE r.message_id = m.id), '[]'
        ) as reactions
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE m.channel_id = $1 AND m.deleted_at IS NULL
    `;
    const params: unknown[] = [channelId];

    if (before) {
      sql += ` AND m.created_at < $2`;
      params.push(before);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT $${params.length + 1}`;
    params.push(messageLimit);

    const result = await query(sql, params);
    res.json({ messages: result.rows.reverse() });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createMessage(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;
    const { content, attachments } = req.body;
    const userId = req.user!.userId;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    if (content.length > 4000) {
      res.status(400).json({ error: 'Message too long (max 4000 characters)' });
      return;
    }

    const sanitizedContent = sanitizeHtml(content);

    const result = await query(
      `INSERT INTO messages (channel_id, sender_id, content, attachments)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [channelId, userId, sanitizedContent, JSON.stringify(attachments || [])]
    );

    // Fetch sender info
    const userResult = await query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    const message = {
      ...result.rows[0],
      sender_name: userResult.rows[0].username,
      sender_avatar: userResult.rows[0].avatar_url,
      reactions: [],
    };

    res.status(201).json({ message });
  } catch (error) {
    console.error('Create message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    const existing = await query('SELECT sender_id, content FROM messages WHERE id = $1', [messageId]);
    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }
    if (existing.rows[0].sender_id !== userId) {
      res.status(403).json({ error: 'Can only edit your own messages' });
      return;
    }

    const sanitizedContent = sanitizeHtml(content);

    // Log edit history before updating
    logMessageEdit(messageId, existing.rows[0].content, sanitizedContent, userId);

    const result = await query(
      `UPDATE messages SET content = $1, edited = 1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [sanitizedContent, messageId]
    );

    res.json({ message: result.rows[0] });
  } catch (error) {
    console.error('Update message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const userId = req.user!.userId;

    const existing = await query(
      `SELECT m.sender_id, m.channel_id, m.content, c.server_id FROM messages m
       JOIN channels c ON c.id = m.channel_id
       WHERE m.id = $1`,
      [messageId]
    );

    if (existing.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    // Allow sender or server owner to delete
    const msg = existing.rows[0];
    if (msg.sender_id !== userId) {
      const server = await query('SELECT owner_id FROM servers WHERE id = $1', [msg.server_id]);
      if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
        res.status(403).json({ error: 'Insufficient permissions' });
        return;
      }
    }

    // Soft-delete: archive to deleted_messages, mark as deleted (never truly remove)
    logMessageDelete(messageId, msg.channel_id, msg.sender_id, msg.content, userId);
    res.json({ message: 'Message deleted' });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function addReaction(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.userId;

    if (!emoji) {
      res.status(400).json({ error: 'Emoji is required' });
      return;
    }

    await query(
      `INSERT INTO reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)
       ON CONFLICT (message_id, user_id, emoji) DO NOTHING`,
      [messageId, userId, emoji]
    );

    res.json({ message: 'Reaction added' });
  } catch (error) {
    console.error('Add reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function removeReaction(req: Request, res: Response): Promise<void> {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user!.userId;

    await query(
      'DELETE FROM reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3',
      [messageId, userId, emoji]
    );

    res.json({ message: 'Reaction removed' });
  } catch (error) {
    console.error('Remove reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function pinMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const userId = req.user!.userId;

    const msg = await query(
      'SELECT channel_id FROM messages WHERE id = $1',
      [messageId]
    );
    if (msg.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const channelId = msg.rows[0].channel_id;
    await query('UPDATE messages SET pinned = 1 WHERE id = $1', [messageId]);
    await query(
      `INSERT INTO pinned_messages (channel_id, message_id, pinned_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [channelId, messageId, userId]
    );

    // Broadcast pin event to all users in the channel
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message:pinned', { messageId, channelId, pinned: true });
    }

    res.json({ message: 'Message pinned' });
  } catch (error) {
    console.error('Pin message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unpinMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;

    const msg = await query('SELECT channel_id FROM messages WHERE id = $1', [messageId]);
    if (msg.rows.length === 0) {
      res.status(404).json({ error: 'Message not found' });
      return;
    }

    const channelId = msg.rows[0].channel_id;
    await query('UPDATE messages SET pinned = 0 WHERE id = $1', [messageId]);
    await query('DELETE FROM pinned_messages WHERE message_id = $1', [messageId]);

    // Broadcast unpin event to all users in the channel
    const io = req.app.get('io');
    if (io) {
      io.to(`channel:${channelId}`).emit('message:pinned', { messageId, channelId, pinned: false });
    }

    res.json({ message: 'Message unpinned' });
  } catch (error) {
    console.error('Unpin message error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPinnedMessages(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;

    const result = await query(
      `SELECT m.*, u.username as sender_name, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON u.id = m.sender_id
       WHERE m.channel_id = $1 AND m.pinned = 1
       ORDER BY m.created_at DESC`,
      [channelId]
    );

    res.json({ messages: result.rows });
  } catch (error) {
    console.error('Get pinned messages error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
