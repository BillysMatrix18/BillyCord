import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt';
import { registerSchema, loginSchema } from '../utils/validation';
import { logUserActivity, logSecurity } from '../services/logger';

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
       RETURNING id, username, email, avatar_url, banner_url, bio, status, custom_status, theme,
                 pronouns, location, birthday, social_links, profile_color, profile_visibility, created_at`,
      [username, email, passwordHash]
    );

    const user = result.rows[0];
    const tokenPayload = { userId: user.id, email: user.email };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    // Log registration
    logUserActivity(user.id, 'register', { username, email }, req.ip, req.headers['user-agent'] as string);
    logSecurity('account_created', user.id, { username, email }, req.ip, req.headers['user-agent'] as string);

    res.status(201).json({ user, accessToken, refreshToken });
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

    // Allow login with either email or username (case-insensitive)
    const isEmail = loginIdentifier.includes('@');
    const result = await query(
      isEmail
        ? 'SELECT * FROM users WHERE LOWER(email) = LOWER($1)'
        : 'SELECT * FROM users WHERE LOWER(username) = LOWER($1)',
      [loginIdentifier]
    );

    if (result.rows.length === 0) {
      res.status(401).json({ error: 'Invalid username/email or password' });
      return;
    }

    const user = result.rows[0];
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      logSecurity('login_failed', user.id, { identifier: loginIdentifier, reason: 'wrong_password' }, req.ip, req.headers['user-agent'] as string);
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

    // Re-fetch user with all profile fields
    const fullUser = await query(
      `SELECT id, username, email, avatar_url, banner_url, bio, status, custom_status, theme,
              pronouns, location, birthday, social_links, profile_color, profile_visibility,
              email_verified, created_at
       FROM users WHERE id = $1`,
      [user.id]
    );
    const userData = fullUser.rows[0] || user;
    userData.status = 'online';

    // Log successful login
    logUserActivity(userData.id, 'login', { identifier: loginIdentifier }, req.ip, req.headers['user-agent'] as string);
    logSecurity('login_success', userData.id, { identifier: loginIdentifier }, req.ip, req.headers['user-agent'] as string);

    res.json({ user: userData, accessToken, refreshToken });
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
      `SELECT id, username, email, avatar_url, banner_url, bio, status, custom_status, theme,
              pronouns, location, birthday, social_links, profile_color, profile_visibility,
              email_verified, created_at
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
    const userId = req.user!.userId;
    const allowedFields = [
      'username', 'bio', 'custom_status', 'avatar_url', 'banner_url', 'theme',
      'pronouns', 'location', 'birthday', 'social_links', 'profile_color',
      'profile_visibility', 'status',
    ];

    const fields: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        const val = typeof req.body[field] === 'object' ? JSON.stringify(req.body[field]) : req.body[field];
        fields.push(`${field} = $${paramIndex++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    values.push(userId);
    const result = await query(
      `UPDATE users SET ${fields.join(', ')} WHERE id = $${paramIndex}
       RETURNING id, username, email, avatar_url, banner_url, bio, status, custom_status, theme,
                 pronouns, location, birthday, social_links, profile_color, profile_visibility,
                 email_verified, created_at`,
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
