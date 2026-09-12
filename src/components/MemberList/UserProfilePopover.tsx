import React from 'react';
import { User, Role } from '../../types';
import { ShieldCheck, Lock, MessageSquare, VolumeX, UserMinus } from 'lucide-react';

interface UserProfilePopoverProps {
  user: User;
  roles: Role[];
  currentUser: User;
  onClose: () => void;
  onAssignRole: (userId: string, roleId: string) => void;
  onRemoveRole: (userId: string, roleId: string) => void;
  onKickMember?: (userId: string) => void;
  onMuteMember?: (userId: string) => void;
}

export const UserProfilePopover: React.FC<UserProfilePopoverProps> = ({
  user,
  roles,
  currentUser,
  onClose,
  onAssignRole,
  onRemoveRole,
  onKickMember,
  onMuteMember,
}) => {
  const isAdmin = currentUser.roles?.includes('role-admin');
  const userRoles = roles.filter((r) => user.roles?.includes(r.id));
  const availableRoles = roles.filter((r) => !user.roles?.includes(r.id) && r.id !== 'role-member');

  return (
    <div
      id={`user-profile-modal-${user.id}`}
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1118] w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Banner */}
        <div
          className="h-24 bg-gradient-to-r from-indigo-600 to-purple-600 relative"
          style={{
            backgroundImage: user.banner ? `url(${user.banner})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full bg-black/50 hover:bg-black/70 text-white flex items-center justify-center text-xs backdrop-blur-sm border border-white/10"
          >
            ✕
          </button>
        </div>

        {/* Profile Card Body */}
        <div className="p-4 pt-0 relative bg-[#090b10]">
          {/* Avatar with Status */}
          <div className="relative -top-10 mb-[-32px] flex justify-between items-end">
            <div className="relative">
              <img
                src={user.avatar}
                alt={user.name}
                className="w-20 h-20 rounded-full border-4 border-[#090b10] object-cover shadow-xl"
              />
              <div
                className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[#090b10] ${
                  user.status === 'online'
                    ? 'bg-emerald-500'
                    : user.status === 'idle'
                    ? 'bg-amber-400'
                    : user.status === 'dnd'
                    ? 'bg-rose-500'
                    : 'bg-slate-500'
                }`}
              />
            </div>

            {user.isBot && (
              <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider mb-2 flex items-center gap-1 shadow-md shadow-indigo-600/30">
                <ShieldCheck className="w-3 h-3" />
                {user.botType || 'BOT'}
              </span>
            )}
          </div>

          {/* User Name & Tag */}
          <div className="mt-3">
            <h3 className="text-lg font-black text-white leading-tight tracking-tight">{user.name}</h3>
            <span className="text-xs text-slate-400 font-mono">@{user.name.toLowerCase().replace(/\s/g, '')} • #{user.tag}</span>
          </div>

          {/* Custom Status */}
          {user.customStatus && (
            <div className="mt-2.5 text-xs text-slate-300 bg-[#141722] px-3 py-1.5 rounded-xl border border-white/[0.06]">
              {user.customStatus}
            </div>
          )}

          <div className="h-[1px] bg-white/[0.06] my-3" />

          {/* About Me */}
          {user.bio && (
            <div className="mb-3">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Sobre Mim
              </span>
              <p className="text-xs text-slate-300 leading-relaxed font-normal">{user.bio}</p>
            </div>
          )}

          {/* Roles Chips */}
          <div className="mb-3">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
              Cargos ({userRoles.length})
            </span>
            <div className="flex flex-wrap gap-1.5">
              {userRoles.map((role) => (
                <span
                  key={role.id}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-0.5 rounded-lg font-medium border"
                  style={{
                    backgroundColor: `${role.color}15`,
                    borderColor: `${role.color}40`,
                    color: role.color,
                  }}
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: role.color }} />
                  <span>{role.name}</span>
                  {isAdmin && (
                    <button
                      onClick={() => onRemoveRole(user.id, role.id)}
                      className="hover:opacity-100 opacity-60 ml-0.5 hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </span>
              ))}
            </div>

            {/* Admin Add Role Picker */}
            {isAdmin && availableRoles.length > 0 && (
              <div className="mt-2 flex items-center gap-1.5">
                <select
                  id="select-add-user-role"
                  onChange={(e) => {
                    if (e.target.value) {
                      onAssignRole(user.id, e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="bg-[#141722] text-xs text-slate-300 px-2.5 py-1.5 rounded-xl border border-white/[0.08] focus:outline-none w-full"
                  defaultValue=""
                >
                  <option value="" disabled>+ Atribuir Cargo Granular...</option>
                  {availableRoles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Quick Actions (Direct Message, Moderate) */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/[0.06]">
            <button
              onClick={() => onClose()}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Conversar</span>
            </button>

            {isAdmin && user.id !== currentUser.id && (
              <>
                <button
                  onClick={() => onMuteMember && onMuteMember(user.id)}
                  title="Silenciar Membro"
                  className="p-2 bg-[#141722] hover:bg-white/[0.08] text-slate-300 rounded-xl transition-colors border border-white/[0.06]"
                >
                  <VolumeX className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onKickMember && onKickMember(user.id)}
                  title="Expulsar do Servidor"
                  className="p-2 bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white rounded-xl transition-colors border border-rose-500/20"
                >
                  <UserMinus className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
