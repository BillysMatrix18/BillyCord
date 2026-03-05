import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { getSettingInt } from '../services/settingsCache';

export async function sendFriendRequest(req: Request, res: Response): Promise<void> {
  try {
    const { username } = req.body;
    const userId = req.user!.userId;

    if (!username) {
      res.status(400).json({ error: 'Username is required' });
      return;
    }

    const targetUser = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (targetUser.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const targetId = targetUser.rows[0].id;
    if (targetId === userId) {
      res.status(400).json({ error: 'Cannot send friend request to yourself' });
      return;
    }

    // Check existing friendship
    const existing = await query(
      `SELECT * FROM friends
       WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)`,
      [userId, targetId]
    );

    if (existing.rows.length > 0) {
      const friend = existing.rows[0];
      if (friend.status === 'blocked') {
        res.status(403).json({ error: 'Cannot send request to this user' });
        return;
      }
      res.status(409).json({ error: 'Friend request already exists' });
      return;
    }

    // Enforce max friends per user
    const maxFriends = getSettingInt('max_friends_per_user', 5000);
    const friendCount = await query(
      `SELECT COUNT(*) as count FROM friends
       WHERE (requester_id = $1 OR receiver_id = $1) AND status = 'accepted'`,
      [userId]
    );
    if (friendCount.rows[0].count >= maxFriends) {
      res.status(400).json({ error: `Friend limit reached (max ${maxFriends} friends)` });
      return;
    }

    await query(
      `INSERT INTO friends (requester_id, receiver_id, status) VALUES ($1, $2, 'pending')`,
      [userId, targetId]
    );

    res.status(201).json({ message: 'Friend request sent' });
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function respondToFriendRequest(req: Request, res: Response): Promise<void> {
  try {
    const { requestId } = req.params;
    const { action } = req.body; // 'accept' or 'decline'
    const userId = req.user!.userId;

    if (!['accept', 'decline'].includes(action)) {
      res.status(400).json({ error: 'Action must be accept or decline' });
      return;
    }

    const request = await query(
      `SELECT * FROM friends WHERE id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [requestId, userId]
    );

    if (request.rows.length === 0) {
      res.status(404).json({ error: 'Friend request not found' });
      return;
    }

    if (action === 'accept') {
      await query("UPDATE friends SET status = 'accepted' WHERE id = $1", [requestId]);

      // Auto-create DM conversation between the two users
      const friendRow = request.rows[0];
      const requesterId = friendRow.requester_id;
      const receiverId = userId;

      // Check if a 1:1 conversation already exists
      const existingConv = await query(
        `SELECT c.id FROM conversations c
         WHERE c.is_group = 0
         AND (SELECT COUNT(*) FROM conversation_members cm WHERE cm.conversation_id = c.id) = 2
         AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $1)
         AND EXISTS (SELECT 1 FROM conversation_members cm WHERE cm.conversation_id = c.id AND cm.user_id = $2)`,
        [requesterId, receiverId]
      );

      let conversationId: string | null = null;
      if (existingConv.rows.length > 0) {
        conversationId = existingConv.rows[0].id;
      } else {
        // Create new conversation
        const client = await getClient();
        try {
          await client.query('BEGIN');
          const convResult = await client.query(
            `INSERT INTO conversations (is_group, name) VALUES ($1, $2) RETURNING *`,
            [false, null]
          );
          conversationId = convResult.rows[0].id;
          await client.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, [conversationId, requesterId]);
          await client.query(`INSERT INTO conversation_members (conversation_id, user_id) VALUES ($1, $2)`, [conversationId, receiverId]);
          await client.query('COMMIT');
        } catch {
          await client.query('ROLLBACK');
        } finally {
          client.release();
        }
      }

      res.json({ message: 'Friend request accepted', conversationId });
    } else {
      await query('DELETE FROM friends WHERE id = $1', [requestId]);
      res.json({ message: 'Friend request declined' });
    }
  } catch (error) {
    console.error('Respond to friend request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getFriends(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const result = await query(
      `SELECT f.id, f.status, f.created_at,
        CASE
          WHEN f.requester_id = $1 THEN u2.id
          ELSE u1.id
        END as friend_id,
        CASE
          WHEN f.requester_id = $1 THEN u2.username
          ELSE u1.username
        END as friend_username,
        CASE
          WHEN f.requester_id = $1 THEN u2.avatar_url
          ELSE u1.avatar_url
        END as friend_avatar,
        CASE
          WHEN f.requester_id = $1 THEN u2.status
          ELSE u1.status
        END as friend_status
       FROM friends f
       JOIN users u1 ON u1.id = f.requester_id
       JOIN users u2 ON u2.id = f.receiver_id
       WHERE (f.requester_id = $1 OR f.receiver_id = $1) AND f.status = 'accepted'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({ friends: result.rows });
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getPendingRequests(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;

    const incoming = await query(
      `SELECT f.id, f.created_at, u.id as user_id, u.username, u.avatar_url
       FROM friends f JOIN users u ON u.id = f.requester_id
       WHERE f.receiver_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    const outgoing = await query(
      `SELECT f.id, f.created_at, u.id as user_id, u.username, u.avatar_url
       FROM friends f JOIN users u ON u.id = f.receiver_id
       WHERE f.requester_id = $1 AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [userId]
    );

    res.json({ incoming: incoming.rows, outgoing: outgoing.rows });
  } catch (error) {
    console.error('Get pending requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function removeFriend(req: Request, res: Response): Promise<void> {
  try {
    const { friendId } = req.params;
    const userId = req.user!.userId;

    await query(
      `DELETE FROM friends
       WHERE ((requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1))
       AND status = 'accepted'`,
      [userId, friendId]
    );

    res.json({ message: 'Friend removed' });
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function blockUser(req: Request, res: Response): Promise<void> {
  try {
    const { userId: targetId } = req.params;
    const userId = req.user!.userId;

    // Remove any existing friendship
    await query(
      `DELETE FROM friends
       WHERE (requester_id = $1 AND receiver_id = $2) OR (requester_id = $2 AND receiver_id = $1)`,
      [userId, targetId]
    );

    // Add block
    await query(
      `INSERT INTO friends (requester_id, receiver_id, status) VALUES ($1, $2, 'blocked')
       ON CONFLICT (requester_id, receiver_id) DO UPDATE SET status = 'blocked'`,
      [userId, targetId]
    );

    res.json({ message: 'User blocked' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
