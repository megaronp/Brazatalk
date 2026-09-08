import React, { useState } from 'react';
import { Server, Channel, VoiceParticipant, User } from '../../types';
import {
  Hash,
  Volume2,
  Megaphone,
  Radio,
  ChevronDown,
  ChevronRight,
  Plus,
  Settings,
  ShieldCheck,
  Lock,
  Tv,
  Mic,
  MicOff,
  Headphones,
  UserPlus,
  Sliders,
  VolumeX,
  Video,
  Sparkles,
} from 'lucide-react';

interface ChannelNavProps {
  server: Server | null;
  activeChannelId: string;
  onSelectChannel: (channel: Channel) => void;
  voiceParticipants: VoiceParticipant[];
  currentVoiceChannelId: string | null;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  onOpenServerSettings: () => void;
  onOpenCreateChannel: (categoryId?: string) => void;
  onOpenInvite?: (channelId?: string) => void;
  currentUser: User;
  onOpenUserSettings: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  directMessageUsers?: User[];
}

export const ChannelNav: React.FC<ChannelNavProps> = ({
  server,
  activeChannelId,
  onSelectChannel,
  voiceParticipants,
  currentVoiceChannelId,
  onJoinVoice,
  onOpenServerSettings,
  onOpenCreateChannel,
  onOpenInvite,
  currentUser,
  onOpenUserSettings,
  onToggleMute,
  onToggleDeafen,
  isMuted,
  isDeafened,
  directMessageUsers,
}) => {
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [showServerMenu, setShowServerMenu] = useState(false);

  const toggleCategory = (catId: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const getChannelIcon = (type: Channel['type'], isPrivate?: boolean) => {
    if (isPrivate) {
      return <Lock className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0" />;
    }
    switch (type) {
      case 'voice':
        return <Volume2 className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0" />;
      case 'announcement':
        return <Megaphone className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0" />;
      case 'stage':
        return <Radio className="w-4 h-4 text-pink-400 shrink-0" />;
      case 'project':
        return <Sparkles className="w-4 h-4 text-indigo-400 group-hover:text-indigo-300 shrink-0" />;
      default:
        return <Hash className="w-4 h-4 text-slate-400 group-hover:text-slate-200 shrink-0" />;
    }
  };

  if (!server) {
    const dmList = directMessageUsers && directMessageUsers.length > 0 ? directMessageUsers : [
      {
        id: 'user-elena',
        name: 'Elena Rostova',
        avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
        status: 'online' as const,
        customStatus: 'Desenvolvendo Braza Talk WebRTC',
      },
      {
        id: 'user-lucas',
        name: 'Lucas Silva',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
        status: 'online' as const,
        customStatus: 'Testando áudio HD SFU',
      },
      {
        id: 'user-sofia',
        name: 'Sofia Chen',
        avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
        status: 'idle' as const,
        customStatus: 'Em reunião no canal de voz',
      },
    ];

    return (
      <div id="sidebar-dms" className="w-60 bg-[#0c0e15] border-r border-white/[0.06] flex flex-col justify-between shrink-0 select-none">
        <div className="p-3 border-b border-white/[0.06]">
          <div className="flex items-center justify-between px-1 mb-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-300">Mensagens Diretas</span>
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.5 rounded font-mono font-bold">
              <ShieldCheck className="w-3 h-3" /> E2EE
            </span>
          </div>
          <div className="bg-[#141722] text-slate-400 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between border border-white/[0.04]">
            <span>Amigos Privados</span>
            <kbd className="bg-[#1c202e] text-[10px] px-1.5 py-0.5 rounded border border-white/[0.08] text-slate-300 font-mono">AES-256</kbd>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          <div className="text-[11px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider flex items-center justify-between">
            <span>Conversas Criptografadas</span>
            <span className="text-[10px] font-mono text-slate-500">{dmList.length}</span>
          </div>
          {dmList.map((u) => {
            const dmChannelId = `dm-${[currentUser.id, u.id].sort().join('_')}`;
            const isActive = activeChannelId === dmChannelId;
            return (
              <button
                key={u.id}
                id={`btn-dm-user-${u.id}`}
                onClick={() => {
                  onSelectChannel({
                    id: dmChannelId,
                    serverId: '',
                    name: u.name,
                    type: 'text',
                    isE2EE: true,
                    isPrivate: true,
                    topic: `Conversa direta criptografada ponta a ponta (AES-GCM-256) com ${u.name}`,
                  });
                }}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl transition-all text-sm font-medium text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600/20 text-white border-l-2 border-indigo-500 shadow-sm'
                    : 'hover:bg-white/[0.06] text-slate-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <img
                      src={u.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.id}`}
                      alt={u.name}
                      className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-white/10"
                    />
                    <div
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0c0e15] ${
                        u.status === 'online'
                          ? 'bg-emerald-500'
                          : u.status === 'idle'
                          ? 'bg-amber-500'
                          : 'bg-slate-500'
                      }`}
                    />
                  </div>
                  <div className="truncate min-w-0">
                    <div className="truncate font-semibold text-xs leading-tight">{u.name}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">
                      {u.customStatus || 'Protegido por E2EE'}
                    </div>
                  </div>
                </div>
                <div title="Criptografia de ponta a ponta AES-GCM" className="text-emerald-400/80 shrink-0 ml-1">
                  <Lock className="w-3 h-3" />
                </div>
              </button>
            );
          })}
        </div>

        {/* User profile footer */}
        <UserProfileFooter
          currentUser={currentUser}
          onOpenUserSettings={onOpenUserSettings}
          onToggleMute={onToggleMute}
          onToggleDeafen={onToggleDeafen}
          isMuted={isMuted}
          isDeafened={isDeafened}
        />
      </div>
    );
  }

  return (
    <div id="sidebar-channels" className="w-60 bg-[#0c0e15] border-r border-white/[0.06] flex flex-col justify-between shrink-0 select-none relative">
      {/* Server Header & Dropdown Menu */}
      <div className="relative">
        <button
          id="btn-server-dropdown-menu"
          onClick={() => setShowServerMenu(!showServerMenu)}
          className="w-full h-12 px-4 border-b border-white/[0.06] flex items-center justify-between font-bold text-white text-sm hover:bg-white/[0.04] transition-colors shadow-sm"
        >
          <span className="truncate tracking-tight">{server.name}</span>
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showServerMenu ? 'rotate-180 text-white' : ''}`} />
        </button>

        {/* Server Dropdown Popover */}
        {showServerMenu && (
          <div
            id="popover-server-menu"
            className="absolute top-13 left-2 right-2 bg-[#12151f]/95 backdrop-blur-xl border border-white/10 rounded-xl p-1.5 shadow-2xl z-50 flex flex-col gap-1 text-xs"
          >
            <button
              id="btn-menu-server-settings"
              onClick={() => {
                setShowServerMenu(false);
                onOpenServerSettings();
              }}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Configurações do Servidor</span>
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-menu-create-channel"
              onClick={() => {
                setShowServerMenu(false);
                onOpenCreateChannel();
              }}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg text-slate-300 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              <span>Criar Canal</span>
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-menu-invite-members"
              onClick={() => {
                setShowServerMenu(false);
                if (onOpenInvite) onOpenInvite();
              }}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg text-indigo-400 hover:bg-indigo-600 hover:text-white transition-colors font-medium cursor-pointer"
            >
              <span>Convidar Pessoas</span>
              <UserPlus className="w-3.5 h-3.5" />
            </button>
            <div className="h-[1px] bg-white/[0.06] my-0.5" />
            <button
              id="btn-menu-sound-effects"
              onClick={() => {
                setShowServerMenu(false);
                onOpenServerSettings();
              }}
              className="flex items-center justify-between px-2.5 py-2 rounded-lg text-slate-300 hover:bg-white/[0.08] hover:text-white transition-colors"
            >
              <span>Efeitos Sonoros Customizados</span>
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Categories & Channels Scroll Area */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-3.5 no-scrollbar">
        {server.categories.map((category) => {
          const isCollapsed = collapsedCategories[category.id];
          const channelsInCategory = server.channels.filter((c) => c.categoryId === category.id);

          return (
            <div key={category.id} className="space-y-0.5">
              {/* Category Header */}
              <div className="flex items-center justify-between px-1 py-1 text-slate-400 hover:text-slate-200 group">
                <button
                  id={`btn-category-${category.id}`}
                  onClick={() => toggleCategory(category.id)}
                  className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase flex-1 text-left"
                >
                  {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  <span className="truncate">{category.name}</span>
                </button>
                <button
                  id={`btn-add-channel-cat-${category.id}`}
                  onClick={() => onOpenCreateChannel(category.id)}
                  title="Criar Canal nesta categoria"
                  className="opacity-0 group-hover:opacity-100 hover:text-white transition-opacity p-0.5 rounded hover:bg-white/[0.08]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Channels List */}
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {channelsInCategory.map((channel) => {
                    const isActive = activeChannelId === channel.id;
                    const isVoice = channel.type === 'voice' || channel.type === 'stage';
                    const hasVoiceParticipants = isVoice || channel.type === 'project';
                    const participantsInChannel = voiceParticipants.filter((p) => p.channelId === channel.id);

                    return (
                      <div key={channel.id} className="flex flex-col">
                        <div className="relative group/chan flex items-center">
                          <button
                            id={`btn-channel-${channel.id}`}
                            onClick={() => {
                              onSelectChannel(channel);
                              if (isVoice && currentVoiceChannelId !== channel.id) {
                                onJoinVoice(channel.id);
                              }
                            }}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg transition-all text-sm font-medium ${
                              isActive
                                ? 'bg-indigo-600/20 text-white border border-indigo-500/30 shadow-sm font-semibold'
                                : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {getChannelIcon(channel.type, channel.isPrivate)}
                              <span className="truncate">{channel.name}</span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {channel.unreadCount && channel.unreadCount > 0 ? (
                                <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                                  {channel.unreadCount}
                                </span>
                              ) : null}
                            </div>
                          </button>

                          {onOpenInvite && (
                            <button
                              id={`btn-invite-channel-${channel.id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenInvite(channel.id);
                              }}
                              title={`Convidar amigos para #${channel.name}`}
                              className="absolute right-2 opacity-0 group-hover/chan:opacity-100 hover:text-white text-slate-400 p-1 rounded hover:bg-white/10 transition-opacity cursor-pointer z-10"
                            >
                              <UserPlus className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Connected Voice Participants List under voice/project channels */}
                        {hasVoiceParticipants && participantsInChannel.length > 0 && (
                          <div className="pl-6 pr-2 py-1 space-y-1">
                            {participantsInChannel.map((participant) => (
                              <div
                                key={participant.userId}
                                className={`flex items-center justify-between py-1 px-2 rounded-lg transition-colors text-xs ${
                                  participant.isSpeaking
                                    ? 'bg-emerald-500/10 text-emerald-300 font-medium'
                                    : 'hover:bg-white/[0.04] text-slate-300'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="relative">
                                    <img
                                      src={participant.userAvatar}
                                      alt={participant.userName}
                                      className={`w-5 h-5 rounded-full object-cover transition-all ${
                                        participant.isSpeaking
                                          ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-[#0d1017] shadow-[0_0_10px_rgba(52,211,153,0.85)] scale-105'
                                          : 'opacity-85'
                                      }`}
                                    />
                                    {participant.isSpeaking && (
                                      <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full ring-1 ring-black animate-ping" />
                                    )}
                                  </div>
                                  <span className="truncate text-xs font-medium">{participant.userName}</span>
                                </div>

                                <div className="flex items-center gap-1.5 text-slate-400 shrink-0">
                                  {participant.isScreenSharing && (
                                    <span
                                      title="Transmitindo tela ao vivo"
                                      className="flex items-center gap-0.5 text-[9px] bg-indigo-600 text-white px-1.5 py-0.5 rounded font-bold shadow-sm"
                                    >
                                      <Tv className="w-2.5 h-2.5" /> AO VIVO
                                    </span>
                                  )}

                                  {participant.isCameraOn && (
                                    <span title="Câmera ligada">
                                      <Video className="w-3 h-3 text-cyan-400" />
                                    </span>
                                  )}

                                  {participant.isSpeaking ? (
                                    <span title="Falando agora">
                                      <Volume2 className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                                    </span>
                                  ) : participant.isMuted ? (
                                    <span title="Microfone silenciado (Mutado)">
                                      <MicOff className="w-3 h-3 text-rose-400" />
                                    </span>
                                  ) : (
                                    <span title="Microfone aberto">
                                      <Mic className="w-3 h-3 text-emerald-400/70" />
                                    </span>
                                  )}

                                  {participant.isDeafened && (
                                    <span title="Áudio desativado / bloqueado (Surdo)">
                                      <VolumeX className="w-3 h-3 text-amber-400" />
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* User profile and voice state footer */}
      <UserProfileFooter
        currentUser={currentUser}
        onOpenUserSettings={onOpenUserSettings}
        onToggleMute={onToggleMute}
        onToggleDeafen={onToggleDeafen}
        isMuted={isMuted}
        isDeafened={isDeafened}
      />
    </div>
  );
};

interface UserProfileFooterProps {
  currentUser: User;
  onOpenUserSettings: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  isMuted: boolean;
  isDeafened: boolean;
}

const UserProfileFooter: React.FC<UserProfileFooterProps> = ({
  currentUser,
  onOpenUserSettings,
  onToggleMute,
  onToggleDeafen,
  isMuted,
  isDeafened,
}) => {
  return (
    <div
      id="user-profile-bar"
      className="h-[54px] bg-[#090b10] border-t border-white/[0.06] px-2.5 flex items-center justify-between shrink-0 select-none z-20"
    >
      {/* User Info Button */}
      <button
        id="btn-user-avatar-profile"
        onClick={onOpenUserSettings}
        className="flex items-center gap-2 p-1 rounded-lg hover:bg-white/[0.06] transition-colors max-w-[125px] text-left"
      >
        <div className="relative shrink-0">
          <img
            src={currentUser.avatar}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover border border-white/[0.1]"
          />
          <div
            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#090b10] ${
              currentUser.status === 'online'
                ? 'bg-emerald-500'
                : currentUser.status === 'idle'
                ? 'bg-amber-400'
                : currentUser.status === 'dnd'
                ? 'bg-rose-500'
                : 'bg-slate-500'
            }`}
          />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-bold text-slate-200 truncate">{currentUser.name}</span>
          <span className="text-[10px] text-slate-400 font-mono truncate">#{currentUser.tag}</span>
        </div>
      </button>

      {/* Controls: Mute, Deafen, Settings */}
      <div className="flex items-center gap-0.5">
        <button
          id="btn-toggle-mic-mute"
          onClick={onToggleMute}
          title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
          className={`p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors ${
            isMuted ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          id="btn-toggle-audio-deafen"
          onClick={onToggleDeafen}
          title={isDeafened ? 'Desativar Áudio' : 'Desensurdecer'}
          className={`p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors ${
            isDeafened ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>

        <button
          id="btn-open-user-settings"
          onClick={onOpenUserSettings}
          title="Configurações de Usuário"
          className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
