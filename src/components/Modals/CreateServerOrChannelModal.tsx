import React, { useState } from 'react';
import { ChannelType } from '../../types';
import { Hash, Volume2, Megaphone, Radio, ShieldCheck, Sparkles } from 'lucide-react';

interface CreateServerOrChannelModalProps {
  mode: 'server' | 'channel';
  categoryId?: string;
  onClose: () => void;
  onCreateServer?: (name: string, icon: string, description: string, e2ee: boolean) => void;
  onCreateChannel?: (
    name: string,
    type: ChannelType,
    isE2EE: boolean,
    categoryId?: string,
    projectConfig?: { description?: string; gameEngine?: string }
  ) => void;
}

export const CreateServerOrChannelModal: React.FC<CreateServerOrChannelModalProps> = ({
  mode,
  categoryId,
  onClose,
  onCreateServer,
  onCreateChannel,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('🔥');
  const [channelType, setChannelType] = useState<ChannelType>('text');
  const [isE2EE, setIsE2EE] = useState(false);
  const [projectDescription, setProjectDescription] = useState('');
  const [projectEngine, setProjectEngine] = useState('Geral / Código');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (mode === 'server' && onCreateServer) {
      onCreateServer(name.trim(), icon, description.trim(), isE2EE);
    } else if (mode === 'channel' && onCreateChannel) {
      onCreateChannel(
        name.trim().toLowerCase().replace(/\s+/g, '-'),
        channelType,
        isE2EE,
        categoryId,
        channelType === 'project'
          ? { description: projectDescription.trim(), gameEngine: projectEngine }
          : undefined
      );
    }
    onClose();
  };

  return (
    <div
      id="modal-create-server-channel"
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1118] w-full max-w-md rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-white/[0.06] text-center bg-[#090b10]">
          <h2 className="text-xl font-black text-white tracking-tight">
            {mode === 'server' ? 'Criar um Servidor' : 'Criar Canal'}
          </h2>
          <p className="text-xs text-slate-400 mt-1 font-normal">
            {mode === 'server'
              ? 'Seu servidor é onde você e seus amigos conversam, transmitem e se reúnem.'
              : 'Adicione uma sala de voz, texto ou transmissão para a comunidade.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 bg-[#0a0c12]">
          {mode === 'server' ? (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Ícone do Servidor (Emoji)
                </label>
                <div className="flex gap-2">
                  {['⚡', '🎮', '🔥', '🚀', '🎧', '💎', '🛡️', '👾'].map((em) => (
                    <button
                      type="button"
                      key={em}
                      onClick={() => setIcon(em)}
                      className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border transition-all cursor-pointer ${
                        icon === em
                          ? 'bg-indigo-600 border-indigo-500 scale-110 shadow-lg shadow-indigo-600/30'
                          : 'bg-[#141722] border-white/[0.06] hover:bg-[#181c2b]'
                      }`}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome do Servidor
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Cyber Squad & Coffee"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Descrição
                </label>
                <input
                  type="text"
                  placeholder="Ex: Comunidade de streams e jogos"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-[#141722] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            </>
          ) : (
            <>
              {/* Channel Type Selector */}
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Tipo de Canal
                </label>
                <div className="space-y-2">
                  {[
                    {
                      type: 'text',
                      icon: <Hash className="w-5 h-5 text-slate-400" />,
                      title: 'Texto',
                      desc: 'Poste mensagens, imagens, memes e opiniões.',
                    },
                    {
                      type: 'voice',
                      icon: <Volume2 className="w-5 h-5 text-emerald-400" />,
                      title: 'Voz & Stream',
                      desc: 'Reúna-se por áudio, vídeo e compartilhamento de tela.',
                    },
                    {
                      type: 'announcement',
                      icon: <Megaphone className="w-5 h-5 text-amber-400" />,
                      title: 'Anúncios',
                      desc: 'Canal de comunicados oficiais e novidades.',
                    },
                    {
                      type: 'stage',
                      icon: <Radio className="w-5 h-5 text-pink-400" />,
                      title: 'Palco (Stage)',
                      desc: 'Eventos ao vivo onde palestrantes falam e ouvintes escutam.',
                    },
                    {
                      type: 'project',
                      icon: <Sparkles className="w-5 h-5 text-indigo-400" />,
                      title: 'Sala de Projeto IA',
                      desc: 'Workspace colaborativo com agentes, RAG, editor de arquivos, sandbox de testes e voz.',
                    },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.type}
                      onClick={() => setChannelType(item.type as ChannelType)}
                      className={`w-full p-3 rounded-2xl border flex items-center justify-between transition-all text-left cursor-pointer ${
                        channelType === item.type
                          ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                          : 'bg-[#141722] border-white/[0.06] hover:bg-[#181c2b]'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {item.icon}
                        <div>
                          <h4 className="text-xs font-bold text-white tracking-tight">{item.title}</h4>
                          <p className="text-[11px] text-slate-400 font-normal">{item.desc}</p>
                        </div>
                      </div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          channelType === item.type ? 'border-indigo-500 bg-indigo-600' : 'border-slate-600'
                        }`}
                      >
                        {channelType === item.type && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Nome do Canal
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-sm">#</span>
                  <input
                    type="text"
                    required
                    placeholder={channelType === 'project' ? 'meu-projeto-ia' : 'novo-canal'}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-[#141722] border border-white/[0.08] rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>

              {channelType === 'project' && (
                <div className="p-3.5 rounded-2xl bg-indigo-950/20 border border-indigo-500/20 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                    <div>
                      <h5 className="text-xs font-bold text-indigo-300">Sala Criada em Branco</h5>
                      <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                        A sala será inicializada limpa, sem arquivos mockados ou planos artificiais. Você terá total liberdade para configurar seu projeto do zero.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Objetivo / Descrição do Projeto (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Desenvolver API REST em TypeScript..."
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      className="w-full bg-[#111420] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 uppercase tracking-wider mb-1">
                      Ambiente / Contexto Tecnológico (Opcional)
                    </label>
                    <select
                      value={projectEngine}
                      onChange={(e) => setProjectEngine(e.target.value)}
                      className="w-full bg-[#111420] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
                    >
                      <option value="Geral / Código">Geral / Código Livre</option>
                      <option value="Web App (Frontend/Backend)">Web App (Frontend / Backend)</option>
                      <option value="Python (Scripts/Dados)">Python (Scripts / Análise)</option>
                      <option value="GTA FiveM (Lua/NUI)">GTA FiveM (Lua / NUI)</option>
                    </select>
                  </div>
                </div>
              )}
            </>
          )}

          {/* E2EE Toggle */}
          <div className="bg-[#141722] p-3.5 rounded-2xl border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              <div>
                <h5 className="text-xs font-bold text-white tracking-tight">Criptografia E2EE (AES-GCM-256)</h5>
                <p className="text-[10px] text-slate-400">Cifra todas as interações localmente no dispositivo.</p>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isE2EE}
              onChange={(e) => setIsE2EE(e.target.checked)}
              className="w-4 h-4 accent-emerald-500 rounded cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all cursor-pointer"
            >
              {mode === 'server' ? 'Criar Servidor' : 'Criar Canal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
