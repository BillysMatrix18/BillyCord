import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppDispatch';
import { fetchServer, fetchServers } from '../../store/serverSlice';
import { setChannels, setCategories } from '../../store/channelSlice';
import { serverApi, channelApi, roleApi, inviteApi, friendApi, dmApi } from '../../services/api';
import { IconX, IconPlus, IconTrash, IconEdit, IconHash, IconVolume, IconSettings, IconUsers, IconShield } from '../common/Icons';
import { Channel, Role, Invite, ServerMember } from '../../types';

// Permission bit flags (mirrored from server/src/types/index.ts)
const Permissions: Record<string, number> = {
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
};

const PERMISSION_LABELS: Record<string, string> = {
  VIEW_CHANNELS: 'View Channels',
  SEND_MESSAGES: 'Send Messages',
  MANAGE_MESSAGES: 'Manage Messages',
  ATTACH_FILES: 'Attach Files',
  ADD_REACTIONS: 'Add Reactions',
  CONNECT_VOICE: 'Connect to Voice',
  SPEAK: 'Speak in Voice',
  MUTE_MEMBERS: 'Mute Members',
  DEAFEN_MEMBERS: 'Deafen Members',
  MANAGE_CHANNELS: 'Manage Channels',
  MANAGE_SERVER: 'Manage Server',
  MANAGE_ROLES: 'Manage Roles',
  KICK_MEMBERS: 'Kick Members',
  BAN_MEMBERS: 'Ban Members',
  CREATE_INVITES: 'Create Invites',
  MANAGE_WEBHOOKS: 'Manage Webhooks',
  ADMINISTRATOR: 'Administrator',
};

