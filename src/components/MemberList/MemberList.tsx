import React, { useState } from 'react';
import { User, Role } from '../../types';
import { ShieldCheck, Crown, X } from 'lucide-react';
import { UserProfilePopover } from './UserProfilePopover';

interface MemberListProps {
  members: User[];
  roles: Role[];
  currentUser: User;
  onAssignRole: (userId: string, roleId: string) => void;
  onRemoveRole: (userId: string, roleId: string) => void;
  onKickMember?: (userId: string) => void;
  onClose?: () => void;
}

export const MemberList: React.FC<MemberListProps> = ({
  members,
  roles,
  currentUser,
  onAssignRole,
  onRemoveRole,
  onKickMember,
  onClose,
}) => {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Group members by hoist roles, preserving role order
  const hoistRoles = [...roles].sort((a, b) => a.position - b.position);

  // Separate members into groups
  const renderedUserIds = new Set<string>();
  const roleGroups: { role: Role; members: User[] }[] = [];

  hoistRoles.forEach((role) => {
    const groupMembers = members.filter(
      (m) => m.roles?.includes(role.id) && !renderedUserIds.has(m.id)
    );
    if (groupMembers.length > 0) {
      roleGroups.push({ role, members: groupMembers });
      groupMembers.forEach((m) => renderedUserIds.add(m.id));
    }
  });

  // Remaining online/offline members
  const unassigned = members.filter((m) => !renderedUserIds.has(m.id));
  if (unassigned.length > 0) {
    roleGroups.push({
      role: {
        id: 'role-everyone',
        name: 'Membros',
        color: '#94a3b8',
        hoist: false,
        position: 99,
        permissions: [],
      },
      members: unassigned,
    });
  }

  return (
    <div
      id="sidebar-member-list"
      className="w-64 md:w-60 bg-[#0c0e15] flex flex-col p-3 gap-4 shrink-0 select-none overflow-y-auto no-scrollbar border-l border-white/[0.06] h-full"
    >
      {/* Mobile Top Dismiss Bar */}
      {onClose && (
        <div className="md:hidden flex items-center justify-between pb-2 border-b border-white/[0.06] px-1">
          <span className="text-xs font-bold text-white">Membros da Sala ({members.length})</span>
          <button
            onClick={onClose}
            title="Fechar"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {roleGroups.map(({ role, members: groupMembers }) => (
        <div key={role.id} className="space-y-1">
          {/* Role Header */}
          <div className="text-[11px] font-bold tracking-wider uppercase px-2 py-0.5 text-slate-400 flex items-center justify-between">
            <span>
              {role.name} — {groupMembers.length}
            </span>
          </div>

          {/* Members in Role */}
          {groupMembers.map((member) => {
            const isOwner = member.id === 'user-me-1';

            return (
              <button
                key={member.id}
                id={`btn-member-${member.id}`}
                onClick={() => setSelectedUser(member)}
                className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.04] transition-colors group text-left cursor-pointer"
              >
                {/* Avatar with Status Dot */}
                <div className="relative shrink-0">
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="w-8 h-8 rounded-full object-cover border border-white/[0.1]"
                  />
                  <div
                    className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0c0e15] ${
                      member.status === 'online'
                        ? 'bg-emerald-500'
                        : member.status === 'idle'
                        ? 'bg-amber-400'
                        : member.status === 'dnd'
                        ? 'bg-rose-500'
                        : 'bg-slate-500'
                    }`}
                  />
                </div>

                {/* Member Name + Role color + Badges */}
                <div className="flex flex-col min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="text-xs font-bold truncate group-hover:text-white transition-colors"
                      style={{ color: role.color !== '#94a3b8' ? role.color : '#e2e8f0' }}
                    >
                      {member.name}
                    </span>

                    {isOwner && (
                      <Crown className="w-3 h-3 text-amber-400 shrink-0" title="Dono do Servidor" />
                    )}

                    {member.isBot && (
                      <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider shrink-0 shadow-sm">
                        {member.botType || 'BOT'}
                      </span>
                    )}
                  </div>

                  {member.customStatus && (
                    <span className="text-[10px] text-slate-400 truncate">{member.customStatus}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ))}

      {/* User Profile Modal when clicked */}
      {selectedUser && (
        <UserProfilePopover
          user={selectedUser}
          roles={roles}
          currentUser={currentUser}
          onClose={() => setSelectedUser(null)}
          onAssignRole={onAssignRole}
          onRemoveRole={onRemoveRole}
          onKickMember={onKickMember}
        />
      )}
    </div>
  );
};
