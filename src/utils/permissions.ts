import { Permission, Role, Server, User } from '../types';

export function getUserRoles(user: User | null | undefined, server: Server | null | undefined): Role[] {
  if (!user || !server || !server.roles) return [];
  const memberRoles = user.roles || [];
  return server.roles.filter((r) => memberRoles.includes(r.id));
}

export function hasPermission(
  user: User | null | undefined,
  server: Server | null | undefined,
  permission: Permission
): boolean {
  if (!user || !server) return false;

  // Server owner has absolute bypass authority
  if (user.id === server.ownerId) {
    return true;
  }

  const userRoles = getUserRoles(user, server);

  // Administrator permission grants all permissions
  if (userRoles.some((r) => r.permissions && r.permissions.includes(Permission.ADMINISTRATOR))) {
    return true;
  }

  // Check specific permission across assigned roles
  if (userRoles.some((r) => r.permissions && r.permissions.includes(permission))) {
    return true;
  }

  // Default baseline permissions granted to server members
  const defaultMemberPermissions: Permission[] = [
    Permission.SEND_MESSAGES,
    Permission.ATTACH_FILES,
    Permission.CONNECT_VOICE,
    Permission.SPEAK,
    Permission.STREAM_VIDEO,
  ];

  if (defaultMemberPermissions.includes(permission)) {
    const isMember =
      (server.members || []).some((m) => m.id === user.id) ||
      (server.memberIds || []).includes(user.id) ||
      server.id === 'server-braza-community' ||
      server.isPublic === true;
    return isMember;
  }

  return false;
}