const PERMISSION_CATEGORIES: Record<string, string[]> = {
  'General': ['VIEW_CHANNELS', 'MANAGE_CHANNELS', 'MANAGE_SERVER', 'MANAGE_ROLES', 'MANAGE_WEBHOOKS', 'CREATE_INVITES'],
  'Text': ['SEND_MESSAGES', 'MANAGE_MESSAGES', 'ATTACH_FILES', 'ADD_REACTIONS'],
  'Voice': ['CONNECT_VOICE', 'SPEAK', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS'],
  'Moderation': ['KICK_MEMBERS', 'BAN_MEMBERS', 'ADMINISTRATOR'],
};

interface ServerSettingsModalProps {
  serverId: string;
  onClose: () => void;
}

type Tab = 'overview' | 'channels' | 'members' | 'roles' | 'invites' | 'bans';

export default function ServerSettingsModal({ serverId, onClose }: ServerSettingsModalProps) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { currentServer, members, roles } = useAppSelector((state) => state.servers);
  const { channels, categories } = useAppSelector((state) => state.channels);
  const { user } = useAppSelector((state) => state.auth);
  const [tab, setTab] = useState<Tab>('overview');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // General
  const [serverName, setServerName] = useState('');
  const [serverDesc, setServerDesc] = useState('');
  const [serverIcon, setServerIcon] = useState('');

  // Channel creation
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState<'text' | 'voice'>('text');
  const [editingChannel, setEditingChannel] = useState<string | null>(null);
  const [editChannelName, setEditChannelName] = useState('');

  // Category creation
  const [newCategoryName, setNewCategoryName] = useState('');

  // Icon upload
  const iconFileRef = useRef<HTMLInputElement>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);

  // Role creation
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleColor, setNewRoleColor] = useState('#3B82F6');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRoleColor, setEditRoleColor] = useState('');
  const [editRolePermissions, setEditRolePermissions] = useState(0);

  // Member role assignment
  const [roleDropdownMember, setRoleDropdownMember] = useState<string | null>(null);

  // Invites
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteLoading, setInviteLoading] = useState(false);

  // Invite friends
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [friends, setFriends] = useState<Array<{ friend_id: string; friend_username: string; friend_avatar: string | null }>>([]);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [sendingInvites, setSendingInvites] = useState(false);

  // Bans
  const [bans, setBans] = useState<Array<{ user_id: string; username: string; reason: string | null }>>([]);

  const isOwner = currentServer?.owner_id === user?.id;

  useEffect(() => {
    if (currentServer) {
      setServerName(currentServer.name);
      setServerDesc(currentServer.description || '');
      setServerIcon(currentServer.icon_url || '');
    }
  }, [currentServer]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const refreshServer = useCallback(async () => {
    const result = await dispatch(fetchServer(serverId));
    if (fetchServer.fulfilled.match(result)) {
      dispatch(setChannels(result.payload.channels));
      dispatch(setCategories(result.payload.categories));
    }
  }, [serverId, dispatch]);

  // Load invites when tab changes
  useEffect(() => {
    if (tab === 'invites') {
      setInviteLoading(true);
      inviteApi.getAll(serverId).then(res => {
        setInvites(res.data.invites || []);
      }).catch(() => {}).finally(() => setInviteLoading(false));
    }
    if (tab === 'members' || tab === 'bans') {
      serverApi.getBans(serverId).then(res => {
        setBans(res.data.bans || []);
      }).catch(() => {});
    }
  }, [tab, serverId]);

  // General tab handlers
  const handleSaveGeneral = async () => {
    setSaving(true);
    try {
      await serverApi.update(serverId, {
        name: serverName,
        description: serverDesc,
        icon_url: serverIcon,
      });
      await refreshServer();
      dispatch(fetchServers());
      showToast('Server settings saved!');
    } catch {
      showToast('Failed to save settings');
    }
    setSaving(false);
  };

  // Icon upload handler
  const handleIconUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const res = await serverApi.uploadIcon(serverId, file);
      setServerIcon(res.data.icon_url);
      showToast('Icon uploaded! Click Save Changes to apply.');
    } catch {
      showToast('Failed to upload icon');
    }
    setUploadingIcon(false);
    // Reset file input so the same file can be re-selected
    if (iconFileRef.current) iconFileRef.current.value = '';
  };

  // Channel handlers
  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return;
    // Auto-convert spaces to hyphens and lowercase (like Discord)
    const sanitizedName = newChannelName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
    if (!sanitizedName) return;
    try {
      await channelApi.create(serverId, { name: sanitizedName, type: newChannelType });
      setNewChannelName('');
      await refreshServer();
      showToast('Channel created!');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Failed to create channel';
      showToast(msg);
    }
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm('Delete this channel? This cannot be undone.')) return;
    try {
      await channelApi.delete(serverId, channelId);
      await refreshServer();
      showToast('Channel deleted');
    } catch {
      showToast('Failed to delete channel');
    }
  };

  const handleRenameChannel = async (channelId: string) => {
    if (!editChannelName.trim()) return;
    try {
      await channelApi.update(serverId, channelId, { name: editChannelName.trim() });
      setEditingChannel(null);
      await refreshServer();
      showToast('Channel renamed');
    } catch {
      showToast('Failed to rename channel');
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) return;
    try {
      await channelApi.createCategory(serverId, newCategoryName.trim());
      setNewCategoryName('');
      await refreshServer();
      showToast('Category created!');
    } catch {
      showToast('Failed to create category');
    }
  };

  // Role handlers
  const handleCreateRole = async () => {
    if (!newRoleName.trim()) return;
    try {
      await roleApi.create(serverId, { name: newRoleName.trim(), color: newRoleColor });
      setNewRoleName('');
      setNewRoleColor('#3B82F6');
      await refreshServer();
      showToast('Role created!');
    } catch {
      showToast('Failed to create role');
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!confirm('Delete this role?')) return;
    try {
      await roleApi.delete(serverId, roleId);
      await refreshServer();
      showToast('Role deleted');
    } catch {
      showToast('Failed to delete role');
    }
  };

  const handleUpdateRole = async (roleId: string) => {
    try {
      await roleApi.update(serverId, roleId, { name: editRoleName, color: editRoleColor, permissions: editRolePermissions });
      setEditingRole(null);
      await refreshServer();
      showToast('Role updated');
    } catch {
      showToast('Failed to update role');
    }
  };

  // Permission toggle helper
  const togglePermission = (perm: number) => {
    setEditRolePermissions(prev => prev ^ perm);
  };

  // Role assignment handlers
  const handleAssignRole = async (memberId: string, roleId: string) => {
    try {
      await roleApi.assign(serverId, memberId, roleId);
      await refreshServer();
      showToast('Role assigned');
    } catch {
      showToast('Failed to assign role');
    }
  };

  const handleRemoveRole = async (memberId: string, roleId: string) => {
    try {
      await roleApi.remove(serverId, memberId, roleId);
      await refreshServer();
      showToast('Role removed');
    } catch {
      showToast('Failed to remove role');
    }
  };

  // Member handlers
  const handleKick = async (userId: string) => {
    if (!confirm('Kick this member?')) return;
    try {
      await serverApi.kickMember(serverId, userId);
      await refreshServer();
      showToast('Member kicked');
    } catch {
      showToast('Failed to kick member');
    }
  };

  const handleBan = async (userId: string) => {
    const reason = prompt('Ban reason (optional):');
    try {
      await serverApi.banMember(serverId, userId, reason || undefined);
      await refreshServer();
      showToast('Member banned');
    } catch {
      showToast('Failed to ban member');
    }
  };

  const handleUnban = async (userId: string) => {
    try {
      await serverApi.unbanMember(serverId, userId);
      setBans(prev => prev.filter(b => b.user_id !== userId));
      showToast('User unbanned');
    } catch {
      showToast('Failed to unban');
    }
  };

  // Invite handlers
  const handleCreateInvite = async () => {
    try {
      const res = await inviteApi.create(serverId);
      setInvites(prev => [res.data.invite, ...prev]);
      showToast('Invite created!');
    } catch {
      showToast('Failed to create invite');
    }
  };

  const handleDeleteInvite = async (inviteId: string) => {
    try {
      await inviteApi.delete(serverId, inviteId);
      setInvites(prev => prev.filter(i => i.id !== inviteId));
      showToast('Invite revoked');
    } catch {
      showToast('Failed to revoke invite');
    }
  };

  const handleCopyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    showToast('Invite code copied!');
  };

  // Invite friends handlers
  const handleOpenInviteFriends = async () => {
    try {
      const res = await friendApi.getAll();
      setFriends(res.data.friends || []);
      setSelectedFriends(new Set());
      setShowInviteFriends(true);
    } catch {
      showToast('Failed to load friends');
    }
  };

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => {
      const next = new Set(prev);
      next.has(friendId) ? next.delete(friendId) : next.add(friendId);
      return next;
    });
  };

  const handleSendFriendInvites = async () => {
    if (selectedFriends.size === 0) return;
    setSendingInvites(true);
    try {
      // Create an invite code
      const inviteRes = await inviteApi.create(serverId);
      const code = inviteRes.data.invite.code;
      const serverName = currentServer?.name || 'a server';

      // Send DM to each selected friend
      for (const friendId of selectedFriends) {
        try {
          const convRes = await dmApi.createConversation([friendId]);
          const convId = convRes.data.conversation.id;
          await dmApi.sendMessage(convId,
            `You've been invited to join **${serverName}**! Use invite code: \`${code}\``
          );
        } catch { /* skip failed sends */ }
      }

      showToast(`Invites sent to ${selectedFriends.size} friend(s)!`);
      setShowInviteFriends(false);
    } catch {
      showToast('Failed to send invites');
    }
    setSendingInvites(false);
  };

  // Delete server
  const handleDeleteServer = async () => {
    if (!confirm(`Delete "${currentServer?.name}"? This CANNOT be undone.`)) return;
    if (!confirm('Are you really sure? All data will be permanently deleted.')) return;
    try {
      await serverApi.delete(serverId);
      dispatch(fetchServers());
      navigate('/channels/@me');
      onClose();
    } catch {
      showToast('Failed to delete server');
    }
  };

  const sidebarItemStyle = (t: Tab): React.CSSProperties => ({
    padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
    background: tab === t ? 'var(--bg-modifier-selected)' : 'transparent',
    color: tab === t ? 'var(--interactive-active)' : 'var(--interactive-normal)',
    border: 'none', textAlign: 'left', width: '100%', fontWeight: tab === t ? 600 : 400,
    display: 'block', marginBottom: 2,
  });

  const sectionLabel: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: 'var(--text-muted)', padding: '6px 10px 4px', marginTop: 8,
  };

  return createPortal(
    <>
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9000,
      }} onClick={onClose} />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9001,
        display: 'flex',
      }}>
        {/* Sidebar */}
        <div style={{
          width: 232, background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column',
          padding: '60px 8px 20px 20px', overflowY: 'auto', flexShrink: 0,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)', padding: '0 10px 8px' }}>
            {currentServer?.name?.toUpperCase() || 'SERVER'}
          </div>
          <button style={sidebarItemStyle('overview')} onClick={() => setTab('overview')}>Server Profile</button>

          <div style={sectionLabel}>CHANNELS</div>
          <button style={sidebarItemStyle('channels')} onClick={() => setTab('channels')}>Channels</button>

          <div style={sectionLabel}>PEOPLE</div>
          <button style={sidebarItemStyle('members')} onClick={() => setTab('members')}>Members</button>
          <button style={sidebarItemStyle('roles')} onClick={() => setTab('roles')}>Roles</button>
          <button style={sidebarItemStyle('invites')} onClick={() => setTab('invites')}>Invites</button>

          <div style={sectionLabel}>MODERATION</div>
          <button style={sidebarItemStyle('bans')} onClick={() => setTab('bans')}>Bans</button>

          {isOwner && (
            <>
              <div style={{ borderTop: '1px solid var(--bg-quaternary)', margin: '12px 10px 8px' }} />
              <button onClick={handleDeleteServer}
                style={{
                  padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 14,
                  background: 'transparent', color: 'var(--red)', border: 'none',
                  textAlign: 'left', width: '100%', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                <IconTrash size={14} /> Delete Server
              </button>
            </>
          )}
        </div>

        {/* Content area */}
        <div style={{
          flex: 1, background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Close button */}
          <button onClick={onClose} style={{
            position: 'absolute', top: 16, right: 16, background: 'var(--bg-tertiary)',
            border: '2px solid var(--bg-quaternary)', color: 'var(--text-muted)', cursor: 'pointer',
            width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 10,
          }}>
            <IconX size={18} />
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', position: 'absolute', top: 54, right: 16, zIndex: 10 }}>ESC</div>

          {/* Scrollable content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '60px 40px 40px 40px', maxWidth: 740 }}>
          {/* OVERVIEW (Server Profile) TAB */}
          {tab === 'overview' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Server Profile</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 24px' }}>
                Customise how your server appears in invite links and server discovery.
              </p>

              <div style={{ display: 'flex', gap: 32 }}>
                {/* Left: Form fields */}
                <div style={{ flex: 1 }}>
                  <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Name</label>
                <input className="form-input" value={serverName} onChange={e => setServerName(e.target.value)}
                  disabled={!isOwner} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }} />
              </div>
              <div style={{ borderTop: '1px solid var(--bg-quaternary)', margin: '20px 0' }} />

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Icon</label>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>We recommend an image of at least 512x512.</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  {/* Icon preview */}
                  <div style={{
                    width: 80, height: 80, borderRadius: '50%', background: 'var(--bg-tertiary)',
                    border: '2px dashed var(--bg-quaternary)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                  }}>
                    {serverIcon ? (
                      <img src={serverIcon} alt="Server icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-muted)' }}>
                        {serverName?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                    <input
                      ref={iconFileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      style={{ display: 'none' }}
                      onChange={handleIconUpload}
                      disabled={!isOwner}
                    />
                    <button
                      onClick={() => iconFileRef.current?.click()}
                      disabled={!isOwner || uploadingIcon}
                      style={{
                        padding: '8px 16px', borderRadius: 6, background: 'var(--brand-color)',
                        color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer',
                        fontSize: 13, opacity: (!isOwner || uploadingIcon) ? 0.5 : 1,
                      }}>
                      {uploadingIcon ? 'Uploading...' : 'Upload Image'}
                    </button>
                    <input className="form-input" value={serverIcon} onChange={e => setServerIcon(e.target.value)}
                      disabled={!isOwner} placeholder="Or enter URL manually..."
                      style={{ width: '100%', padding: '6px 10px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 12 }} />
                    {serverIcon && isOwner && (
                      <button onClick={() => setServerIcon('')}
                        style={{ padding: '4px 10px', borderRadius: 4, background: 'transparent', color: 'var(--red)', border: '1px solid var(--red)', fontSize: 11, cursor: 'pointer', alignSelf: 'flex-start' }}>
                        Remove Icon
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--bg-quaternary)', margin: '20px 0' }} />

              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Description</label>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>How did your server get started? Why should people join?</p>
                <textarea value={serverDesc} onChange={e => setServerDesc(e.target.value)}
                  disabled={!isOwner} placeholder="Tell people about your server..."
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }} />
              </div>

              </div>

                {/* Right: Server preview card */}
                <div style={{ width: 240, flexShrink: 0 }}>
                  <div style={{
                    borderRadius: 8, overflow: 'hidden', background: 'var(--bg-tertiary)',
                    border: '1px solid var(--bg-quaternary)',
                  }}>
                    {/* Preview banner */}
                    <div style={{
                      height: 80, background: serverIcon ? `url(${serverIcon}) center/cover` : 'linear-gradient(135deg, var(--brand-color), var(--brand-hover))',
                    }} />
                    <div style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: -28 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-secondary)',
                          border: '3px solid var(--bg-tertiary)', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', overflow: 'hidden', flexShrink: 0,
                        }}>
                          {serverIcon ? (
                            <img src={serverIcon} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-muted)' }}>
                              {serverName?.[0]?.toUpperCase() || '?'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{serverName || 'Server Name'}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          {members.length} Member{members.length !== 1 ? 's' : ''}
                        </div>
                        {serverDesc && (
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8, lineHeight: 1.4 }}>
                            {serverDesc.length > 100 ? serverDesc.slice(0, 100) + '...' : serverDesc}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {isOwner && (
                <div style={{ marginTop: 24 }}>
                  <button className="btn btn-primary" onClick={handleSaveGeneral} disabled={saving}
                    style={{ padding: '10px 24px', borderRadius: 6, background: 'var(--brand-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* CHANNELS TAB */}
          {tab === 'channels' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Channels</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                Create and manage text and voice channels for your server.
              </p>
              {isOwner && (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input className="form-input" value={newChannelName} onChange={e => setNewChannelName(e.target.value)}
                      placeholder="New channel name" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateChannel(); }} />
                    <select value={newChannelType} onChange={e => setNewChannelType(e.target.value as 'text' | 'voice')}
                      style={{ padding: '8px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}>
                      <option value="text">Text</option>
                      <option value="voice">Voice</option>
                    </select>
                    <button onClick={handleCreateChannel}
                      style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--brand-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <IconPlus size={14} /> Create
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                    <input className="form-input" value={newCategoryName} onChange={e => setNewCategoryName(e.target.value)}
                      placeholder="New category name" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateCategory(); }} />
                    <button onClick={handleCreateCategory}
                      style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--bg-quaternary)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <IconPlus size={14} /> Category
                    </button>
                  </div>
                </>
              )}

              {categories.map(cat => (
                <div key={cat.id} style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 6, padding: '0 4px' }}>
                    {cat.name}
                  </div>
                  {channels.filter(c => c.category_id === cat.id).map(ch => (
                    <ChannelRow key={ch.id} channel={ch} isOwner={isOwner}
                      editing={editingChannel === ch.id} editName={editChannelName}
                      onStartEdit={() => { setEditingChannel(ch.id); setEditChannelName(ch.name); }}
                      onChangeName={setEditChannelName}
                      onSaveEdit={() => handleRenameChannel(ch.id)}
                      onCancelEdit={() => setEditingChannel(null)}
                      onDelete={() => handleDeleteChannel(ch.id)} />
                  ))}
                </div>
              ))}

              {/* Uncategorized */}
              {channels.filter(c => !c.category_id).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 6 }}>
                    Uncategorized
                  </div>
                  {channels.filter(c => !c.category_id).map(ch => (
                    <ChannelRow key={ch.id} channel={ch} isOwner={isOwner}
                      editing={editingChannel === ch.id} editName={editChannelName}
                      onStartEdit={() => { setEditingChannel(ch.id); setEditChannelName(ch.name); }}
                      onChangeName={setEditChannelName}
                      onSaveEdit={() => handleRenameChannel(ch.id)}
                      onCancelEdit={() => setEditingChannel(null)}
                      onDelete={() => handleDeleteChannel(ch.id)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MEMBERS TAB */}
          {tab === 'members' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Members</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                {members.length} member{members.length !== 1 ? 's' : ''} in this server
              </p>
              {members.map(m => {
                const memberRoles = (m.role_ids || []).map(rid => roles.find(r => r.id === rid)).filter(Boolean) as Role[];
                const assignableRoles = roles.filter(r => r.name !== '@everyone' && !(m.role_ids || []).includes(r.id));
                return (
                  <div key={m.id} style={{
                    padding: '8px 12px', borderRadius: 6, marginBottom: 4,
                    background: roleDropdownMember === m.member_id ? 'var(--bg-tertiary)' : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', flexShrink: 0,
                      }}>
                        {m.avatar_url ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : m.username[0]?.toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{m.username}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{m.status || 'offline'}</div>
                      </div>
                      {/* Role tags */}
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                        {memberRoles.map(role => (
                          <span key={role.id} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                            background: (role.color || '#99AAB5') + '22',
                            color: role.color || 'var(--text-secondary)',
                            border: `1px solid ${(role.color || '#99AAB5')}44`,
                          }}>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: role.color || '#99AAB5' }} />
                            {role.name}
                            {isOwner && (
                              <button onClick={() => handleRemoveRole(m.member_id, role.id)} title="Remove role"
                                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1, opacity: 0.7 }}>
                                x
                              </button>
                            )}
                          </span>
                        ))}
                        {isOwner && assignableRoles.length > 0 && (
                          <button
                            onClick={() => setRoleDropdownMember(prev => prev === m.member_id ? null : m.member_id)}
                            title="Add role"
                            style={{
                              width: 22, height: 22, borderRadius: '50%', border: '1px dashed var(--text-muted)',
                              background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, lineHeight: 1,
                            }}>
                            +
                          </button>
                        )}
                      </div>
                      {isOwner && m.id !== user?.id && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => handleKick(m.id)} title="Kick"
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--text-muted)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer' }}>
                            Kick
                          </button>
                          <button onClick={() => handleBan(m.id)} title="Ban"
                            style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--red)', background: 'transparent', color: 'var(--red)', fontSize: 11, cursor: 'pointer' }}>
                            Ban
                          </button>
                        </div>
                      )}
                    </div>
                    {/* Role assignment dropdown */}
                    {roleDropdownMember === m.member_id && isOwner && (
                      <div style={{
                        marginTop: 8, marginLeft: 44, padding: '8px', background: 'var(--bg-primary)',
                        borderRadius: 6, border: '1px solid var(--bg-quaternary)',
                      }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
                          Assign Role
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {assignableRoles.map(role => (
                            <button key={role.id}
                              onClick={async () => { await handleAssignRole(m.member_id, role.id); setRoleDropdownMember(null); }}
                              style={{
                                padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 500,
                                border: `1px solid ${(role.color || '#99AAB5')}66`,
                                background: 'transparent', color: role.color || 'var(--text-secondary)',
                                cursor: 'pointer',
                              }}>
                              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: role.color || '#99AAB5', marginRight: 4 }} />
                              {role.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          )}

          {/* BANS TAB */}
          {tab === 'bans' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Bans</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                {bans.length} banned user{bans.length !== 1 ? 's' : ''}
              </p>
              {bans.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40, fontSize: 14 }}>
                  No banned users
                </div>
              )}
              {bans.map(b => (
                <div key={b.user_id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 6, marginBottom: 4, background: 'var(--bg-tertiary)',
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%', background: 'var(--red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 13, fontWeight: 600, color: '#fff', flexShrink: 0, opacity: 0.7,
                  }}>
                    {b.username?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{b.username}</div>
                    {b.reason && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Reason: {b.reason}</div>}
                  </div>
                  {isOwner && (
                    <button onClick={() => handleUnban(b.user_id)}
                      style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--green)', background: 'transparent', color: 'var(--green)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                      Unban
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ROLES TAB */}
          {tab === 'roles' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Roles</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                Use roles to group your server members and assign permissions.
              </p>

              {/* Search + Create */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
                <div style={{ flex: 1, position: 'relative' }}>
                  <input className="form-input" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                    placeholder={isOwner ? 'New role name...' : 'Search Roles'}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 6, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}
                    onKeyDown={e => { if (e.key === 'Enter' && isOwner) handleCreateRole(); }} />
                </div>
                {isOwner && (
                  <>
                    <input type="color" value={newRoleColor} onChange={e => setNewRoleColor(e.target.value)}
                      style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--bg-quaternary)', cursor: 'pointer', padding: 2 }} />
                    <button onClick={handleCreateRole}
                      style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--brand-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13 }}>
                      Create Role
                    </button>
                  </>
                )}
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Members use the colour of their highest role they have on this list.
              </p>

              {/* Roles list header */}
              <div style={{
                display: 'flex', alignItems: 'center', padding: '8px 12px',
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
                color: 'var(--text-muted)', borderBottom: '1px solid var(--bg-quaternary)',
              }}>
                <span style={{ flex: 1 }}>ROLES - {roles.length}</span>
                <span style={{ width: 80, textAlign: 'center' }}>MEMBERS</span>
                <span style={{ width: 80 }}></span>
              </div>

              {/* Roles list */}
              {roles.map(r => {
                const memberCount = members.filter(m => (m.role_ids || []).includes(r.id)).length;
                return (
                <div key={r.id}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px',
                    borderBottom: '1px solid var(--bg-quaternary)',
                    background: editingRole === r.id ? 'var(--bg-modifier-hover)' : 'transparent',
                  }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', background: r.color || 'var(--text-muted)', flexShrink: 0 }} />
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{r.name}</div>
                    <div style={{ width: 80, textAlign: 'center', fontSize: 13, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      {memberCount} <IconUsers size={14} />
                    </div>
                    <div style={{ width: 80, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {isOwner && r.name !== '@everyone' && (
                        <>
                          <button onClick={() => {
                            if (editingRole === r.id) {
                              setEditingRole(null);
                            } else {
                              setEditingRole(r.id); setEditRoleName(r.name); setEditRoleColor(r.color || '#3B82F6'); setEditRolePermissions(r.permissions || 0);
                            }
                          }} title="Edit"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                            <IconEdit size={16} />
                          </button>
                          <button onClick={() => handleDeleteRole(r.id)} title="Delete"
                            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
                            <IconTrash size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {/* Permissions editor */}
                  {editingRole === r.id && (
                    <div style={{
                      padding: '16px 20px', background: 'var(--bg-tertiary)',
                      borderBottom: '1px solid var(--bg-quaternary)',
                    }}>
                      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
                        <input value={editRoleName} onChange={e => setEditRoleName(e.target.value)}
                          placeholder="Role name"
                          style={{ flex: 1, padding: '8px 12px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdateRole(r.id); if (e.key === 'Escape') setEditingRole(null); }} />
                        <input type="color" value={editRoleColor} onChange={e => setEditRoleColor(e.target.value)}
                          style={{ width: 36, height: 36, borderRadius: 6, border: '1px solid var(--bg-quaternary)', cursor: 'pointer', padding: 2 }} />
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: 0.5, marginBottom: 12 }}>
                        Permissions
                      </div>
                      {Object.entries(PERMISSION_CATEGORIES).map(([category, permKeys]) => (
                        <div key={category} style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
                            {category}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px' }}>
                            {permKeys.map(key => {
                              const bit = Permissions[key];
                              const checked = (editRolePermissions & bit) !== 0;
                              return (
                                <label key={key} style={{
                                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                                  padding: '6px 8px', borderRadius: 4, fontSize: 13, color: 'var(--text-primary)',
                                  background: checked ? 'rgba(88,101,242,0.1)' : 'transparent',
                                }}>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => togglePermission(bit)}
                                    style={{ accentColor: 'var(--brand-color)', cursor: 'pointer', width: 16, height: 16 }}
                                  />
                                  {PERMISSION_LABELS[key] || key}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button onClick={() => handleUpdateRole(r.id)}
                          style={{ padding: '8px 20px', borderRadius: 6, background: 'var(--green)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Save
                        </button>
                        <button onClick={() => setEditingRole(null)}
                          style={{ padding: '8px 20px', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--bg-quaternary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* INVITES TAB */}
          {tab === 'invites' && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>Invites</h2>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>
                Manage invite links for your server.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button onClick={handleCreateInvite}
                  style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--brand-color)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                  <IconPlus size={14} /> Create Invite
                </button>
                <button onClick={handleOpenInviteFriends}
                  style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--green)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>
                  <IconUsers size={14} /> Invite Friends
                </button>
              </div>

              {inviteLoading && <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Loading...</div>}

              {invites.map(inv => (
                <div key={inv.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                  borderRadius: 6, marginBottom: 4, background: 'var(--bg-tertiary)',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'monospace', color: 'var(--brand-color)' }}>{inv.code}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      Created by {inv.creator_name} &middot; {inv.uses}{inv.max_uses ? `/${inv.max_uses}` : ''} uses
                      {inv.expires_at && ` · Expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <button onClick={() => handleCopyInviteCode(inv.code)}
                    style={{ padding: '4px 10px', borderRadius: 4, background: 'var(--brand-color)', color: '#fff', border: 'none', fontSize: 12, cursor: 'pointer' }}>
                    Copy
                  </button>
                  <button onClick={() => handleDeleteInvite(inv.id)}
                    style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}

              {!inviteLoading && invites.length === 0 && (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                  No active invites. Create one to invite people!
                </div>
              )}
            </div>
          )}
          </div>

          {/* Toast */}
          {toast && (
            <div style={{
              position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
              background: 'var(--brand-color)', color: '#fff', padding: '8px 20px',
              borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 10,
            }}>
              {toast}
            </div>
          )}
        </div>
      </div>

        {/* Invite Friends Modal */}
        {showInviteFriends && (
          <>
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 9100 }}
              onClick={() => setShowInviteFriends(false)} />
            <div style={{
              position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 400, maxHeight: '60vh', background: 'var(--bg-secondary)',
              borderRadius: 12, border: '1px solid var(--bg-quaternary)', zIndex: 9101,
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--bg-quaternary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Invite Friends to {currentServer?.name}</h3>
                <button onClick={() => setShowInviteFriends(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <IconX size={18} />
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
                {friends.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>No friends to invite</div>
                )}
                {friends.map(f => (
                  <div key={f.friend_id}
                    onClick={() => toggleFriendSelection(f.friend_id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                      borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                      background: selectedFriends.has(f.friend_id) ? 'var(--brand-color-transparent, rgba(59,130,246,0.15))' : 'transparent',
                    }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--brand-color)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', flexShrink: 0,
                    }}>
                      {f.friend_avatar ? <img src={f.friend_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.friend_username[0]?.toUpperCase()}
                    </div>
                    <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{f.friend_username}</div>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, border: '2px solid var(--text-muted)',
                      background: selectedFriends.has(f.friend_id) ? 'var(--brand-color)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12,
                    }}>
                      {selectedFriends.has(f.friend_id) && '✓'}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--bg-quaternary)' }}>
                <button onClick={handleSendFriendInvites} disabled={selectedFriends.size === 0 || sendingInvites}
                  style={{
                    width: '100%', padding: '10px', borderRadius: 6, background: 'var(--brand-color)',
                    color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 14,
                    opacity: selectedFriends.size === 0 ? 0.5 : 1,
                  }}>
                  {sendingInvites ? 'Sending...' : `Send Invite${selectedFriends.size > 1 ? 's' : ''} (${selectedFriends.size})`}
                </button>
              </div>
            </div>
          </>
        )}
    </>,
    document.body
  );
}

// Channel row sub-component
function ChannelRow({ channel, isOwner, editing, editName, onStartEdit, onChangeName, onSaveEdit, onCancelEdit, onDelete }: {
  channel: Channel; isOwner: boolean; editing: boolean; editName: string;
  onStartEdit: () => void; onChangeName: (n: string) => void; onSaveEdit: () => void; onCancelEdit: () => void; onDelete: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
      borderRadius: 4, marginBottom: 2,
    }}>
      {channel.type === 'voice' ? <IconVolume size={16} /> : <IconHash size={16} />}
      {editing ? (
        <>
          <input value={editName} onChange={e => onChangeName(e.target.value)}
            style={{ flex: 1, padding: '2px 6px', borderRadius: 4, background: 'var(--bg-tertiary)', border: '1px solid var(--bg-quaternary)', color: 'var(--text-primary)', fontSize: 14 }}
            onKeyDown={e => { if (e.key === 'Enter') onSaveEdit(); if (e.key === 'Escape') onCancelEdit(); }}
            autoFocus />
          <button onClick={onSaveEdit}
            style={{ padding: '2px 8px', borderRadius: 4, background: 'var(--green)', color: '#fff', border: 'none', fontSize: 11, cursor: 'pointer' }}>Save</button>
          <button onClick={onCancelEdit}
            style={{ padding: '2px 8px', borderRadius: 4, background: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 11, cursor: 'pointer' }}>Cancel</button>
        </>
      ) : (
        <>
          <span style={{ flex: 1, fontSize: 14 }}>{channel.name}</span>
          {isOwner && (
            <div style={{ display: 'flex', gap: 4 }}>
              <button onClick={onStartEdit} title="Edit" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <IconEdit size={14} />
              </button>
              <button onClick={onDelete} title="Delete" style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer' }}>
                <IconTrash size={14} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
