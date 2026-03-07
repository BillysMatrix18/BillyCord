import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { sanitizeHtml } from '../utils/validation';
import { logUserActivity } from '../services/logger';

export async function getConversations(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const result = await query(
      `SELECT c.*,
        (SELECT json_group_array(json_object('id', u.id, 'username', u.username, 'avatar_url', u.avatar_url, 'status', u.status))
         FROM conversation_members cm2
         JOIN users u ON u.id = cm2.user_id
         WHERE cm2.conversation_id = c.id AND cm2.user_id != $1
        ) as participants,
        (SELECT json_object('content', dm.content, 'sender_id', dm.sender_id, 'created_at', dm.created_at)
         FROM direct_messages dm WHERE dm.conversation_id = c.id
         ORDER BY dm.created_at DESC LIMIT 1
        ) as last_message,
        (SELECT cm3.unread_count FROM conversation_members cm3 WHERE cm3.conversation_id = c.id AND cm3.user_id = $1) as unread_count
       FROM conversations c
       JOIN conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = $1
       ORDER BY (SELECT MAX(dm2.created_at) FROM direct_messages dm2 WHERE dm2.conversation_id = c.id) DESC`,
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
         WHERE c.is_group = 0
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
      `INSERT INTO conversations (is_group, name, owner_id) VALUES ($1, $2, $3) RETURNING *`,
      [isGroup || false, name || null, isGroup ? userId : null]
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
      SELECT dm.*, u.username as sender_name, u.avatar_url as sender_avatar, u.badges as sender_badges,
        (SELECT json_group_array(json_object('emoji', r.emoji, 'user_id', r.user_id, 'username', ru.username))
         FROM dm_reactions r JOIN users ru ON ru.id = r.user_id
         WHERE r.message_id = dm.id) as reactions
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

    // Build file attachments from multer uploads
    const uploadedFiles = (req.files as Express.Multer.File[]) || [];
    const fileAttachments = uploadedFiles.map(f => ({
      url: `/uploads/${f.filename}`,
      name: f.originalname,
      size: f.size,
      type: f.mimetype,
    }));
    const allAttachments = [...(attachments || []), ...fileAttachments];

    if ((!content || content.trim().length === 0) && allAttachments.length === 0) {
      res.status(400).json({ error: 'Message content or attachment is required' });
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

    const sanitizedContent = content ? sanitizeHtml(content) : '';

    const result = await query(
      `INSERT INTO direct_messages (conversation_id, sender_id, content, attachments)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [conversationId, userId, sanitizedContent, JSON.stringify(allAttachments)]
    );

    const userResult = await query(
      'SELECT username, avatar_url, badges FROM users WHERE id = $1',
      [userId]
    );

    // Increment unread for other members
    await query(
      `UPDATE conversation_members SET unread_count = unread_count + 1 WHERE conversation_id = $1 AND user_id != $2`,
      [conversationId, userId]
    );

    const message = {
      ...result.rows[0],
      sender_name: userResult.rows[0].username,
      sender_avatar: userResult.rows[0].avatar_url,
      sender_badges: userResult.rows[0].badges,
    };

    res.status(201).json({ message });
  } catch (error) {
    console.error('Send DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── Group Chat Management ─────────────────────────────────────────

export async function updateConversation(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;
    const { name, icon_url, description } = req.body;

    // Verify ownership
    const conv = await query('SELECT owner_id, is_group FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows.length === 0) { res.status(404).json({ error: 'Conversation not found' }); return; }
    if (!conv.rows[0].is_group) { res.status(400).json({ error: 'Cannot edit non-group conversations' }); return; }
    if (conv.rows[0].owner_id && conv.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the group owner can edit' }); return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (icon_url !== undefined) { fields.push(`icon_url = $${idx++}`); values.push(icon_url); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }

    if (fields.length === 0) { res.status(400).json({ error: 'No fields to update' }); return; }

    values.push(conversationId);
    const result = await query(
      `UPDATE conversations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    res.json({ conversation: result.rows[0] });
  } catch (error) {
    console.error('Update conversation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function addGroupMember(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const { userId: targetId } = req.body;
    const userId = req.user!.userId;

    const conv = await query('SELECT owner_id, is_group FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows.length === 0 || !conv.rows[0].is_group) {
      res.status(400).json({ error: 'Invalid group' }); return;
    }
    if (conv.rows[0].owner_id && conv.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the group owner can add members' }); return;
    }

    await query(
      `INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [conversationId, targetId]
    );
    logUserActivity(userId, 'group_member_added', { conversationId, targetId });
    res.json({ success: true });
  } catch (error) {
    console.error('Add group member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function removeGroupMember(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId, memberId } = req.params;
    const userId = req.user!.userId;

    const conv = await query('SELECT owner_id FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows.length === 0) { res.status(404).json({ error: 'Not found' }); return; }
    if (conv.rows[0].owner_id && conv.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the group owner can remove members' }); return;
    }

    await query('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, memberId]);
    logUserActivity(userId, 'group_member_removed', { conversationId, memberId });
    res.json({ success: true });
  } catch (error) {
    console.error('Remove group member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function leaveGroup(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;

    await query('DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2', [conversationId, userId]);

    // If owner leaves, transfer to next member or delete group
    const conv = await query('SELECT owner_id FROM conversations WHERE id = $1', [conversationId]);
    if (conv.rows[0]?.owner_id === userId) {
      const nextMember = await query(
        'SELECT user_id FROM conversation_members WHERE conversation_id = $1 LIMIT 1',
        [conversationId]
      );
      if (nextMember.rows.length > 0) {
        await query('UPDATE conversations SET owner_id = $1 WHERE id = $2', [nextMember.rows[0].user_id, conversationId]);
      } else {
        await query('DELETE FROM conversations WHERE id = $1', [conversationId]);
      }
    }

    logUserActivity(userId, 'group_left', { conversationId });
    res.json({ success: true });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markConversationRead(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const userId = req.user!.userId;
    await query(
      'UPDATE conversation_members SET unread_count = 0 WHERE conversation_id = $1 AND user_id = $2',
      [conversationId, userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// ── DM Message Editing, Deleting, Reactions, Pinning ────────────

export async function editDirectMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const { content } = req.body;
    const userId = req.user!.userId;

    if (!content || content.trim().length === 0) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const msg = await query('SELECT * FROM direct_messages WHERE id = $1', [messageId]);
    if (msg.rows.length === 0) { res.status(404).json({ error: 'Message not found' }); return; }
    if (msg.rows[0].sender_id !== userId) { res.status(403).json({ error: 'Can only edit your own messages' }); return; }

    const result = await query(
      `UPDATE direct_messages SET content = $1, edited = 1, updated_at = datetime('now') WHERE id = $2 RETURNING *`,
      [sanitizeHtml(content), messageId]
    );

    const userResult = await query('SELECT username, avatar_url, badges FROM users WHERE id = $1', [userId]);
    const message = { ...result.rows[0], sender_name: userResult.rows[0].username, sender_avatar: userResult.rows[0].avatar_url, sender_badges: userResult.rows[0].badges };
    res.json({ message });
  } catch (error) {
    console.error('Edit DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteDirectMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const userId = req.user!.userId;

    const msg = await query('SELECT * FROM direct_messages WHERE id = $1', [messageId]);
    if (msg.rows.length === 0) { res.status(404).json({ error: 'Message not found' }); return; }
    if (msg.rows[0].sender_id !== userId) { res.status(403).json({ error: 'Can only delete your own messages' }); return; }

    await query('DELETE FROM direct_messages WHERE id = $1', [messageId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function addDmReaction(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;
    const userId = req.user!.userId;

    if (!emoji) { res.status(400).json({ error: 'Emoji is required' }); return; }

    await query(
      `INSERT INTO dm_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [messageId, userId, emoji]
    );

    const userResult = await query('SELECT username FROM users WHERE id = $1', [userId]);
    res.json({ reaction: { message_id: messageId, user_id: userId, emoji, username: userResult.rows[0].username } });
  } catch (error) {
    console.error('Add DM reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function removeDmReaction(req: Request, res: Response): Promise<void> {
  try {
    const { messageId, emoji } = req.params;
    const userId = req.user!.userId;

    await query('DELETE FROM dm_reactions WHERE message_id = $1 AND user_id = $2 AND emoji = $3', [messageId, userId, emoji]);
    res.json({ success: true });
  } catch (error) {
    console.error('Remove DM reaction error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function pinDirectMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    await query('UPDATE direct_messages SET pinned = 1 WHERE id = $1', [messageId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Pin DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unpinDirectMessage(req: Request, res: Response): Promise<void> {
  try {
    const { messageId } = req.params;
    await query('UPDATE direct_messages SET pinned = 0 WHERE id = $1', [messageId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Unpin DM error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getGroupMembers(req: Request, res: Response): Promise<void> {
  try {
    const { conversationId } = req.params;
    const result = await query(
      `SELECT u.id, u.username, u.avatar_url, u.status
       FROM conversation_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.conversation_id = $1`,
      [conversationId]
    );
    res.json({ members: result.rows });
  } catch (error) {
    console.error('Get group members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
