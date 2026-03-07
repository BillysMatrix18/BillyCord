import { Request, Response } from 'express';
import { query } from '../config/database';
import { createChannelSchema } from '../utils/validation';
import { getSettingInt } from '../services/settingsCache';

export async function createChannel(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const parsed = createChannelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { name, type, topic, category_id } = parsed.data;
    const userId = req.user!.userId;

    // Check ownership/permissions
    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    // Enforce max channels per server
    const maxChannels = getSettingInt('max_channels_per_server', 500);
    const channelCount = await query(
      'SELECT COUNT(*) as count FROM channels WHERE server_id = $1',
      [serverId]
    );
    if (channelCount.rows[0].count >= maxChannels) {
      res.status(400).json({ error: `Channel limit reached (max ${maxChannels} per server)` });
      return;
    }

    // Get next position
    const posResult = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM channels WHERE server_id = $1',
      [serverId]
    );

    const result = await query(
      `INSERT INTO channels (server_id, name, type, topic, position, category_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [serverId, name, type, topic || null, posResult.rows[0].next_pos, category_id || null]
    );

    res.status(201).json({ channel: result.rows[0] });
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function getChannels(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;

    const result = await query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC',
      [serverId]
    );

    res.json({ channels: result.rows });
  } catch (error) {
    console.error('Get channels error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateChannel(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;
    const { name, topic, position, category_id } = req.body;

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (name) { fields.push(`name = $${idx++}`); values.push(name); }
    if (topic !== undefined) { fields.push(`topic = $${idx++}`); values.push(topic); }
    if (position !== undefined) { fields.push(`position = $${idx++}`); values.push(position); }
    if (category_id !== undefined) { fields.push(`category_id = $${idx++}`); values.push(category_id); }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(channelId);
    const result = await query(
      `UPDATE channels SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    res.json({ channel: result.rows[0] });
  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function deleteChannel(req: Request, res: Response): Promise<void> {
  try {
    const { channelId } = req.params;

    const result = await query('DELETE FROM channels WHERE id = $1 RETURNING id', [channelId]);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Channel not found' });
      return;
    }

    res.json({ message: 'Channel deleted' });
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function reorderChannels(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const userId = req.user!.userId;
    const { order } = req.body; // [{ id: channelId, position: number }]

    if (!Array.isArray(order) || order.length === 0) {
      res.status(400).json({ error: 'order array is required' });
      return;
    }

    // Check ownership
    const server = await query('SELECT owner_id FROM servers WHERE id = $1', [serverId]);
    if (server.rows.length === 0 || server.rows[0].owner_id !== userId) {
      res.status(403).json({ error: 'Only the server owner can reorder channels' });
      return;
    }

    // Update each channel's position in a transaction
    await query('BEGIN');
    for (const item of order) {
      await query(
        'UPDATE channels SET position = $1 WHERE id = $2 AND server_id = $3',
        [item.position, item.id, serverId]
      );
    }
    await query('COMMIT');

    // Return updated channel list
    const result = await query(
      'SELECT * FROM channels WHERE server_id = $1 ORDER BY position ASC',
      [serverId]
    );

    res.json({ channels: result.rows });
  } catch (error) {
    await query('ROLLBACK').catch(() => {});
    console.error('Reorder channels error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function createCategory(req: Request, res: Response): Promise<void> {
  try {
    const { serverId } = req.params;
    const { name } = req.body;

    if (!name || name.length > 100) {
      res.status(400).json({ error: 'Invalid category name' });
      return;
    }

    const posResult = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM categories WHERE server_id = $1',
      [serverId]
    );

    const result = await query(
      `INSERT INTO categories (server_id, name, position) VALUES ($1, $2, $3) RETURNING *`,
      [serverId, name, posResult.rows[0].next_pos]
    );

    res.status(201).json({ category: result.rows[0] });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
