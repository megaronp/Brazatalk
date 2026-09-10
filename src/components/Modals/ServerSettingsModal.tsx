import React, { useState } from 'react';
import { Server, Role, Permission, SoundPack, BotConfig, Channel } from '../../types';
import {
  Shield,
  Bot,
  Volume2,
  FileText,
  Trash2,
  Plus,
  Play,
  Lock,
  Hash,
  Sparkles,
  Settings,
  FolderOpen,
} from 'lucide-react';
import { soundEngine } from '../../services/soundEngine';

interface ServerSettingsModalProps {
  server: Server;
  onClose: () => void;
  onUpdateServer: (updated: Partial<Server>) => void;
  onManageChannel?: (channel: Channel) => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  server,
  onClose,
  onUpdateServer,
  onManageChannel,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'channels' | 'roles' | 'bots' | 'sounds' | 'audit'>('channels');

  // Local editing state
  const [serverName, setServerName] = useState(server.name);
  const [serverDesc, setServerDesc] = useState(server.description);
  const [e2eeEnabled, setE2EEEnabled] = useState(server.e2eeEnabled);

  // Roles State
  const [roles, setRoles] = useState<Role[]>(server.roles);
  const [selectedRoleId, setSelectedRoleId] = useState<string>(roles[0]?.id || '');

  // Bots State
  const [bots, setBots] = useState<BotConfig[]>(server.bots);

  // Sounds State
  const [sounds, setSounds] = useState(server.sounds);

  const selectedRole = roles.find((r) => r.id === selectedRoleId) || roles[0];

  const handleTogglePermission = (perm: Permission) => {
    if (!selectedRole) return;
    const hasPerm = selectedRole.permissions.includes(perm);
    const updatedPermissions = hasPerm
      ? selectedRole.permissions.filter((p) => p !== perm)
      : [...selectedRole.permissions, perm];

    const updatedRoles = roles.map((r) =>
      r.id === selectedRole.id ? { ...r, permissions: updatedPermissions } : r
    );
    setRoles(updatedRoles);
    onUpdateServer({ roles: updatedRoles });
  };

  const handleAddRole = () => {
    const newRole: Role = {
      id: `role-${Date.now()}`,
      name: 'Novo Cargo',
      color: '#6366f1',
      hoist: true,
      position: roles.length + 1,
      permissions: [Permission.SEND_MESSAGES, Permission.CONNECT_VOICE, Permission.SPEAK],
    };
    const updated = [...roles, newRole];
    setRoles(updated);
    setSelectedRoleId(newRole.id);
    onUpdateServer({ roles: updated });
  };

  const handleDeleteRole = (roleId: string) => {
    if (roles.length <= 1) return;
    const updated = roles.filter((r) => r.id !== roleId);
    setRoles(updated);
    setSelectedRoleId(updated[0].id);
    onUpdateServer({ roles: updated });
  };

  const handleUpdateRole = (updates: Partial<Role>) => {
    if (!selectedRole) return;
    const updated = roles.map((r) => (r.id === selectedRole.id ? { ...r, ...updates } : r));
    setRoles(updated);
    onUpdateServer({ roles: updated });
  };

  const handleToggleBot = (botId: string) => {
    const updated = bots.map((b) => (b.id === botId ? { ...b, enabled: !b.enabled } : b));
    setBots(updated);
    onUpdateServer({ bots: updated });
  };

  const handleUpdateSounds = (updates: Partial<typeof sounds>) => {
    const updated = { ...sounds, ...updates };
    setSounds(updated);
    soundEngine.setSoundPack(updated.pack);
    soundEngine.setMasterVolume(updated.volume);
    soundEngine.setToggle('userJoin', updated.userJoinSound);
    soundEngine.setToggle('userLeave', updated.userLeaveSound);
    soundEngine.setToggle('screenShareStart', updated.screenShareStartSound);
    soundEngine.setToggle('screenShareEnd', updated.screenShareEndSound);
    soundEngine.setToggle('streamViewer', updated.streamViewerSound);
    soundEngine.setToggle('message', updated.messageSound);
    soundEngine.setToggle('mention', updated.mentionSound);
    onUpdateServer({ sounds: updated });
  };

