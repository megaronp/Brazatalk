import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  Compass,
  Key,
  Users,
  Volume2,
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
  Radio,
  Flame,
  Globe,
  Loader2,
} from 'lucide-react';
import { Server, User } from '../../types';
import { firebaseDb } from '../../services/firebaseDb';
import { soundEngine } from '../../services/soundEngine';

interface ExploreServersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  userServers: Server[];
  onSelectServer: (serverId: string) => void;
  onJoinServer: (serverIdOrCode: string) => Promise<boolean>;
}

export const ExploreServersModal: React.FC<ExploreServersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  userServers,
  onSelectServer,
  onJoinServer,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [inviteInput, setInviteInput] = useState('');
  const [isJoiningCode, setIsJoiningCode] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState<string | null>(null);

  const [publicServers, setPublicServers] = useState<Server[]>([]);
  const [loadingServers, setLoadingServers] = useState(true);

  // Load discoverable public servers from Firestore
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setLoadingServers(true);

    firebaseDb.getAllPublicServers().then((servers) => {
      if (!isMounted) return;
      // Ensure official default community hub is included
      const hasOfficial = servers.some((s) => s.id === 'server-braza-community');
      if (!hasOfficial) {
        servers.unshift({
          id: 'server-braza-community',
          name: 'Braza Talk Comunidade Oficial',
          icon: '',
          ownerId: 'system',
          isPublic: true,
          description: 'A comunidade oficial do Braza Talk. Bate-papo, voz HD e novidades!',
          channels: [
            { id: 'c-geral', name: 'geral', type: 'text', serverId: 'server-braza-community' },
            { id: 'c-voz-1', name: 'Roda de Conversa', type: 'voice', serverId: 'server-braza-community' },
            { id: 'c-voz-2', name: 'Jogatina & Squads', type: 'voice', serverId: 'server-braza-community' },
          ],
          members: [currentUser],
          roles: [],
        } as unknown as Server);
      }
      setPublicServers(servers);
      setLoadingServers(false);
    }).catch(() => {
      if (isMounted) setLoadingServers(false);
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const handleJoinByCodeOrLink = async () => {
    if (!inviteInput.trim()) return;

    setJoinError(null);
    setJoinSuccess(null);
    setIsJoiningCode(true);

    try {
      let code = inviteInput.trim();
      // Extract from URL if user pasted full invite link
      if (code.includes('invite=')) {
        const parsed = new URL(code.startsWith('http') ? code : `https://${code}`);
        code = parsed.searchParams.get('invite') || code;
      } else if (code.includes('/invite/')) {
        const parts = code.split('/invite/');
        code = parts[1]?.split('?')[0] || code;
      }

      const success = await onJoinServer(code);
      if (success) {
        soundEngine.playUserJoin();
        setJoinSuccess('Você entrou no servidor com sucesso!');
        setInviteInput('');
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setJoinError('Servidor não encontrado ou convite expirado.');
      }
    } catch (e) {
      setJoinError('Não foi possível conectar a este servidor.');
    } finally {
      setIsJoiningCode(false);
    }
  };

  // Filter public servers by search and category
  const filteredServers = publicServers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase()));

    if (selectedCategory === 'all') return matchesSearch;
    if (selectedCategory === 'games') {
      return (
        matchesSearch &&
        (s.name.toLowerCase().includes('game') ||
          s.name.toLowerCase().includes('jogo') ||
          s.description?.toLowerCase().includes('game'))
      );
    }
    if (selectedCategory === 'tech') {
      return (
        matchesSearch &&
        (s.name.toLowerCase().includes('dev') ||
          s.name.toLowerCase().includes('tech') ||
          s.name.toLowerCase().includes('código') ||
          s.description?.toLowerCase().includes('tech'))
      );
    }
    return matchesSearch;
  });

  return (
    <div
      id="modal-explore-servers-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="modal-explore-servers-content"
        className="bg-[#0f121c] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/[0.08] bg-[#141824]/60 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              <Compass className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Buscar e Explorar Servidores
              </h2>
              <p className="text-xs text-slate-400">
                Entre em comunidades públicas ou acerte um convite para servidores privados
              </p>
            </div>
          </div>

          <button
            id="btn-close-explore-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {/* Join via Invite Link or Code section */}
          <div className="bg-[#141824]/80 p-4 rounded-xl border border-white/10 space-y-2.5 shadow-sm">
            <label className="text-xs font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" />
              Entrar com Código ou Link de Convite
            </label>
            <p className="text-[11px] text-slate-400">
              Recebeu um convite de um amigo? Cole o link completo ou o código do servidor para entrar:
            </p>

            <div className="flex gap-2">
              <input
                id="input-explore-invite-code"
                type="text"
                value={inviteInput}
                onChange={(e) => {
                  setInviteInput(e.target.value);
                  if (joinError) setJoinError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleJoinByCodeOrLink();
                }}
                placeholder="Ex: https://...?invite=server-1234 ou código"
                className="flex-1 bg-[#0b0e15] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                id="btn-submit-invite-join"
                onClick={handleJoinByCodeOrLink}
                disabled={isJoiningCode || !inviteInput.trim()}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-600/20 shrink-0"
              >
                {isJoiningCode ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Servidor</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>

            {joinError && (
              <p className="text-xs text-rose-400 font-medium">{joinError}</p>
            )}
            {joinSuccess && (
              <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" /> {joinSuccess}
              </p>
            )}
          </div>

          {/* Public Server Explorer & Search */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="input-search-public-servers"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Pesquisar servidores por nome ou assunto..."
                  className="w-full bg-[#141824] border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto no-scrollbar py-0.5">
                {[
                  { id: 'all', label: 'Todos' },
                  { id: 'games', label: 'Jogos' },
                  { id: 'tech', label: 'Tecnologia' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    id={`btn-cat-${cat.id}`}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      selectedCategory === cat.id
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* List of Public Servers */}
            {loadingServers ? (
              <div className="p-8 flex flex-col items-center justify-center text-slate-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                <span className="text-xs">Carregando servidores disponíveis...</span>
              </div>
            ) : filteredServers.length === 0 ? (
              <div className="p-8 text-center bg-[#141824]/40 rounded-xl border border-white/[0.05] text-slate-400 text-xs">
                Nenhum servidor público encontrado com esse termo.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredServers.map((srv) => {
                  const isAlreadyMember = userServers.some((s) => s.id === srv.id);
                  const voiceChannelsCount =
                    srv.channels?.filter((c) => c.type === 'voice' || c.type === 'stage').length || 0;
                  const membersCount = srv.members?.length || 1;

                  return (
                    <div
                      key={srv.id}
                      className="bg-[#141824] border border-white/[0.06] hover:border-white/[0.15] rounded-xl p-4 flex flex-col justify-between gap-3 transition-all duration-200 group"
                    >
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center font-bold text-white text-base shrink-0 shadow-md ring-1 ring-white/10">
                          {srv.icon ? (
                            <img
                              src={srv.icon}
                              alt={srv.name}
                              className="w-full h-full rounded-xl object-cover"
                            />
                          ) : (
                            srv.name.slice(0, 2).toUpperCase()
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <h4 className="font-bold text-sm text-white truncate">{srv.name}</h4>
                            {srv.id === 'server-braza-community' && (
                              <span
                                title="Comunidade Oficial"
                                className="p-0.5 rounded-full bg-emerald-500/20 text-emerald-400 shrink-0"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-2 mt-0.5 leading-relaxed">
                            {srv.description || 'Comunidade aberta no Braza Talk para bater papo e jogar.'}
                          </p>
                        </div>
                      </div>

                      {/* Server Stats & Action Button */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/[0.04] text-[11px] text-slate-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            {membersCount} {membersCount === 1 ? 'membro' : 'membros'}
                          </span>
                          {voiceChannelsCount > 0 && (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <Volume2 className="w-3.5 h-3.5" />
                              {voiceChannelsCount} voz
                            </span>
                          )}
                        </div>

                        {isAlreadyMember ? (
                          <button
                            id={`btn-open-server-${srv.id}`}
                            onClick={() => {
                              onSelectServer(srv.id);
                              onClose();
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-white font-semibold transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <span>Acessar</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            id={`btn-join-public-server-${srv.id}`}
                            onClick={async () => {
                              const ok = await onJoinServer(srv.id);
                              if (ok) {
                                soundEngine.playUserJoin();
                                onSelectServer(srv.id);
                                onClose();
                              }
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition-all cursor-pointer flex items-center gap-1 shadow-sm"
                          >
                            <span>Entrar</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#141824]/40 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-400" />
            <span>Braza Talk Comunidades • Voz HD WebRTC & Criptografia</span>
          </div>

          <button
            id="btn-close-explore-footer"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold transition-colors cursor-pointer"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
