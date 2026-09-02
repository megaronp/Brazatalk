import React, { useState, useMemo } from 'react';
import { User, Role } from '../../types';
import { ShieldCheck, Crown, X, Search, Users } from 'lucide-react';
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
  const [searchQuery, setSearchQuery] = useState('');

  // Filter members by search query
  const filteredMembers = useMemo(() => {
    if (!searchQuery.trim()) return members;
    const q = searchQuery.toLowerCase();
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        (m.customStatus && m.customStatus.toLowerCase().includes(q))
    );
  }, [members, searchQuery]);

  // Group members by hoist roles, preserving role order
  const hoistRoles = useMemo(
    () => [...roles].sort((a, b) => a.position - b.position),
    [roles]
  );

  // Separate filtered members into groups
  const renderedUserIds = new Set<string>();
  const roleGroups: { role: Role; members: User[] }[] = [];

  hoistRoles.forEach((role) => {
    const groupMembers = filteredMembers.filter(
      (m) => m.roles?.includes(role.id) && !renderedUserIds.has(m.id)
    );
    if (groupMembers.length > 0) {
      roleGroups.push({ role, members: groupMembers });
      groupMembers.forEach((m) => renderedUserIds.add(m.id));
    }
  });

  // Remaining online/offline members
  const unassigned = filteredMembers.filter((m) => !renderedUserIds.has(m.id));
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

  const onlineCount = members.filter((m) => m.status === 'online' || m.status === 'dnd' || m.status === 'idle').length;

  return (
    <div
      id="sidebar-member-list"
      className="w-72 sm:w-80 md:w-60 max-w-[85vw] bg-[#0c0e15] flex flex-col p-3 gap-3 shrink-0 select-none overflow-y-auto no-scrollbar border-l border-white/[0.06] h-full shadow-2xl md:shadow-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06] px-1 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-tight">Membros da Sala</h3>
            <p className="text-[10px] text-slate-400">
              <span className="text-emerald-400 font-semibold">{onlineCount} online</span> • {members.length} total
            </p>
          </div>
        </div>

        {onClose && (
          <button
            id="btn-close-member-list-mobile"
            onClick={onClose}
            title="Fechar menu lateral"
            className="p-1.5 rounded-xl bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Member Search Bar */}
      <div className="relative shrink-0">
        <input
          id="input-search-members"
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Buscar membro..."
          className="w-full bg-[#141722] text-xs text-white placeholder-slate-500 rounded-xl px-2.5 py-1.5 pl-8 border border-white/[0.06] focus:border-indigo-500/50 focus:outline-none transition-all"
        />
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500 pointer-events-none" />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Member Groups */}
      <div className="flex-1 space-y-3 overflow-y-auto no-scrollbar">
        {roleGroups.map(({ role, members: groupMembers }) => (
          <div key={role.id} className="space-y-1">
            {/* Role Header */}
            <div className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 text-slate-400 flex items-center justify-between">
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
                  className="w-full min-h-[44px] flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.06] active:bg-white/[0.1] transition-colors group text-left cursor-pointer"
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
                        <span title="Dono do Servidor" className="inline-flex items-center shrink-0">
                          <Crown className="w-3 h-3 text-amber-400" />
                        </span>
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

        {roleGroups.length === 0 && (
          <div className="text-center py-6 text-slate-500 text-xs">
            Nenhum membro encontrado
          </div>
        )}
      </div>

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
