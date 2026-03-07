import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createServer, getServers, getServer, updateServer, deleteServer,
  joinServer, leaveServer, getMembers, kickMember, banMember, unbanMember,
  getBans, getAuditLogs, markServerRead,
} from '../controllers/servers';
import { createChannel, getChannels, updateChannel, deleteChannel, createCategory, reorderChannels } from '../controllers/channels';
import { createRole, getRoles, updateRole, deleteRole, assignRole, removeRole } from '../controllers/roles';
import { createInvite, getInvites, deleteInvite } from '../controllers/invites';

const router = Router();

// Servers
router.post('/', authenticate, createServer);
router.get('/', authenticate, getServers);
router.get('/:serverId', authenticate, getServer);
router.patch('/:serverId', authenticate, updateServer);
router.delete('/:serverId', authenticate, deleteServer);

// Join/Leave
router.post('/join/:code', authenticate, joinServer);
router.post('/:serverId/leave', authenticate, leaveServer);
router.post('/:serverId/read', authenticate, markServerRead);

// Members
router.get('/:serverId/members', authenticate, getMembers);
router.delete('/:serverId/members/:userId/kick', authenticate, kickMember);
router.post('/:serverId/members/:userId/ban', authenticate, banMember);
router.delete('/:serverId/members/:userId/ban', authenticate, unbanMember);
router.get('/:serverId/bans', authenticate, getBans);

// Channels
router.post('/:serverId/channels', authenticate, createChannel);
router.get('/:serverId/channels', authenticate, getChannels);
router.patch('/:serverId/channels/:channelId', authenticate, updateChannel);
router.delete('/:serverId/channels/:channelId', authenticate, deleteChannel);
router.put('/:serverId/channels/reorder', authenticate, reorderChannels);
router.post('/:serverId/categories', authenticate, createCategory);

// Roles
router.post('/:serverId/roles', authenticate, createRole);
router.get('/:serverId/roles', authenticate, getRoles);
router.patch('/:serverId/roles/:roleId', authenticate, updateRole);
router.delete('/:serverId/roles/:roleId', authenticate, deleteRole);
router.post('/:serverId/members/:memberId/roles/:roleId', authenticate, assignRole);
router.delete('/:serverId/members/:memberId/roles/:roleId', authenticate, removeRole);

// Invites
router.post('/:serverId/invites', authenticate, createInvite);
router.get('/:serverId/invites', authenticate, getInvites);
router.delete('/:serverId/invites/:inviteId', authenticate, deleteInvite);

// Audit logs
router.get('/:serverId/audit-logs', authenticate, getAuditLogs);

export default router;
