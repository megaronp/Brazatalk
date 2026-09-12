import React, { useState } from 'react';
import { Channel, Server, Category } from '../../types';
import {
  Hash,
  Volume2,
  Megaphone,
  Radio,
  Sparkles,
  Lock,
  Trash2,
  AlertTriangle,
  Check,
  X,
  FolderOpen,
  FileText,
  ShieldAlert,
  Loader2,
} from 'lucide-react';

interface ManageChannelModalProps {
  channel: Channel;
  server: Server;
  onClose: () => void;
  onUpdateChannel: (channelId: string, updates: Partial<Channel>) => Promise<void> | void;
  onDeleteChannel: (channelId: string) => Promise<void> | void;
}

export const ManageChannelModal: React.FC<ManageChannelModalProps> = ({
  channel,
  server,
  onClose,
  onUpdateChannel,
  onDeleteChannel,
}) => {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [categoryId, setCategoryId] = useState(channel.categoryId || server.categories[0]?.id || '');
  const [isE2EE, setIsE2EE] = useState(channel.isE2EE);

  // States
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmNameInput, setConfirmNameInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isNameMatching = confirmNameInput.trim() === channel.name.trim();

  const getChannelIcon = (type: Channel['type']) => {
    switch (type) {
      case 'voice':
        return <Volume2 className="w-5 h-5 text-emerald-400" />;
      case 'announcement':
        return <Megaphone className="w-5 h-5 text-amber-400" />;
      case 'stage':
        return <Radio className="w-5 h-5 text-pink-400" />;
      case 'project':
        return <Sparkles className="w-5 h-5 text-indigo-400" />;
      default:
        return <Hash className="w-5 h-5 text-indigo-400" />;
    }
  };

  const getChannelTypeLabel = (type: Channel['type']) => {
    switch (type) {
      case 'voice':
        return 'Canal de Voz HD';
      case 'announcement':
        return 'Canal de Anúncios';
      case 'stage':
        return 'Palco / Transmissão';
      case 'project':
        return 'Sala de Projeto IA';
      default:
        return 'Canal de Texto';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const formattedName = name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!formattedName) {
      setErrorMessage('O nome da sala não pode ficar vazio.');
      return;
    }

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onUpdateChannel(channel.id, {
        name: formattedName,
        topic: topic.trim(),
        categoryId,
        isE2EE,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao salvar alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!isNameMatching || isDeleting) return;

    try {
      setIsDeleting(true);
      setErrorMessage(null);
      await onDeleteChannel(channel.id);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Erro ao excluir a sala e suas dependências.');
      setIsDeleting(false);
    }
  };

  return (
    <div
      id="modal-manage-channel-backdrop"
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-6 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isDeleting) onClose();
      }}
    >
      <div
        id="modal-manage-channel-container"
        className="bg-[#0e1017] border border-white/10 rounded-2xl sm:rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between bg-[#131622]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.06] shrink-0">
              {getChannelIcon(channel.type)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base tracking-tight truncate">
                  Configurações da Sala
                </h3>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/20 shrink-0">
                  {getChannelTypeLabel(channel.type)}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">
                #{channel.name} • {server.name}
              </p>
            </div>
          </div>

          <button
            id="btn-close-manage-channel"
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-sm text-slate-300">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Form */}
          <form id="form-edit-channel" onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Nome da Sala
              </label>
              <div className="relative flex items-center">
                <span className="absolute left-3 text-slate-500 font-mono text-sm">#</span>
                <input
                  id="input-edit-channel-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="nome-da-sala"
                  required
                  maxLength={40}
                  className="w-full bg-[#141724] border border-white/10 rounded-xl pl-8 pr-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-medium transition-colors"
                />
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Use letras minúsculas, números e hífens.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Tópico / Descrição
              </label>
              <textarea
                id="input-edit-channel-topic"
                rows={2}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Qual é o propósito ou assunto desta sala?"
                maxLength={250}
                className="w-full bg-[#141724] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Categoria
                </label>
                <div className="relative">
                  <select
                    id="select-edit-channel-category"
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full bg-[#141724] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors appearance-none cursor-pointer"
                  >
                    {server.categories.map((cat) => (
                      <option key={cat.id} value={cat.id} className="bg-[#141724] text-white">
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  <FolderOpen className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                  Criptografia
                </label>
                <button
                  type="button"
                  id="btn-toggle-channel-e2ee"
                  onClick={() => setIsE2EE(!isE2EE)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    isE2EE
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-[#141724] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" />
                    {isE2EE ? 'Cifra AES-GCM (256-bit) Ativa' : 'Padrão (Sem Cifra de Canal)'}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isE2EE ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold animate-in fade-in">
                  <Check className="w-3.5 h-3.5" /> Alterações salvas!
                </span>
              )}
              <button
                id="btn-save-channel-settings"
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                <span>Salvar Alterações</span>
              </button>
            </div>
          </form>

          {/* DANGER ZONE */}
          <div className="pt-4 border-t border-white/[0.08]">
            <div className="p-4 sm:p-5 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-rose-500/20 text-rose-400 shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-rose-200">Zona de Perigo — Excluir Sala</h4>
                  <p className="text-xs text-rose-300/80 leading-relaxed">
                    Excluir esta sala apagará definitivamente todas as suas dependências associadas:
                  </p>
                  <ul className="text-xs text-rose-300/70 list-disc list-inside space-y-0.5 pt-1">
                    <li>Histórico completo de mensagens e arquivos anexados</li>
                    {channel.type === 'project' && (
                      <li>Workspace de arquivos de código, agentes e snapshot do projeto</li>
                    )}
                    <li>Sessões de voz ativas e conexões WebRTC vinculadas</li>
                    <li>Sincronização no banco de dados e cache offline</li>
                  </ul>
                </div>
              </div>

              {!showDeleteConfirm ? (
                <div className="flex justify-end pt-2">
                  <button
                    id="btn-open-delete-channel-confirm"
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(true);
                      setConfirmNameInput('');
                    }}
                    className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir Sala</span>
                  </button>
                </div>
              ) : (
                <div
                  id="box-delete-channel-confirmation"
                  className="mt-3 p-4 rounded-xl bg-[#110d14] border border-rose-500/40 space-y-3 animate-in fade-in zoom-in-95"
                >
                  <div className="flex items-center gap-2 text-rose-400 text-xs font-bold uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4" />
                    <span>Confirmação de Segurança Obrigatória</span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    Para confirmar a exclusão definitiva, digite o nome exato da sala:{' '}
                    <span className="select-all font-mono font-bold bg-rose-950/80 px-2 py-0.5 rounded text-rose-300 border border-rose-500/30">
                      {channel.name}
                    </span>
                  </p>

                  <div className="space-y-1.5">
                    <input
                      id="input-confirm-channel-name-delete"
                      type="text"
                      value={confirmNameInput}
                      onChange={(e) => setConfirmNameInput(e.target.value)}
                      placeholder={`Digite "${channel.name}" para confirmar`}
                      disabled={isDeleting}
                      autoFocus
                      className={`w-full bg-[#18121f] border rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none transition-colors font-mono ${
                        isNameMatching
                          ? 'border-emerald-500/60 focus:border-emerald-400 text-emerald-300'
                          : 'border-rose-500/30 focus:border-rose-400'
                      }`}
                    />

                    {confirmNameInput.length > 0 && (
                      <div className="text-[11px] font-medium flex items-center gap-1">
                        {isNameMatching ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Nome conferido! Pronto para excluir.
                          </span>
                        ) : (
                          <span className="text-rose-400">
                            O texto digitado não corresponde a "{channel.name}".
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      id="btn-cancel-delete-channel"
                      type="button"
                      disabled={isDeleting}
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setConfirmNameInput('');
                      }}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>

                    <button
                      id="btn-confirm-delete-channel-final"
                      type="button"
                      disabled={!isNameMatching || isDeleting}
                      onClick={handleDelete}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-30 disabled:hover:bg-rose-600 text-white text-xs font-bold transition-all shadow-md shadow-rose-900/50 cursor-pointer"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Excluindo dependências...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Excluir Permanentemente</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
