import { z } from 'zod';

export const registerSchema = z.object({
  username: z.string()
    .min(2, 'Username must be at least 2 characters')
    .max(32, 'Username must not exceed 32 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const createServerSchema = z.object({
  name: z.string()
    .min(1, 'Server name is required')
    .max(100, 'Server name must not exceed 100 characters'),
  description: z.string().max(1024).optional(),
});

export const createChannelSchema = z.object({
  name: z.string()
    .min(1, 'Channel name is required')
    .max(100, 'Channel name must not exceed 100 characters')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Channel name can only contain letters, numbers, hyphens, and underscores'),
  type: z.enum(['text', 'voice']),
  topic: z.string().max(1024).optional(),
  category_id: z.string().uuid().optional(),
});

export const messageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export const updateProfileSchema = z.object({
  username: z.string().min(2).max(32).regex(/^[a-zA-Z0-9_]+$/).optional(),
  bio: z.string().max(190).optional(),
  custom_status: z.string().max(128).optional(),
});

export const createRoleSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  permissions: z.number().int().min(0).optional(),
});

export const createInviteSchema = z.object({
  max_uses: z.number().int().min(0).max(100).optional(),
  expires_in_hours: z.number().int().min(1).max(168).optional(),
});

export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}
