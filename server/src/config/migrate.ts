import { exec } from './database';

// UUID default expression for SQLite
const UUID_DEFAULT = `(lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab',1+abs(random())%4,1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))))`;

const migrations = `
-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  username VARCHAR(32) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  status VARCHAR(20) DEFAULT 'offline' CHECK (status IN ('online', 'idle', 'dnd', 'offline')),
  custom_status VARCHAR(128),
  email_verified INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  last_seen TEXT DEFAULT (datetime('now'))
);

-- Servers table
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  name VARCHAR(100) NOT NULL,
  icon_url TEXT,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Channels table
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'text' CHECK (type IN ('text', 'voice')),
  topic TEXT,
  position INTEGER DEFAULT 0,
  category_id TEXT REFERENCES categories(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',
  edited INTEGER DEFAULT 0,
  pinned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Reactions table
CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji VARCHAR(64) NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(message_id, user_id, emoji)
);

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) DEFAULT '#99AAB5',
  position INTEGER DEFAULT 0,
  permissions INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Server members table
CREATE TABLE IF NOT EXISTS server_members (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  nickname VARCHAR(32),
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, server_id)
);

-- Member roles junction table
CREATE TABLE IF NOT EXISTS member_roles (
  member_id TEXT NOT NULL REFERENCES server_members(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (member_id, role_id)
);

-- Friends table
CREATE TABLE IF NOT EXISTS friends (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(requester_id, receiver_id)
);

-- Conversations table (for DMs and group DMs)
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  is_group INTEGER DEFAULT 0,
  name VARCHAR(100),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Conversation members
CREATE TABLE IF NOT EXISTS conversation_members (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT DEFAULT (datetime('now')),
  UNIQUE(conversation_id, user_id)
);

-- Direct messages table
CREATE TABLE IF NOT EXISTS direct_messages (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  attachments TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code VARCHAR(10) NOT NULL UNIQUE,
  max_uses INTEGER,
  uses INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  target_type VARCHAR(50) NOT NULL,
  target_id TEXT NOT NULL,
  changes TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Bans table
CREATE TABLE IF NOT EXISTS bans (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  banned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(server_id, user_id)
);

-- Pinned messages tracking
CREATE TABLE IF NOT EXISTS pinned_messages (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  pinned_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pinned_at TEXT DEFAULT (datetime('now')),
  UNIQUE(channel_id, message_id)
);

-- Server settings table (admin-configurable limits)
CREATE TABLE IF NOT EXISTS server_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL,
  data_type TEXT NOT NULL DEFAULT 'string',
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Announcements history
CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  content TEXT NOT NULL,
  created_by TEXT,
  sent_to_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- User preferences (per-server UI state)
CREATE TABLE IF NOT EXISTS user_preferences (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id TEXT NOT NULL,
  collapsed_categories TEXT DEFAULT '[]',
  UNIQUE(user_id, server_id)
);

-- Admin action logs
CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  admin_action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Message edit history (tracks ALL edits)
CREATE TABLE IF NOT EXISTS message_history (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  message_id TEXT NOT NULL,
  old_content TEXT NOT NULL,
  new_content TEXT NOT NULL,
  edited_by TEXT,
  edited_at TEXT DEFAULT (datetime('now'))
);

-- Deleted messages archive (messages are NEVER truly deleted)
CREATE TABLE IF NOT EXISTS deleted_messages (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  message_id TEXT NOT NULL,
  channel_id TEXT,
  sender_id TEXT,
  original_content TEXT NOT NULL,
  deleted_by TEXT,
  deleted_at TEXT DEFAULT (datetime('now')),
  deletion_reason TEXT
);

-- User activity logs (login, logout, message_sent, etc.)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  user_id TEXT,
  action_type TEXT NOT NULL,
  details TEXT DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Server activity logs (server changes)
CREATE TABLE IF NOT EXISTS server_activity_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  server_id TEXT,
  action_type TEXT NOT NULL,
  performed_by TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Error logs (ALL errors)
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  error_type TEXT NOT NULL,
  error_message TEXT,
  stack_trace TEXT,
  user_id TEXT,
  context TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Security logs (security events)
CREATE TABLE IF NOT EXISTS security_logs (
  id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
  event_type TEXT NOT NULL,
  user_id TEXT,
  details TEXT DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_channel_id ON messages(channel_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_channel_time ON messages(channel_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_server_members_user_id ON server_members(user_id);
CREATE INDEX IF NOT EXISTS idx_server_members_server_id ON server_members(server_id);
CREATE INDEX IF NOT EXISTS idx_channels_server_id ON channels(server_id);
CREATE INDEX IF NOT EXISTS idx_friends_requester ON friends(requester_id);
CREATE INDEX IF NOT EXISTS idx_friends_receiver ON friends(receiver_id);
CREATE INDEX IF NOT EXISTS idx_dm_conversation ON direct_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message ON reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_user_preferences ON user_preferences(user_id, server_id);
CREATE INDEX IF NOT EXISTS idx_message_history_msg ON message_history(message_id);
CREATE INDEX IF NOT EXISTS idx_deleted_messages_msg ON deleted_messages(message_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_user ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_created ON user_activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_server_activity_server ON server_activity_logs(server_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_logs_user ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_created ON security_logs(created_at DESC);
`;

