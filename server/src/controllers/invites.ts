import { Request, Response } from 'express';
import { query } from '../config/database';

export async function createInvite(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const { max_uses, expires_in_hours } = req.body;
    const userId = req.user!.userId;

    const code = Math.random().toString(36).substring(2, 10);
    const expiresAt = expires_in_hours
      ? new Date(Date.now() + expires_in_hours * 60 * 60 * 1000)
      : null;

    const result = await query(
      `INSERT INTO invites (server_id, creator_id, code, max_uses, expires_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [serverId, userId, code, max_uses || null, expiresAt]
    );

    res.status(201).json({ invite: result.rows[0] });
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getInvites(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;

    const result = await query(
      `SELECT i.*, u.username as creator_name
       FROM invites i JOIN users u ON u.id = i.creator_id
       WHERE i.server_id = $1
       ORDER BY i.created_at DESC`,
      [serverId]
    );

    res.json({ invites: result.rows });
  } catch (error) {
    console.error('Get invites error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteInvite(req: Request, res: Response): Promise<void> {
  try {
    const { inviteId } = req.params;

    await query('DELETE FROM invites WHERE id = $1', [inviteId]);
    res.json({ message: 'Invite deleted' });
  } catch (error) {
    console.error('Delete invite error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
