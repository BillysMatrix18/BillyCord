import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { registerSchema, loginSchema } from '../utils/validation';

export async function register(req: Request, res: Response): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { username, email, password } = parsed.data;

    // Check for existing user
    const existing = await query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email or username already taken' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3)
       RETURNING id, username, email, avatar_url, bio, status, created_at`,
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        bio: user.bio,
        status: user.status,
        created_at: user.created_at,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.errors[0].message });
      return;
    }

    const { email: loginIdentifier, password } = parsed.data;

    // Allow login with either email or username
    const isEmail = loginIdentifier.includes('@');
    const result = await query(
      isEmail
        ? 'SELECT * FROM users WHERE email = $1'
        : 'SELECT * FROM users WHERE username = $1',
      [loginIdentifier]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    // Update last_seen and status
    await query(
      "UPDATE users SET last_seen = NOW(), status = 'online' WHERE id = $1",
      [user.id]
    );

    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url,
        bio: user.bio,
        status: 'online',
        created_at: user.created_at,
      },
      accessToken,
      refreshToken,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function refreshToken(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken: token } = req.body;

    if (!token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    const payload = verifyRefreshToken(token);
    const newAccessToken = generateAccessToken({ userId: payload.userId, email: payload.email });
    const newRefreshToken = generateRefreshToken({ userId: payload.userId, email: payload.email });

    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch {
    res.status(401).json({ error: 'Invalid refresh token' });
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  try {
    const result = await query(
      `SELECT id, username, email, avatar_url, bio, status, custom_status, email_verified, created_at
       FROM users WHERE id = $1`,
      [req.user!.userId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    const { username, bio, custom_status, avatar_url } = req.body;
    const userId = req.user!.userId;

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (username !== undefined) {
      fields.push(`username = $${paramIndex++}`);
      values.push(username);
    }
    if (bio !== undefined) {
      fields.push(`bio = $${paramIndex++}`);
      values.push(bio);
    }
    if (custom_status !== undefined) {
      fields.push(`custom_status = $${paramIndex++}`);
      values.push(custom_status);
    }
    if (avatar_url !== undefined) {
      fields.push(`avatar_url = $${paramIndex++}`);
      values.push(avatar_url);
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, email, avatar_url, bio, status, custom_status, created_at`,
      values
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;

    if (!currentPassword || !newPassword || newPassword.length < 8) {
      res.status(400).json({ error: 'Invalid password data' });
      return;
    }

    const result = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    const valid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, userId]);

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