// Safe ALTER TABLE helper — ignores "duplicate column" errors
async function safeAlter(sql: string) {
  try { await exec(sql); } catch { /* column already exists */ }
}

// Insert default setting if not exists
async function defaultSetting(key: string, value: string, dataType: string, category: string, description: string) {
  try {
    await exec(`INSERT OR IGNORE INTO server_settings (setting_key, setting_value, data_type, category, description) VALUES ('${key}', '${value}', '${dataType}', '${category}', '${description}')`);
  } catch { /* ignore */ }
}

// Exported for auto-migration on server startup
export async function runMigrations() {
  console.log('Running database migrations...');
  await exec(migrations);

  // Add deleted_at to messages (soft delete — never truly delete)
  await safeAlter("ALTER TABLE messages ADD COLUMN deleted_at TEXT");

  // Add group chat enhancements
  await safeAlter("ALTER TABLE conversations ADD COLUMN icon_url TEXT");
  await safeAlter("ALTER TABLE conversations ADD COLUMN owner_id TEXT");
  await safeAlter("ALTER TABLE conversations ADD COLUMN description TEXT");

  // Add new user profile columns (safe — no-op if already exist)
  await safeAlter("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'dark'");
  await safeAlter("ALTER TABLE users ADD COLUMN banner_url TEXT");
  await safeAlter("ALTER TABLE users ADD COLUMN pronouns TEXT");
  await safeAlter("ALTER TABLE users ADD COLUMN location TEXT");
  await safeAlter("ALTER TABLE users ADD COLUMN birthday TEXT");
  await safeAlter("ALTER TABLE users ADD COLUMN social_links TEXT DEFAULT '{}'");
  await safeAlter("ALTER TABLE users ADD COLUMN profile_color TEXT DEFAULT '#5865F2'");
  await safeAlter("ALTER TABLE users ADD COLUMN profile_visibility TEXT DEFAULT 'public'");

  // Add unread tracking columns
  await safeAlter("ALTER TABLE conversation_members ADD COLUMN unread_count INTEGER DEFAULT 0");
  await safeAlter("ALTER TABLE server_members ADD COLUMN unread_count INTEGER DEFAULT 0");

  // DM message editing, pinning support
  await safeAlter("ALTER TABLE direct_messages ADD COLUMN edited INTEGER DEFAULT 0");
  await safeAlter("ALTER TABLE direct_messages ADD COLUMN pinned INTEGER DEFAULT 0");
  await safeAlter("ALTER TABLE direct_messages ADD COLUMN updated_at TEXT");

  // DM reactions table
  await exec(`CREATE TABLE IF NOT EXISTS dm_reactions (
    id TEXT PRIMARY KEY DEFAULT ${UUID_DEFAULT},
    message_id TEXT NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(message_id, user_id, emoji)
  )`);

  // Insert default server settings
  await defaultSetting('max_users', '10000', 'integer', 'users', 'Maximum total users allowed');
  await defaultSetting('max_friends_per_user', '5000', 'integer', 'users', 'Maximum friends per user');
  await defaultSetting('max_servers_per_user', '100', 'integer', 'users', 'Maximum servers a user can create');
  await defaultSetting('max_simultaneous_logins', '5', 'integer', 'users', 'Maximum simultaneous logins per user');
  await defaultSetting('max_channels_per_server', '500', 'integer', 'servers', 'Maximum channels per server');
  await defaultSetting('max_message_length', '2000', 'integer', 'messages', 'Maximum message character length');
  await defaultSetting('rate_limit_messages', '20', 'integer', 'messages', 'Max messages per minute per user');
  await defaultSetting('message_retention_days', '365', 'integer', 'messages', 'Message retention in days (0=forever)');
  await defaultSetting('max_pin_per_channel', '50', 'integer', 'messages', 'Maximum pinned messages per channel');
  await defaultSetting('max_reactions_per_message', '10', 'integer', 'messages', 'Maximum emoji reactions per message');
  await defaultSetting('max_file_upload_mb', '25', 'integer', 'files', 'Maximum file upload size in MB');
  await defaultSetting('allow_image_uploads', 'true', 'boolean', 'files', 'Allow image file uploads');
  await defaultSetting('allow_video_uploads', 'true', 'boolean', 'files', 'Allow video file uploads');
  await defaultSetting('allow_document_uploads', 'true', 'boolean', 'files', 'Allow document file uploads');
  await defaultSetting('allow_audio_uploads', 'true', 'boolean', 'files', 'Allow audio file uploads');
  await defaultSetting('max_voice_participants', '0', 'integer', 'voice', 'Max participants per voice channel (0=unlimited)');
  await defaultSetting('max_simultaneous_calls', '0', 'integer', 'voice', 'Max simultaneous voice calls (0=unlimited)');
  await defaultSetting('audio_bitrate_kbps', '128', 'integer', 'voice', 'Audio bitrate in kbps');
  await defaultSetting('video_bitrate_mbps', '2.5', 'string', 'voice', 'Video bitrate in Mbps');
  await defaultSetting('screen_sharing_allowed', 'true', 'boolean', 'voice', 'Allow screen sharing in voice channels');
  await defaultSetting('recording_allowed', 'false', 'boolean', 'voice', 'Allow call recording');
  await defaultSetting('password_min_length', '8', 'integer', 'security', 'Minimum password length');
  await defaultSetting('max_login_attempts', '5', 'integer', 'security', 'Max failed login attempts before lockout');
  await defaultSetting('lockout_duration_minutes', '15', 'integer', 'security', 'Account lockout duration in minutes');
  await defaultSetting('require_2fa', 'optional', 'string', 'security', 'Two-factor authentication (optional/required/disabled)');
  await defaultSetting('ip_rate_limiting', '0', 'integer', 'security', 'IP rate limit requests/min (0=unlimited)');
  await defaultSetting('require_email_verification', 'false', 'boolean', 'security', 'Require email verification to login');
  await defaultSetting('session_timeout_hours', '168', 'integer', 'security', 'Session timeout in hours (168=1 week)');
  await defaultSetting('maintenance_mode', 'false', 'boolean', 'system', 'Enable maintenance mode');
  await defaultSetting('registration_enabled', 'true', 'boolean', 'system', 'Allow new user registrations');
  await defaultSetting('slow_mode_default', '0', 'integer', 'messages', 'Default slow mode seconds (0=off)');
  await defaultSetting('spam_detection', 'medium', 'string', 'moderation', 'Spam detection sensitivity (low/medium/high)');
  await defaultSetting('auto_kick_spammers', 'false', 'boolean', 'moderation', 'Automatically kick detected spammers');
  await defaultSetting('auto_mute_profanity', 'false', 'boolean', 'moderation', 'Auto-mute messages containing profanity');
  await defaultSetting('keyword_filter', '', 'string', 'moderation', 'Filtered keywords (one per line)');

  // Create BillyBot system user
  await exec(`INSERT OR IGNORE INTO users (id, username, email, password_hash, status, bio)
VALUES ('billybot', 'BillyBot', 'billybot@system', 'SYSTEM_USER_NO_LOGIN', 'online', 'BillyCord System Bot - Delivers announcements and system messages')`);

  console.log('Migrations completed successfully');
}

// Allow running as standalone script: `tsx src/config/migrate.ts`
const isDirectRun = require.main === module ||
  process.argv[1]?.endsWith('migrate.ts') ||
  process.argv[1]?.endsWith('migrate.js');

if (isDirectRun) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}
