import { Request, Response } from 'express';
import { query, getClient } from '../config/database';
import { createServerSchema } from '../utils/validation';
import { Permissions } from '../types';
import { getSettingInt } from '../services/settingsCache';

export async function createServer(req: Request, res: Response): Promise<void> {
  const client = await getClient();
  try {
    const parsed = createServerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { name, description } = parsed.data;
    const userId = req.user!.userId;

    // Enforce max servers per user
    const maxServers = getSettingInt('max_servers_per_user', 100);
    const ownedCount = await query(
      'SELECT COUNT(*) as count FROM servers WHERE owner_id = $1',
      [userId]
    );
    if (ownedCount.rows[0].count >= maxServers) {
      res.status(400).json({ error: `Server limit reached (max ${maxServers} servers)` });
      return;
    }

    await client.query('BEGIN');

    // Create server
    const serverResult = await client.query(
      `INSERT INTO servers (name, owner_id, description) VALUES ($1, $2, $3) RETURNING *`,
      [name, userId, description || null]
    );
    const server = serverResult.rows[0];

    // Add owner as member
    await client.query(
      `INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)`,
      [userId, server.id]
    );

    // Create @everyone role with default permissions
    const defaultPerms = Permissions.VIEW_CHANNELS | Permissions.SEND_MESSAGES |
      Permissions.ATTACH_FILES | Permissions.ADD_REACTIONS |
      Permissions.CONNECT_VOICE | Permissions.SPEAK | Permissions.CREATE_INVITES;

    await client.query(
      `INSERT INTO roles (server_id, name, color, position, permissions) VALUES ($1, '@everyone', '#99AAB5', 0, $2)`,
      [server.id, defaultPerms]
    );

    // Create default category and channels
    const catResult = await client.query(
      `INSERT INTO categories (server_id, name, position) VALUES ($1, 'Text Channels', 0) RETURNING id`,
      [server.id]
    );

    await client.query(
      `INSERT INTO channels (server_id, name, type, position, category_id, topic)
       VALUES ($1, 'general', 'text', 0, $2, 'General discussion')`,
      [server.id, catResult.rows[0].id]
    );

    await client.query(
      `INSERT INTO channels (server_id, name, type, position) VALUES ($1, 'General', 'voice', 1)`,
      [server.id]
    );

    // Create invite code
    const code = Math.random().toString(36).substring(2, 10);
    await client.query(
      `INSERT INTO invites (server_id, creator_id, code) VALUES ($1, $2, $3)`,
      [server.id, userId, code]
    );

    await client.query('COMMIT');

    res.status(201).json({ server });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
}

export async function getServers(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user!.userId;
    const result = await query(
      `SELECT s.*, sm.joined_at, sm.nickname, sm.unread_count,
        (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
       FROM servers s
       JOIN server_members sm ON s.id = sm.server_id AND sm.user_id = $1
       ORDER BY sm.joined_at ASC`,
      [userId]
    );
    res.json({ servers: result.rows });
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getServer(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;

    // Verify membership
    const membership = await query(
      'SELECT id FROM server_members WHERE user_id = $1 AND server_id = $2',
      [userId, serverId]
    );
    if (membership.rows.length === 0) {
      res.status(403).json({ error: 'Not a member of this server' });
      return;
    }

    const serverResult = await query(
      `SELECT s.*,
        (SELECT COUNT(*) FROM server_members WHERE server_id = s.id) as member_count
       FROM servers s WHERE s.id = $1`,
      [serverId]
    );

    if (serverResult.rows.length === 0) {
      res.status(404).json({ error: 'Server not found' });
      return;
    }

    const channels = await query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC',
      [serverId]
    );

    const categories = await query(
      'SELECT * FROM categories WHERE server_id = $1 ORDER BY position ASC',
      [serverId]
    );

    const members = await query(
      `SELECT u.id, u.username, u.avatar_url, u.status, u.custom_status, sm.nickname, sm.joined_at, sm.id as member_id
       FROM server_members sm
       JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = $1
       ORDER BY u.username ASC`,
      [serverId]
    );

    const roles = await query(
      'SELECT * FROM roles WHERE server_id = $1 ORDER BY position DESC',
      [serverId]
    );

    // Fetch member_roles for all members in this server
    const memberRoles = await query(
      `SELECT mr.member_id, mr.role_id
       FROM member_roles mr
       JOIN server_members sm ON sm.id = mr.member_id
       WHERE sm.server_id = $1`,
      [serverId]
    );

    // Attach role_ids to each member
    const memberRolesMap: Record<string, string[]> = {};
    for (const mr of memberRoles.rows) {
      if (!memberRolesMap[mr.member_id]) memberRolesMap[mr.member_id] = [];
      memberRolesMap[mr.member_id].push(mr.role_id);
    }

    const membersWithRoles = members.rows.map((m: { member_id: string }) => ({
      ...m,
      role_ids: memberRolesMap[m.member_id] || [],
    }));

    res.json({
      server: serverResult.rows[0],
      channels: channels.rows,
      categories: categories.rows,
      members: membersWithRoles,
      roles: roles.rows,
    });
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateServer(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;
    const { name, description, icon_url } = req.body;

    // Check ownership
    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the server owner can update settings' });
      return;
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (icon_url !== undefined) { fields.push(`icon_url = $${idx++}`); values.push(icon_url); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(serverId);
    const result = await query(
      `UPDATE servers SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ server: result.rows[0] });
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteServer(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;

    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the server owner can delete the server' });
      return;
    }

    await query('DELETE FROM servers WHERE id = $1', [serverId]);
    res.json({ message: 'Server deleted successfully' });
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function joinServer(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.params;
    const userId = req.user!.userId;

    const invite = await query(
      `SELECT i.*, s.name as server_name FROM invites i
       JOIN servers s ON s.id = i.server_id
       WHERE i.code = $1`,
      [code]
    );

    if (invite.rows.length === 0) {
      res.status(404).json({ error: 'Invalid invite code' });
      return;
    }

    const inv = invite.rows[0];

    if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
      res.status(410).json({ error: 'Invite has expired' });
      return;
    }

    if (inv.max_uses && inv.uses >= inv.max_uses) {
      res.status(410).json({ error: 'Invite has reached maximum uses' });
      return;
    }

    // Check if banned
    const ban = await query(
      'SELECT id FROM bans WHERE server_id = $1 AND user_id = $2',
      [inv.server_id, userId]
    );
    if (ban.rows.length > 0) {
      res.status(403).json({ error: 'You are banned from this server' });
      return;
    }

    // Check existing membership
    const existing = await query(
      'SELECT id FROM server_members WHERE user_id = $1 AND server_id = $2',
      [userId, inv.server_id]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Already a member of this server' });
      return;
    }

    await query(
      'INSERT INTO server_members (user_id, server_id) VALUES ($1, $2)',
      [userId, inv.server_id]
    );

    // Increment invite uses
    await query('UPDATE invites SET uses = uses + 1 WHERE id = $1', [inv.id]);

    const serverResult = await query('SELECT * FROM servers WHERE id = $1', [inv.server_id]);
    res.json({ server: serverResult.rows[0] });
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function leaveServer(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;

    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length > 0 && server.rows[0].owner_id === userId) {
      res.status(400).json({ error: 'Server owner cannot leave. Transfer ownership or delete the server.' });
      return;
    }

    await query(
      'DELETE FROM server_members WHERE user_id = $1 AND server_id = $2',
      [userId, serverId]
    );

    res.json({ message: 'Left server successfully' });
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getMembers(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;

    const result = await query(
      `SELECT u.id, u.username, u.avatar_url, u.status, u.custom_status, u.badges, sm.nickname, sm.joined_at
       FROM server_members sm
       JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = $1
       ORDER BY u.username ASC`,
      [serverId]
    );

    res.json({ members: result.rows });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function kickMember(req: Request, res: Response): Promise<void> {
  try {
    const { serverId, userId: targetId } = req.params;
    const userId = req.user!.userId;

    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    if (targetId === userId) {
      res.status(400).json({ error: 'Cannot kick yourself' });
      return;
    }

    await query('DELETE FROM server_members WHERE user_id = $1 AND server_id = $2', [targetId, serverId]);

    // Audit log
    await query(
      `INSERT INTO audit_logs (server_id, user_id, action, target_type, target_id)
       VALUES ($1, $2, 'KICK_MEMBER', 'user', $3)`,
      [serverId, userId, targetId]
    );

    res.json({ message: 'Member kicked' });
  } catch (error) {
    console.error('Kick member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function banMember(req: Request, res: Response): Promise<void> {
  try {
    const { serverId, userId: targetId } = req.params;
    const userId = req.user!.userId;
    const { reason } = req.body;

    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Remove from members
    await query('DELETE FROM server_members WHERE user_id = $1 AND server_id = $2', [targetId, serverId]);

    // Add ban
    await query(
      `INSERT INTO bans (server_id, user_id, banned_by, reason) VALUES ($1, $2, $3, $4)
       ON CONFLICT (server_id, user_id) DO NOTHING`,
      [serverId, targetId, userId, reason || null]
    );

    // Audit log
    await query(
      `INSERT INTO audit_logs (server_id, user_id, action, target_type, target_id, changes)
       VALUES ($1, $2, 'BAN_MEMBER', 'user', $3, $4)`,
      [serverId, userId, targetId, JSON.stringify({ reason })]
    );

    res.json({ message: 'Member banned' });
  } catch (error) {
    console.error('Ban member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function unbanMember(req: Request, res: Response): Promise<void> {
  try {
    const { serverId, userId: targetId } = req.params;
    const userId = req.user!.userId;

    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    await query('DELETE FROM bans WHERE server_id = $1 AND user_id = $2', [serverId, targetId]);
    res.json({ message: 'Member unbanned' });
  } catch (error) {
    console.error('Unban member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getBans(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;

    const result = await query(
      `SELECT b.*, u.username, u.avatar_url
       FROM bans b JOIN users u ON u.id = b.user_id
       WHERE b.server_id = $1 ORDER BY b.created_at DESC`,
      [serverId]
    );

    res.json({ bans: result.rows });
  } catch (error) {
    console.error('Get bans error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function markServerRead(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;
    await query(
      'UPDATE server_members SET unread_count = 0 WHERE server_id = $1 AND user_id = $2',
      [serverId, userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Mark server read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;

    const result = await query(
      `SELECT al.*, u.username as user_name
       FROM audit_logs al
       JOIN users u ON u.id = al.user_id
       WHERE al.server_id = $1
       ORDER BY al.created_at DESC LIMIT 50`,
      [serverId]
    );

    res.json({ logs: result.rows });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
