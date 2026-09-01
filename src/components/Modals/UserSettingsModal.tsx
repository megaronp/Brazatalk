import React, { useState } from 'react';
import { User } from '../../types';
import {
  User as UserIcon,
  Mic,
  Lock,
  HardDrive,
  Bell,
  Check,
  Copy,
  Download,
  LogOut,
} from 'lucide-react';
import { e2eeService } from '../../services/e2eeService';
import { soundEngine } from '../../services/soundEngine';

interface UserSettingsModalProps {
  currentUser: User;
  onClose: () => void;
  onUpdateUser: (updated: Partial<User>) => void;
  onOpenInstaller: () => void;
  onSignOut?: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  currentUser,
  onClose,
  onUpdateUser,
  onOpenInstaller,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'voice' | 'e2ee' | 'notifications' | 'storage'>('profile');
  const [name, setName] = useState(currentUser.name);
  const [customStatus, setCustomStatus] = useState(currentUser.customStatus || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [userStatus, setUserStatus] = useState(currentUser.status);

  // Audio testing
  const [micTesting, setMicTesting] = useState(false);
  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  const fingerprint = currentUser.e2eeFingerprint || e2eeService.getFingerprint();

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(fingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  const handleSaveProfile = () => {
    onUpdateUser({
      name,
      customStatus,
      bio,
      status: userStatus,
    });
    onClose();
  };

  return (
    <div
      id="modal-user-settings"
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-0 sm:p-6 select-none"
    >
      <div className="bg-[#0f1118] w-full max-w-4xl h-full sm:h-[85vh] rounded-none sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row animate-in fade-in zoom-in-95 duration-150">
        {/* Left Navigation Sidebar */}
        <div className="w-full md:w-60 bg-[#090b10] p-2.5 sm:p-4 border-b md:border-b-0 md:border-r border-white/[0.06] flex flex-row md:flex-col justify-between items-center md:items-stretch shrink-0 gap-2 overflow-x-auto no-scrollbar">
          <div className="flex flex-row md:flex-col items-center md:items-stretch gap-1 w-full overflow-x-auto no-scrollbar">
            <div className="hidden md:block text-[11px] font-bold text-slate-400 uppercase px-3 py-1.5 tracking-wider">
              Configurações
            </div>

            <button
              onClick={() => setActiveTab('profile')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span>Meu Perfil</span>
            </button>

            <button
              onClick={() => setActiveTab('voice')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'voice' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Mic className="w-4 h-4" />
              <span>Voz e Vídeo</span>
            </button>

            <button
              onClick={() => setActiveTab('e2ee')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'e2ee' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>Criptografia E2EE</span>
            </button>

            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'notifications' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>Notificações</span>
            </button>

            <button
              onClick={() => setActiveTab('storage')}
              className={`flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'storage' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <HardDrive className="w-4 h-4" />
              <span>Armazenamento</span>
            </button>

            <button
              id="btn-user-settings-installer"
              onClick={onOpenInstaller}
              className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 transition-colors border border-emerald-500/20 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4" />
              <span>Instalação & Updates</span>
            </button>

            {onSignOut && (
              <button
                id="btn-user-settings-logout"
                onClick={() => {
                  onSignOut();
                  onClose();
                }}
                className="flex items-center gap-2 px-3 py-1.5 md:py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors border border-rose-500/20 cursor-pointer whitespace-nowrap shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>Desconectar / Sair</span>
              </button>
            )}
          </div>

          <button
            onClick={onClose}
            className="py-1.5 px-3 md:py-2.5 md:w-full md:mt-4 bg-[#141722] hover:bg-white/[0.08] text-white text-xs font-semibold rounded-xl border border-white/[0.06] transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            Fechar
          </button>
        </div>

        {/* Tab Content */}
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto no-scrollbar bg-[#0a0c12]">
          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Perfil do Usuário</h3>
                <p className="text-xs text-slate-400 mt-0.5">Atualize seu nome de exibição, avatar e status personalizado.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Nome de Exibição
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Status Online
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: 'online', label: 'Online', color: 'bg-emerald-500' },
                      { id: 'idle', label: 'Ausente', color: 'bg-amber-400' },
                      { id: 'dnd', label: 'Não Perturbe', color: 'bg-rose-500' },
                      { id: 'offline', label: 'Invisível', color: 'bg-slate-500' },
                    ].map((st) => (
                      <button
                        key={st.id}
                        onClick={() => setUserStatus(st.id as User['status'])}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          userStatus === st.id
                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                            : 'bg-[#141722] border-white/[0.06] text-slate-300 hover:bg-[#181c2b]'
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${st.color}`} />
                        <span>{st.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Status Customizado
                  </label>
                  <input
                    type="text"
                    value={customStatus}
                    onChange={(e) => setCustomStatus(e.target.value)}
                    placeholder="O que está acontecendo?"
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                    Sobre Mim (Bio)
                  </label>
                  <textarea
                    rows={3}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={handleSaveProfile}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    Salvar Alterações
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Voice & Video Tab */}
          {activeTab === 'voice' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Configurações de Voz & Vídeo</h3>
                <p className="text-xs text-slate-400 mt-0.5">Ajuste os parâmetros do microfone, cancelamento de ruído e áudio HD.</p>
              </div>

              {/* Mic Test Section */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Teste de Microfone</span>
                  <button
                    onClick={() => {
                      setMicTesting(!micTesting);
                      if (!micTesting) soundEngine.playMessage();
                    }}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      micTesting ? 'bg-rose-500 text-white shadow-md' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30'
                    }`}
                  >
                    {micTesting ? 'Parar Teste' : 'Vamos Testar'}
                  </button>
                </div>

                <div className="w-full h-3 bg-[#141722] rounded-full overflow-hidden p-0.5 border border-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      micTesting ? 'w-3/4 bg-emerald-500 animate-pulse' : 'w-0'
                    }`}
                  />
                </div>
              </div>

              {/* Noise suppression toggle */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-white tracking-tight">Cancelamento de Ruído Neural (RNNoise)</h4>
                  <p className="text-[11px] text-slate-400 font-normal">Remove ruídos de teclado, ventilador e fundo em tempo real.</p>
                </div>
                <input type="checkbox" defaultChecked className="w-4 h-4 accent-emerald-500 cursor-pointer" />
              </div>
            </div>
          )}

          {/* E2EE Tab */}
          {activeTab === 'e2ee' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Criptografia de Ponta a Ponta (E2EE)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Chaves de segurança criptográficas locais derivadas no seu navegador.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-emerald-500/20 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>Sua Impressão Digital de Segurança (Fingerprint)</span>
                  </span>

                  <button
                    onClick={handleCopyFingerprint}
                    className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#141722] hover:bg-white/[0.08] px-3 py-1.5 rounded-xl transition-colors border border-white/[0.06] cursor-pointer"
                  >
                    {copiedFingerprint ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFingerprint ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="font-mono text-xs tracking-widest text-emerald-300 bg-[#090b10] p-3 rounded-xl border border-emerald-500/30 text-center select-all">
                  {fingerprint}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                  Compare estes números com seus amigos em conversas seguras para verificar a integridade da chave E2EE contra ataques de interceptação.
                </p>
              </div>
            </div>
          )}

          {/* Notifications Tab */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Notificações Push em Tempo Real</h3>
                <p className="text-xs text-slate-400 mt-0.5">Receba alertas no desktop e dispositivos móveis mesmo com o app em segundo plano.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">Notificações no Navegador</h4>
                    <p className="text-[11px] text-slate-400 font-normal">Permita notificações nativas do sistema operacional.</p>
                  </div>

                  <button
                    onClick={() => {
                      if (typeof Notification !== 'undefined') {
                        Notification.requestPermission();
                      }
                      soundEngine.playMention();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    Ativar Push
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Storage & Offline Tab */}
          {activeTab === 'storage' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Armazenamento & Suporte Offline</h3>
                <p className="text-xs text-slate-400 mt-0.5">Gerenciamento do banco de dados local IndexedDB para leitura offline contínua.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">Banco Local BrazaTalkDB</h4>
                    <p className="text-[11px] text-slate-400 font-normal">Mensagens, canais e arquivos em cache para acesso instantâneo.</p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    Ativo & Sincronizado
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
