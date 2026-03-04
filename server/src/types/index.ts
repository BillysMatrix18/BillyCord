export interface User {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar_url: string | null;
  bio: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status: string | null;
  email_verified: boolean;
  created_at: Date;
  last_seen: Date;
}

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  description: string | null;
  created_at: Date;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  topic: string | null;
  position: number;
  category_id: string | null;
  created_at: Date;
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
  created_at: Date;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  attachments: string[];
  edited: boolean;
  pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

export interface Friend {
  id: string;
  requester_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'blocked';
  created_at: Date;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  attachments: string[];
  created_at: Date;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  created_at: Date;
}

export interface ConversationMember {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: Date;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
  created_at: Date;
}

export interface ServerMember {
  id: string;
  user_id: string;
  server_id: string;
  nickname: string | null;
  joined_at: Date;
}

export interface MemberRole {
  member_id: string;
  role_id: string;
}

export interface Invite {
  id: string;
  server_id: string;
  creator_id: string;
  code: string;
  max_uses: number | null;
  uses: number;
  expires_at: Date | null;
  created_at: Date;
}

export interface AuditLog {
  id: string;
  server_id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string;
  changes: Record<string, unknown>;
  created_at: Date;
}

// Permission bit flags
export const Permissions = {
  VIEW_CHANNELS: 1 << 0,
  SEND_MESSAGES: 1 << 1,
  MANAGE_MESSAGES: 1 << 2,
  ATTACH_FILES: 1 << 3,
  ADD_REACTIONS: 1 << 4,
  CONNECT_VOICE: 1 << 5,
  SPEAK: 1 << 6,
  MUTE_MEMBERS: 1 << 7,
  DEAFEN_MEMBERS: 1 << 8,
  MANAGE_CHANNELS: 1 << 9,
  MANAGE_SERVER: 1 << 10,
  MANAGE_ROLES: 1 << 11,
  KICK_MEMBERS: 1 << 12,
  BAN_MEMBERS: 1 << 13,
  CREATE_INVITES: 1 << 14,
  MANAGE_WEBHOOKS: 1 << 15,
  ADMINISTRATOR: 1 << 16,
} as const;

export type PermissionKey = keyof typeof Permissions;

export interface TokenPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Express.Request {
  user?: TokenPayload;
}
