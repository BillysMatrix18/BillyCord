import { Request, Response } from 'express';
import { query } from '../config/database';

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
      res.json({ message: 'Friend request accepted' });
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
