export interface User {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  banner_url: string | null;
  bio: string | null;
  status: 'online' | 'idle' | 'dnd' | 'offline';
  custom_status: string | null;
  theme: 'dark' | 'light' | 'super' | 'glass' | 'midnight' | 'sunset' | 'forest' | 'sakura';
  pronouns: string | null;
  location: string | null;
  birthday: string | null;
  social_links: string | null;
  profile_color: string;
  profile_visibility: 'public' | 'friends' | 'private';
  email_verified: boolean;
  created_at: string;
}

export interface Server {
  id: string;
  name: string;
  icon_url: string | null;
  owner_id: string;
  description: string | null;
  member_count: number;
  unread_count: number;
  created_at: string;
}

export interface Channel {
  id: string;
  server_id: string;
  name: string;
  type: 'text' | 'voice';
  topic: string | null;
  position: number;
  category_id: string | null;
  created_at: string;
}

export interface Category {
  id: string;
  server_id: string;
  name: string;
  position: number;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  sender_badges?: string;
  content: string;
  attachments: string[];
  edited: boolean;
  pinned: boolean;
  reactions: Reaction[];
  created_at: string;
  updated_at: string;
}

export interface Reaction {
  emoji: string;
  user_id: string;
  username: string;
}

export interface Friend {
  id: string;
  friend_id: string;
  friend_username: string;
  friend_avatar: string | null;
  friend_status: string;
  status: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  is_group: boolean;
  name: string | null;
  icon_url: string | null;
  owner_id: string | null;
  description: string | null;
  participants: { id: string; username: string; avatar_url: string | null; status: string }[];
  last_message: { content: string; sender_id: string; created_at: string } | null;
  unread_count: number;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar: string | null;
  sender_badges?: string;
  content: string;
  attachments: string[];
  edited: boolean | number;
  pinned: boolean | number;
  reactions: Array<{ emoji: string; user_id: string; username: string }>;
  created_at: string;
}

export interface Role {
  id: string;
  server_id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
}

export interface ServerMember {
  id: string;
  member_id: string;
  username: string;
  avatar_url: string | null;
  status: string;
  custom_status: string | null;
  badges?: string;
  nickname: string | null;
  joined_at: string;
  role_ids: string[];
}

export interface Invite {
  id: string;
  code: string;
  server_id: string;
  creator_name: string;
  max_uses: number | null;
  uses: number;
  expires_at: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: string;
  user_name: string;
  action: string;
  target_type: string;
  target_id: string;
  changes: Record<string, unknown>;
  created_at: string;
}
