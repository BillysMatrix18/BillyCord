import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { sanitizeHtml } from '../utils/validation';

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const result = await query(
      `SELECT c.*,
        (SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url, 'status', u.status))
         FROM conversation_members cm2
         JOIN users u ON u.id = cm2.user_id
         WHERE cm2.conversation_id = c.id AND cm2.user_id != $1
        ) as participants,
        (SELECT json_build_object('content', dm.content, 'sender_id', dm.sender_id, 'created_at', dm.created_at)
         FROM direct_messages dm WHERE dm.conversation_id = c.id
         ORDER BY dm.created_at DESC LIMIT 1
        ) as last_message
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       ORDER BY (SELECT MAX(dm2.created_at) FROM direct_messages dm2 WHERE dm2.conversation_id = c.id) DESC NULLS LAST`,
      [userId]
    );

    res.json({ conversations: result.rows });
  } catch (error) {
    console.error('Get conversations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createConversation(req: Request, res: Response): Promise<void> {
  const client = await getClient();
  try {
    const { participantIds, isGroup, name } = req.body;
    const userId = req.user!.userId;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      res.status(400).json({ error: 'Participant IDs are required' });
      return;
    }

    const allMembers = [userId, ...participantIds];

    // For 1:1 DMs, check if conversation already exists
    if (!isGroup && participantIds.length === 1) {
      const existing = await client.query(
        `SELECT c.id FROM conversations c
         WHERE c.is_group = FALSE
         AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
         AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2)`,
        [userId, participantIds[0]]
      );

      if (existing.rows.length > 0) {
        res.json({ conversation: { id: existing.rows[0].id } });
        return;
      }
    }

    await client.query('BEGIN');

    const convResult = await client.query(
      `INSERT INTO conversations (is_group, name) VALUES ($1, $2) RETURNING *`,
      [isGroup || false, name || null]
    );
    const conversationId = convResult.rows[0].id;

    for (const memberId of allMembers) {
      await client.query(
        `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`,
        [conversationId, memberId]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ conversation: convResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function getDirectMessages(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { before, limit = '50' } = req.query;
    const msgLimit = Math.min(parseInt(limit as string, 10) || 50, 100);

    let sql = `
      SELECT dm.*, u.username as sender_name, u.avatar_url as sender_avatar
      FROM direct_messages dm
      JOIN users u ON u.id = dm.sender_id
      WHERE dm.conversation_id = $1
    `;
    const params: unknown[] = [conversationId];

    if (before) {
      sql += ` AND dm.created_at < $2`;
      params.push(before);
    }

    sql += ` ORDER BY dm.created_at DESC LIMIT $${params.length + 1}`;
    params.push(msgLimit);

    const result = await query(sql, params);
    res.json({ messages: result.rows.reverse() });
  } catch (error) {
    console.error('Get DMs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function sendDirectMessage(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { content, attachments } = req.body;
    const userId = req.user!.userId;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }

    // Verify membership
    const membership = await query(
      'SELECT id FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    if (membership.rows.length === 0) {
      res.status(403).json({ error: 'Not a member of this conversation' });
      return;
    }

    const sanitizedContent = sanitizeHtml(content);

    const result = await query(
      `INSERT INTO direct_messages (conversation_id, sender_id, content, attachments)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, userId, sanitizedContent, attachments || []]
    );

    const userResult = await query(
      'SELECT username, avatar_url FROM users WHERE id = $1',
      [userId]
    );

    const message = {
      ...result.rows[0],
      sender_name: userResult.rows[0].username,
      sender_avatar: userResult.rows[0].avatar_url,
    };

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