  const ALL_PERMISSIONS: { key: Permission; label: string; description: string }[] = [
    { key: Permission.ADMINISTRATOR, label: 'Administrador Total', description: 'Garante todas as permissões e ignora restrições de canais.' },
    { key: Permission.MANAGE_SERVER, label: 'Gerenciar Servidor', description: 'Permite alterar nome, ícone, bots e configurações gerais.' },
    { key: Permission.MANAGE_ROLES, label: 'Gerenciar Cargos', description: 'Permite criar, editar e excluir cargos abaixo deste cargo.' },
    { key: Permission.MANAGE_CHANNELS, label: 'Gerenciar Canais', description: 'Permite criar, editar ou apagar salas de voz e texto.' },
    { key: Permission.MANAGE_MESSAGES, label: 'Gerenciar Mensagens', description: 'Permite apagar ou fixar mensagens de outros usuários.' },
    { key: Permission.KICK_MEMBERS, label: 'Expulsar Membros', description: 'Remove membros que violarem as regras do servidor.' },
    { key: Permission.BAN_MEMBERS, label: 'Banir Membros', description: 'Bane permanentemente contas maliciosas.' },
    { key: Permission.SEND_MESSAGES, label: 'Enviar Mensagens', description: 'Permite conversar e responder em canais de texto.' },
    { key: Permission.ATTACH_FILES, label: 'Anexar Arquivos', description: 'Permite carregar fotos, vídeos e documentos.' },
    { key: Permission.CONNECT_VOICE, label: 'Conectar em Voz', description: 'Permite entrar e escutar em salas de voz e palcos.' },
    { key: Permission.SPEAK, label: 'Falar em Voz', description: 'Permite transmitir áudio via microfone.' },
    { key: Permission.STREAM_VIDEO, label: 'Compartilhar Tela & Vídeo', description: 'Permite transmitir tela 4K ou ligar câmera nas salas.' },
    { key: Permission.MUTE_MEMBERS, label: 'Silenciar Membros', description: 'Permite mutar outros membros na sala de voz.' },
    { key: Permission.DEAFEN_MEMBERS, label: 'Ensardecer Membros', description: 'Permite desativar áudio de outros usuários em voz.' },
    { key: Permission.MENTION_EVERYONE, label: 'Mencionar @everyone', description: 'Permite notificar todos os membros do servidor.' },
    { key: Permission.MANAGE_BOTS, label: 'Gerenciar Bots & IA', description: 'Permite configurar comandos dos bots e prompts de IA.' },
  ];

