import { Request, Response } from 'express';
import { query } from '../config/database';
import { createRoleSchema } from '../utils/validation';

export async function createRole(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const parsed = createRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { name, color, permissions } = parsed.data;

    const posResult = await query(
      'SELECT COALESCE(MAX(position), 0) + 1 as next_pos FROM roles WHERE server_id = $1',
      [serverId]
    );

    const result = await query(
      `INSERT INTO roles (server_id, name, color, position, permissions)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [serverId, name, color || '#99AAB5', posResult.rows[0].next_pos, permissions || 0]
    );

    res.status(201).json({ role: result.rows[0] });
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getRoles(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const result = await query(
      'SELECT * FROM roles WHERE server_id = $1 ORDER BY position DESC',
      [serverId]
    );
    res.json({ roles: result.rows });
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateRole(req: Request, res: Response): Promise<void> {
  try {
    const { roleId } = req.params;
    const { name, color, permissions, position } = req.body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (color) { fields.push(`color = $${idx++}`); values.push(color); }
    if (permissions !== undefined) { fields.push(`permissions = $${idx++}`); values.push(permissions); }
    if (position !== undefined) { fields.push(`position = $${idx++}`); values.push(position); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(roleId);
    const result = await query(
      `UPDATE roles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    res.json({ role: result.rows[0] });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteRole(req: Request, res: Response): Promise<void> {
  try {
    const { roleId } = req.params;

    const result = await query('DELETE FROM roles WHERE id = $1 RETURNING id', [roleId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function assignRole(req: Request, res: Response): Promise<void> {
  try {
    const { serverId, memberId, roleId } = req.params;

    // Verify member exists
    const member = await query(
      'SELECT id FROM server_members WHERE id = $1 AND server_id = $2',
      [memberId, serverId]
    );
    if (member.rows.length === 0) {
      res.status(404).json({ error: 'Member not found' });
      return;
    }

    await query(
      'INSERT INTO member_roles (member_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [memberId, roleId]
    );

    res.json({ message: 'Role assigned' });
  } catch (error) {
    console.error('Assign role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function removeRole(req: Request, res: Response): Promise<void> {
  try {
    const { memberId, roleId } = req.params;

    await query(
      'DELETE FROM member_roles WHERE member_id = $1 AND role_id = $2',
      [memberId, roleId]
    );

    res.json({ message: 'Role removed' });
  } catch (error) {
    console.error('Remove role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
