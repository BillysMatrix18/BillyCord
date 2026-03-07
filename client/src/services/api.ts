import axios from 'axios';

let API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Update the API base URL to point to a different server.
 * Called when user connects via the ConnectionScreen.
 * @param serverUrl - e.g. "http://203.45.67.89:3001"
 */
export function setApiBaseUrl(serverUrl: string) {
  API_BASE = `${serverUrl}/api`;
  api.defaults.baseURL = API_BASE;
}

// Attach token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle token refresh on 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
          const { data } = await axios.post(`${api.defaults.baseURL}/auth/refresh`, { refreshToken });
          localStorage.setItem('accessToken', data.accessToken);
          localStorage.setItem('refreshToken', data.refreshToken);
          originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
          return api(originalRequest);
        }
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  register: (data: { username: string; email: string; password: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  getUserProfile: (userId: string) => api.get(`/auth/users/${userId}`),
  updateProfile: (data: Record<string, string>) => api.patch('/auth/profile', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.post('/auth/change-password', data),
};

// Servers
export const serverApi = {
  getAll: () => api.get('/servers'),
  get: (serverId: string) => api.get(`/servers/${serverId}`),
  create: (data: { name: string; description?: string }) => api.post('/servers', data),
  update: (serverId: string, data: Record<string, string>) => api.patch(`/servers/${serverId}`, data),
  delete: (serverId: string) => api.delete(`/servers/${serverId}`),
  join: (code: string) => api.post(`/servers/join/${code}`),
  leave: (serverId: string) => api.post(`/servers/${serverId}/leave`),
  getMembers: (serverId: string) => api.get(`/servers/${serverId}/members`),
  kickMember: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/members/${userId}/kick`),
  banMember: (serverId: string, userId: string, reason?: string) =>
    api.post(`/servers/${serverId}/members/${userId}/ban`, { reason }),
  unbanMember: (serverId: string, userId: string) =>
    api.delete(`/servers/${serverId}/members/${userId}/ban`),
  getBans: (serverId: string) => api.get(`/servers/${serverId}/bans`),
  getAuditLogs: (serverId: string) => api.get(`/servers/${serverId}/audit-logs`),
  markRead: (serverId: string) => api.post(`/servers/${serverId}/read`),
};

// Channels
export const channelApi = {
  create: (serverId: string, data: { name: string; type: string; topic?: string }) =>
    api.post(`/servers/${serverId}/channels`, data),
  update: (serverId: string, channelId: string, data: Record<string, unknown>) =>
    api.patch(`/servers/${serverId}/channels/${channelId}`, data),
  delete: (serverId: string, channelId: string) =>
    api.delete(`/servers/${serverId}/channels/${channelId}`),
  createCategory: (serverId: string, name: string) =>
    api.post(`/servers/${serverId}/categories`, { name }),
};

// Messages
export const messageApi = {
  getMessages: (channelId: string, before?: string) =>
    api.get(`/channels/${channelId}/messages`, { params: { before, limit: 50 } }),
  send: (channelId: string, content: string, attachments?: string[]) =>
    api.post(`/channels/${channelId}/messages`, { content, attachments }),
  sendWithFiles: (channelId: string, content: string, files: File[]) => {
    const formData = new FormData();
    formData.append('content', content);
    files.forEach(f => formData.append('files', f));
    return api.post(`/channels/${channelId}/messages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  update: (messageId: string, content: string) =>
    api.patch(`/messages/${messageId}`, { content }),
  delete: (messageId: string) => api.delete(`/messages/${messageId}`),
  addReaction: (messageId: string, emoji: string) =>
    api.post(`/messages/${messageId}/reactions`, { emoji }),
  removeReaction: (messageId: string, emoji: string) =>
    api.delete(`/messages/${messageId}/reactions/${emoji}`),
  pin: (messageId: string) => api.post(`/messages/${messageId}/pin`),
  unpin: (messageId: string) => api.delete(`/messages/${messageId}/pin`),
  getPinned: (channelId: string) => api.get(`/channels/${channelId}/pins`),
};

// Friends
export const friendApi = {
  getAll: () => api.get('/friends'),
  getPending: () => api.get('/friends/pending'),
  getStatus: (userId: string) => api.get(`/friends/status/${userId}`),
  sendRequest: (username: string) => api.post('/friends/request', { username }),
  respond: (requestId: string, action: 'accept' | 'decline') =>
    api.post(`/friends/respond/${requestId}`, { action }),
  remove: (friendId: string) => api.delete(`/friends/${friendId}`),
  block: (userId: string) => api.post(`/friends/block/${userId}`),
};

// DMs & Group Chats
export const dmApi = {
  getConversations: () => api.get('/dm/conversations'),
  createConversation: (participantIds: string[], isGroup?: boolean, name?: string) =>
    api.post('/dm/conversations', { participantIds, isGroup, name }),
  getMessages: (conversationId: string, before?: string) =>
    api.get(`/dm/conversations/${conversationId}/messages`, { params: { before } }),
  sendMessage: (conversationId: string, content: string) =>
    api.post(`/dm/conversations/${conversationId}/messages`, { content }),
  sendWithFiles: (conversationId: string, content: string, files: File[]) => {
    const formData = new FormData();
    formData.append('content', content);
    files.forEach(f => formData.append('files', f));
    return api.post(`/dm/conversations/${conversationId}/messages`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  // DM message management
  editMessage: (messageId: string, content: string) =>
    api.patch(`/dm/messages/${messageId}`, { content }),
  deleteMessage: (messageId: string) =>
    api.delete(`/dm/messages/${messageId}`),
  addReaction: (messageId: string, emoji: string) =>
    api.post(`/dm/messages/${messageId}/reactions`, { emoji }),
  removeReaction: (messageId: string, emoji: string) =>
    api.delete(`/dm/messages/${messageId}/reactions/${emoji}`),
  pinMessage: (messageId: string) =>
    api.post(`/dm/messages/${messageId}/pin`),
  unpinMessage: (messageId: string) =>
    api.delete(`/dm/messages/${messageId}/pin`),
  // Group chat management
  updateConversation: (conversationId: string, data: { name?: string; icon_url?: string; description?: string }) =>
    api.patch(`/dm/conversations/${conversationId}`, data),
  addMember: (conversationId: string, userId: string) =>
    api.post(`/dm/conversations/${conversationId}/members`, { userId }),
  removeMember: (conversationId: string, memberId: string) =>
    api.delete(`/dm/conversations/${conversationId}/members/${memberId}`),
  leaveGroup: (conversationId: string) =>
    api.post(`/dm/conversations/${conversationId}/leave`),
  getMembers: (conversationId: string) =>
    api.get(`/dm/conversations/${conversationId}/members`),
  markRead: (conversationId: string) =>
    api.post(`/dm/conversations/${conversationId}/read`),
};

// Roles
export const roleApi = {
  create: (serverId: string, data: { name: string; color?: string; permissions?: number }) =>
    api.post(`/servers/${serverId}/roles`, data),
  update: (serverId: string, roleId: string, data: Record<string, unknown>) =>
    api.patch(`/servers/${serverId}/roles/${roleId}`, data),
  delete: (serverId: string, roleId: string) =>
    api.delete(`/servers/${serverId}/roles/${roleId}`),
  assign: (serverId: string, memberId: string, roleId: string) =>
    api.post(`/servers/${serverId}/members/${memberId}/roles/${roleId}`),
  remove: (serverId: string, memberId: string, roleId: string) =>
    api.delete(`/servers/${serverId}/members/${memberId}/roles/${roleId}`),
};

// Invites
export const inviteApi = {
  create: (serverId: string, data?: { max_uses?: number; expires_in_hours?: number }) =>
    api.post(`/servers/${serverId}/invites`, data || {}),
  getAll: (serverId: string) => api.get(`/servers/${serverId}/invites`),
  delete: (serverId: string, inviteId: string) =>
    api.delete(`/servers/${serverId}/invites/${inviteId}`),
};

export default api;