  return (
    <div
      id="modal-server-settings"
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-6 select-none"
    >
      <div className="bg-[#0f1118] w-full max-w-5xl h-full sm:h-[85vh] rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row animate-in fade-in zoom-in-95 duration-150">
        {/* Left Settings Navigation Sidebar */}
        <div className="w-full md:w-60 bg-[#090b10] p-2.5 sm:p-4 border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-row md:flex-col justify-between items-center md:items-stretch shrink-0 gap-2 overflow-x-auto no-scrollbar">
          <div className="flex flex-row md:flex-col items-center md:items-stretch gap-1 w-full overflow-x-auto no-scrollbar">
            <div className="hidden md:block text-[11px] font-bold text-slate-400 uppercase px-3 py-1.5 tracking-wider">
              {server.name}
            </div>

            <button
              onClick={() => setActiveTab('overview')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'overview' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Visão Geral</span>
            </button>

            <button
              id="tab-btn-server-channels"
              onClick={() => setActiveTab('channels')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'channels' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Hash className="w-4 h-4" />
              <span>Salas & Canais</span>
            </button>

            <button
              onClick={() => setActiveTab('roles')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'roles' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Cargos & Permissões</span>
            </button>

            <button
              onClick={() => setActiveTab('bots')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'bots' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Bot className="w-4 h-4" />
              <span>Bots & Automação</span>
            </button>

            <button
              onClick={() => setActiveTab('sounds')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'sounds' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Efeitos Sonoros</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'audit' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Auditoria</span>
            </button>
          </div>

          <button
            id="btn-close-server-settings-esc"
            onClick={onClose}
            className="py-1.5 px-3 md:py-2.5 md:w-full md:mt-4 bg-[#141722] hover:bg-white/[0.08] text-white text-xs font-semibold rounded-xl border border-white/[0.06] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            Fechar
          </button>
        </div>

        {/* Right Tab Content Container */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto no-scrollbar bg-[#0a0c12]">
          {/* 1. Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Visão Geral do Servidor</h3>
                <p className="text-xs text-slate-400 mt-0.5">Configure as informações públicas e criptografia da comunidade.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Nome do Servidor
                  </label>
                  <input
                    type="text"
                    value={serverName}
                    onChange={(e) => {
                      setServerName(e.target.value);
                      onUpdateServer({ name: e.target.value });
                    }}
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Descrição da Comunidade
                  </label>
                  <textarea
                    rows={3}
                    value={serverDesc}
                    onChange={(e) => {
                      setServerDesc(e.target.value);
                      onUpdateServer({ description: e.target.value });
                    }}
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* E2EE Master Toggle */}
                <div className="bg-[#141722] p-4 rounded-2xl border border-emerald-500/20 flex items-center justify-between shadow-md">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white tracking-tight">Criptografia de Ponta a Ponta (E2EE)</h4>
                      <p className="text-xs text-slate-400">Cifra todas as mensagens e transmissões diretamente nos clientes com AES-GCM 256.</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={e2eeEnabled}
                    onChange={(e) => {
                      setE2EEEnabled(e.target.checked);
                      onUpdateServer({ e2eeEnabled: e.target.checked });
                    }}
                    className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* 1.5. Channels & Rooms Management Tab */}
          {activeTab === 'channels' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Gerenciamento de Salas & Canais</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Altere o nome, configure permissões ou exclua salas e suas dependências.
                </p>
              </div>

              <div className="space-y-4">
                {server.categories.map((category) => {
                  const categoryChannels = server.channels.filter((c) => c.categoryId === category.id);
                  if (categoryChannels.length === 0) return null;

                  return (
                    <div key={category.id} className="p-4 bg-[#121520] rounded-2xl border border-white/[0.06] space-y-3">
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                        <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{category.name}</span>
                        <span className="text-[10px] text-slate-500 font-normal lowercase">
                          ({categoryChannels.length} {categoryChannels.length === 1 ? 'sala' : 'salas'})
                        </span>
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        {categoryChannels.map((channel) => (
                          <div
                            key={channel.id}
                            className="p-3 bg-[#171a27] rounded-xl border border-white/[0.04] flex items-center justify-between gap-3 hover:border-white/[0.1] transition-all"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="p-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0">
                                {channel.type === 'project' ? (
                                  <Sparkles className="w-4 h-4 text-indigo-400" />
                                ) : channel.type === 'voice' ? (
                                  <Volume2 className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <Hash className="w-4 h-4 text-slate-400" />
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-white text-xs truncate">
                                    #{channel.name}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-300 font-medium">
                                    {channel.type === 'project'
                                      ? 'Sala IA'
                                      : channel.type === 'voice'
                                      ? 'Voz HD'
                                      : 'Texto'}
                                  </span>
                                  {channel.isE2EE && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                                      E2EE
                                    </span>
                                  )}
                                </div>
                                {channel.topic && (
                                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                                    {channel.topic}
                                  </p>
                                )}
                              </div>
                            </div>

                            {onManageChannel && (
                              <button
                                type="button"
                                onClick={() => {
                                  onManageChannel(channel);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 hover:text-white border border-white/[0.08] text-xs font-semibold transition-all cursor-pointer shrink-0"
                              >
                                <Settings className="w-3.5 h-3.5 text-slate-400" />
                                <span>Gerenciar Sala</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Roles & Granular Permissions Tab */}
          {activeTab === 'roles' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-white tracking-tight">Cargos e Permissões Granulares</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Defina privilégios específicos para administradores, moderadores e membros.</p>
                </div>

                <button
                  id="btn-create-new-role"
                  onClick={handleAddRole}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Cargo</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Roles List */}
                <div className="space-y-1.5 bg-[#121520] p-3 rounded-2xl border border-white/[0.06]">
                  <span className="text-[11px] font-bold text-slate-400 uppercase px-2 tracking-wider">
                    Cargos ({roles.length})
                  </span>
                  {roles.map((role) => {
                    const isSelected = role.id === selectedRole?.id;
                    return (
                      <div
                        key={role.id}
                        className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                            : 'hover:bg-white/[0.04] text-slate-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRoleId(role.id)}
                          className="flex-1 flex items-center gap-2 truncate text-left cursor-pointer py-1"
                        >
                          <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                          <span className="truncate">{role.name}</span>
                        </button>
                        {roles.length > 1 && role.id !== 'role-admin' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteRole(role.id);
                            }}
                            title="Excluir cargo"
                            className="text-slate-400 hover:text-rose-400 p-1 rounded hover:bg-white/10 transition-colors cursor-pointer shrink-0 ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Role Edit & Permission Matrix */}
                {selectedRole && (
                  <div className="md:col-span-2 space-y-5 bg-[#121520] p-5 rounded-2xl border border-white/[0.06]">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                          Nome do Cargo
                        </label>
                        <input
                          type="text"
                          value={selectedRole.name}
                          onChange={(e) => handleUpdateRole({ name: e.target.value })}
                          className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase mb-1">
                          Cor do Cargo
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={selectedRole.color}
                            onChange={(e) => handleUpdateRole({ color: e.target.value })}
                            className="w-9 h-9 rounded-xl border-0 bg-transparent cursor-pointer"
                          />
                          <span className="text-xs font-mono text-white">{selectedRole.color}</span>
                        </div>
                      </div>
                    </div>

                    <div className="h-[1px] bg-white/[0.06]" />

                    {/* Permissions Grid */}
                    <div className="space-y-3">
                      <span className="text-xs font-bold text-white uppercase tracking-wider block">
                        Matriz de Permissões Granulares
                      </span>

                      <div className="space-y-2 max-h-72 overflow-y-auto pr-1 no-scrollbar">
                        {ALL_PERMISSIONS.map((perm) => {
                          const isChecked = selectedRole.permissions.includes(perm.key);
                          return (
                            <div
                              key={perm.key}
                              className="flex items-center justify-between p-3 bg-[#141722] rounded-xl border border-white/[0.06] hover:border-white/[0.12] transition-colors"
                            >
                              <div className="pr-4">
                                <h5 className="text-xs font-bold text-white tracking-tight">{perm.label}</h5>
                                <p className="text-[11px] text-slate-400 leading-tight font-normal">{perm.description}</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleTogglePermission(perm.key)}
                                className="w-4 h-4 accent-indigo-600 rounded cursor-pointer shrink-0"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3. Automated Community Bots Tab */}
          {activeTab === 'bots' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Bots de Gerenciamento & Automação</h3>
                <p className="text-xs text-slate-400 mt-0.5">Integre assistentes inteligentes, proteção AutoMod, músicas e gamificação.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bots.map((bot) => (
                  <div
                    key={bot.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      bot.enabled
                        ? 'bg-[#121520] border-indigo-500/50 shadow-lg'
                        : 'bg-[#0f1118] border-white/[0.06] opacity-70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <img src={bot.avatar} alt={bot.name} className="w-10 h-10 rounded-full object-cover border border-white/10" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-bold text-white tracking-tight">{bot.name}</h4>
                            <span className="bg-indigo-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded uppercase shadow-sm">
                              {bot.tag}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-slate-400">Prefixo: {bot.prefix}</span>
                        </div>
                      </div>

                      <input
                        type="checkbox"
                        checked={bot.enabled}
                        onChange={() => handleToggleBot(bot.id)}
                        className="w-5 h-5 accent-emerald-500 rounded cursor-pointer"
                      />
                    </div>

                    <p className="text-xs text-slate-300 mt-3 leading-relaxed font-normal">{bot.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Custom Sound Studio Tab */}
          {activeTab === 'sounds' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Efeitos Sonoros Customizáveis por Evento</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Personalize os sinais acústicos sintetizados para entrada/saída de voz, streams e espectadores.
                </p>
              </div>

              {/* Sound Pack Selector */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3 shadow-md">
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Pacote de Efeitos Sonoros do Servidor
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'braza_classic', name: 'Braza Clássico', desc: 'Sons suaves e harmônicos' },
                    { id: 'cyberpunk', name: 'Cyberpunk Synth', desc: 'Ondas dente-de-serra futuristas' },
                    { id: 'retro_8bit', name: 'Retro 8-Bit', desc: 'Arpeggios de jogos clássicos' },
                    { id: 'minimal_soft', name: 'Minimal Soft', desc: 'Senóides calmas e sutis' },
                  ].map((pk) => (
                    <button
                      key={pk.id}
                      onClick={() => handleUpdateSounds({ pack: pk.id as SoundPack })}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        sounds.pack === pk.id
                          ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                          : 'bg-[#141722] border-white/[0.06] text-slate-300 hover:bg-[#181c2b]'
                      }`}
                    >
                      <span className="text-xs font-bold block">{pk.name}</span>
                      <span className="text-[10px] opacity-75">{pk.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Volume Slider */}
                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-bold text-white">
                    <Volume2 className="w-4 h-4 text-indigo-400" />
                    <span>Volume dos Efeitos ({Math.round(sounds.volume * 100)}%)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={sounds.volume}
                    onChange={(e) => handleUpdateSounds({ volume: parseFloat(e.target.value) })}
                    className="w-48 accent-indigo-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Event Sounds Toggles & Test Buttons */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-white uppercase tracking-wider block mb-2">
                  Eventos com Notificação Sonora
                </span>

                {[
                  {
                    key: 'userJoinSound',
                    label: 'Entrar na Sala de Voz',
                    desc: 'Toca ao conectar a um canal de voz.',
                    test: () => soundEngine.playUserJoin(),
                  },
                  {
                    key: 'userLeaveSound',
                    label: 'Sair da Sala de Voz',
                    desc: 'Toca ao desconectar da sala.',
                    test: () => soundEngine.playUserLeave(),
                  },
                  {
                    key: 'screenShareStartSound',
                    label: 'Compartilhar Tela (Início)',
                    desc: 'Toca quando alguém inicia uma transmissão de tela.',
                    test: () => soundEngine.playScreenShareStart(),
                  },
                  {
                    key: 'screenShareEndSound',
                    label: 'Compartilhar Tela (Fim)',
                    desc: 'Toca quando a transmissão de tela é encerrada.',
                    test: () => soundEngine.playScreenShareEnd(),
                  },
                  {
                    key: 'streamViewerSound',
                    label: 'Espectador Começa a Assistir a Stream',
                    desc: 'Efeito especial de brilho sonoro tocado para o streamer.',
                    test: () => soundEngine.playStreamViewer(),
                  },
                  {
                    key: 'messageSound',
                    label: 'Mensagem Recebida',
                    desc: 'Alerta discreto em canais ativos.',
                    test: () => soundEngine.playMessage(),
                  },
                  {
                    key: 'mentionSound',
                    label: 'Menção Direta ou @everyone',
                    desc: 'Sinal sonoro prioritário para mensagens diretas.',
                    test: () => soundEngine.playMention(),
                  },
                ].map((item) => {
                  const isEnabled = sounds[item.key as keyof typeof sounds] as boolean;
                  return (
                    <div
                      key={item.key}
                      className="p-3.5 bg-[#121520] rounded-2xl border border-white/[0.06] flex items-center justify-between"
                    >
                      <div>
                        <h5 className="text-xs font-bold text-white tracking-tight">{item.label}</h5>
                        <p className="text-[11px] text-slate-400 font-normal">{item.desc}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <button
                          onClick={item.test}
                          title="Testar este som"
                          className="px-3 py-1 bg-[#141722] hover:bg-white/[0.08] text-indigo-400 hover:text-white rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors border border-white/[0.06] cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Testar Som</span>
                        </button>

                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(e) => handleUpdateSounds({ [item.key]: e.target.checked })}
                          className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. Audit Log Tab */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Registro de Auditoria</h3>
                <p className="text-xs text-slate-400 mt-0.5">Histórico completo de alterações administrativas no servidor.</p>
              </div>

              <div className="space-y-2">
                {server.auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5 bg-[#121520] rounded-2xl border border-white/[0.06] flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3">
                      <img src={log.actorAvatar} alt={log.actorName} className="w-8 h-8 rounded-full object-cover border border-white/10" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white">{log.actorName}</span>
                          <span className="text-slate-500">•</span>
                          <span className="font-semibold text-indigo-400">{log.action}</span>
                        </div>
                        <p className="text-slate-300 mt-0.5 font-normal">{log.details}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
