import { describe, it, expect } from '@jest/globals';
import { Permissions } from '../src/types';

describe('Permissions System', () => {
  it('should have unique permission bit flags', () => {
    const values = Object.values(Permissions);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('should correctly check individual permissions', () => {
    const userPerms = Permissions.VIEW_CHANNELS | Permissions.SEND_MESSAGES | Permissions.ADD_REACTIONS;

    expect(userPerms & Permissions.VIEW_CHANNELS).toBeTruthy();
    expect(userPerms & Permissions.SEND_MESSAGES).toBeTruthy();
    expect(userPerms & Permissions.ADD_REACTIONS).toBeTruthy();
    expect(userPerms & Permissions.MANAGE_CHANNELS).toBeFalsy();
    expect(userPerms & Permissions.BAN_MEMBERS).toBeFalsy();
    expect(userPerms & Permissions.ADMINISTRATOR).toBeFalsy();
  });

  it('should correctly combine permissions', () => {
    const modPerms = Permissions.VIEW_CHANNELS | Permissions.SEND_MESSAGES |
      Permissions.MANAGE_MESSAGES | Permissions.KICK_MEMBERS;

    expect(modPerms & Permissions.MANAGE_MESSAGES).toBeTruthy();
    expect(modPerms & Permissions.KICK_MEMBERS).toBeTruthy();
    expect(modPerms & Permissions.BAN_MEMBERS).toBeFalsy();
  });

  it('should handle administrator permission', () => {
    const adminPerms = Permissions.ADMINISTRATOR;

    // Admin flag itself is set
    expect(adminPerms & Permissions.ADMINISTRATOR).toBeTruthy();
    // Other flags are NOT set (admin check needs to be done at application level)
    expect(adminPerms & Permissions.SEND_MESSAGES).toBeFalsy();
  });

  it('should allow removing permissions', () => {
    let perms = Permissions.VIEW_CHANNELS | Permissions.SEND_MESSAGES | Permissions.KICK_MEMBERS;

    // Remove KICK_MEMBERS
    perms = perms & ~Permissions.KICK_MEMBERS;

    expect(perms & Permissions.VIEW_CHANNELS).toBeTruthy();
    expect(perms & Permissions.SEND_MESSAGES).toBeTruthy();
    expect(perms & Permissions.KICK_MEMBERS).toBeFalsy();
  });

  it('should have all expected permission types', () => {
    const expectedKeys = [
      'VIEW_CHANNELS', 'SEND_MESSAGES', 'MANAGE_MESSAGES', 'ATTACH_FILES',
      'ADD_REACTIONS', 'CONNECT_VOICE', 'SPEAK', 'MUTE_MEMBERS',
      'DEAFEN_MEMBERS', 'MANAGE_CHANNELS', 'MANAGE_SERVER', 'MANAGE_ROLES',
      'KICK_MEMBERS', 'BAN_MEMBERS', 'CREATE_INVITES', 'MANAGE_WEBHOOKS',
      'ADMINISTRATOR',
    ];

    expectedKeys.forEach(key => {
      expect(Permissions).toHaveProperty(key);
    });
  });
});
