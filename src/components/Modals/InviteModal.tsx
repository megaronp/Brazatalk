import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  UserPlus,
  Share2,
  QrCode,
  Sparkles,
  ShieldCheck,
  Send,
  MessageCircle,
  Clock,
  Hash,
  Volume2,
  Radio,
  Users,
  Key,
} from 'lucide-react';
import { Server, Channel, User } from '../../types';
import { soundEngine } from '../../services/soundEngine';

interface InviteModalProps {
  server?: Server | null;
  channel?: Channel | null;
  currentUser: User;
  availableUsers?: User[];
  onClose: () => void;
  onSendDirectInvite?: (targetUser: User, channelName: string) => void;
}

export const InviteModal: React.FC<InviteModalProps> = ({
  server,
  channel,
  currentUser,
  availableUsers = [],
  onClose,
  onSendDirectInvite,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    channel?.id || server?.channels[0]?.id || 'chan-geral'
  );
  const [expireOption, setExpireOption] = useState<string>('never');
  const [maxUsesOption, setMaxUsesOption] = useState<string>('unlimited');
  const [showQr, setShowQr] = useState<boolean>(false);
  const [invitedUsers, setInvitedUsers] = useState<Record<string, boolean>>({});

  const currentChannelObj = server?.channels?.find((c) => c.id === selectedChannelId) || channel;

  // Real invite code and URL
  const serverId = server?.id || 'server-braza-community';
  const shortCode = serverId.startsWith('server-') ? serverId.replace('server-', '') : serverId;
  const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(serverId)}&channel=${encodeURIComponent(selectedChannelId)}`;

  // Filter available contacts (exclude current user)
  const contactsList = availableUsers.filter((u) => u && u.id && u.id !== currentUser.id);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopiedLink(true);
      soundEngine.playMessage();
      setTimeout(() => setCopiedLink(false), 2500);
    });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(shortCode).then(() => {
      setCopiedCode(true);
      soundEngine.playMessage();
      setTimeout(() => setCopiedCode(false), 2500);
    });
  };

  const handleInviteFriend = (friend: User) => {
    setInvitedUsers((prev) => ({ ...prev, [friend.id]: true }));
    soundEngine.playUserJoin();
    if (onSendDirectInvite) {
      onSendDirectInvite(friend, currentChannelObj?.name || 'Canal');
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `🔥 Entre no meu servidor "${server?.name || 'Braza Talk'}" no canal "${currentChannelObj?.name || 'Voz'}"!\nLink de acesso rápido com voz HD sem picotar:\n${inviteUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleShareTelegram = () => {
    const text = encodeURIComponent(
      `🔥 Entre no servidor "${server?.name || 'Braza Talk'}" no Braza Talk!`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`, '_blank');
  };

  return (
    <div
      id="modal-invite-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        id="modal-invite-content"
        className="bg-[#10131d] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-white/[0.08] bg-[#141824]/60">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Convidar amigos para {server ? server.name : 'o servidor'}
              </h3>
              <p className="text-xs text-slate-400">
                Canal de destino: <span className="text-indigo-300 font-semibold">{currentChannelObj ? `#${currentChannelObj.name}` : 'Geral'}</span>
              </p>
            </div>
          </div>

          <button
            id="btn-close-invite-modal"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
          {/* Channel selector if server has multiple channels */}
          {server && server.channels && server.channels.length > 1 && (
            <div>
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                Canal onde o convidado vai entrar:
              </label>
              <select
                id="select-invite-channel"
                value={selectedChannelId}
                onChange={(e) => setSelectedChannelId(e.target.value)}
                className="w-full bg-[#161a27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {server.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.type === 'voice' ? '🔊 [Voz]' : c.type === 'stage' ? '📻 [Palco]' : '# [Texto]'} {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Quick Direct Invite to Active Users / Platform Friends */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-400" />
                Usuários e Contatos Ativos ({contactsList.length}):
              </label>
            </div>

            {contactsList.length === 0 ? (
              <div className="p-3 bg-[#151926] rounded-xl border border-white/[0.04] text-center text-xs text-slate-400">
                Nenhum outro usuário ativo no momento. Envie o link ou código abaixo!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                {contactsList.map((friend) => {
                  const isAlreadyMember = Boolean(
                    server?.members?.some((m) => m && m.id === friend.id)
                  );
                  const isInvited = Boolean(invitedUsers[friend.id]);

                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between p-2 rounded-xl bg-[#151926] border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <img
                            src={friend.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${friend.id}`}
                            alt={friend.name}
                            className="w-8 h-8 rounded-full object-cover bg-indigo-950 ring-1 ring-white/10"
                          />
                          <span
                            className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full ring-2 ring-[#151926] ${
                              friend.status === 'online'
                                ? 'bg-emerald-400'
                                : friend.status === 'idle'
                                ? 'bg-amber-400'
                                : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white truncate">{friend.name}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {friend.customStatus || (friend.status === 'online' ? 'Disponível' : 'Ausente')}
                          </div>
                        </div>
                      </div>

                      <div>
                        {isAlreadyMember ? (
                          <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                            Já é Membro
                          </span>
                        ) : (
                          <button
                            id={`btn-invite-friend-${friend.id}`}
                            onClick={() => handleInviteFriend(friend)}
                            disabled={isInvited}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isInvited
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                            }`}
                          >
                            {isInvited ? (
                              <>
                                <Check className="w-3.5 h-3.5" /> Enviado
                              </>
                            ) : (
                              <>
                                <Send className="w-3 h-3" /> Convidar
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Shareable Link Box */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Link de convite direto:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#161a27] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-indigo-300 font-mono truncate select-all">
                {inviteUrl}
              </div>
              <button
                id="btn-copy-invite-link"
                onClick={handleCopyLink}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-lg ${
                  copiedLink
                    ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/20'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                }`}
              >
                {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copiado!' : 'Copiar Link'}</span>
              </button>
            </div>
          </div>

          {/* Short Invite Code Box */}
          <div>
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
              Código de Convite Rápido:
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-[#161a27] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white font-mono font-bold tracking-wider truncate flex items-center gap-2">
                <Key className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{shortCode}</span>
              </div>
              <button
                id="btn-copy-invite-code"
                onClick={handleCopyCode}
                className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0 border ${
                  copiedCode
                    ? 'bg-emerald-500 text-slate-950 border-emerald-500'
                    : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/10'
                }`}
              >
                {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>
          </div>

          {/* Social Share & QR Code row */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              id="btn-share-whatsapp"
              onClick={handleShareWhatsApp}
              className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              <span>WhatsApp</span>
            </button>

            <button
              id="btn-share-telegram"
              onClick={handleShareTelegram}
              className="flex-1 min-w-[120px] py-2 px-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Telegram</span>
            </button>

            <button
              id="btn-toggle-qr-code"
              onClick={() => setShowQr(!showQr)}
              className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border cursor-pointer ${
                showQr
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 border-white/10'
              }`}
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>QR Code</span>
            </button>
          </div>

          {/* QR Code display */}
          {showQr && (
            <div className="bg-[#151926] p-4 rounded-xl border border-white/10 flex flex-col items-center justify-center gap-2 animate-in zoom-in-95">
              <div className="bg-white p-3 rounded-xl shadow-inner">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(inviteUrl)}`}
                  alt="QR Code de Convite"
                  className="w-36 h-36"
                />
              </div>
              <p className="text-[11px] text-slate-400 text-center">
                Aponte a câmera do celular para entrar diretamente no servidor
              </p>
            </div>
          )}

          {/* Link Expiration & Settings Accordion */}
          <div className="p-3 bg-[#141824]/60 rounded-xl border border-white/[0.06] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-indigo-400" /> Expiração do Link:
              </span>
              <select
                id="select-invite-expiry"
                value={expireOption}
                onChange={(e) => setExpireOption(e.target.value)}
                className="bg-[#1a1e2d] border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-white focus:outline-none"
              >
                <option value="30m">30 minutos</option>
                <option value="1d">1 dia</option>
                <option value="7d">7 dias</option>
                <option value="never">Nunca expira</option>
              </select>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Número de Usos:
              </span>
              <select
                id="select-invite-uses"
                value={maxUsesOption}
                onChange={(e) => setMaxUsesOption(e.target.value)}
                className="bg-[#1a1e2d] border border-white/10 rounded-lg px-2.5 py-1 text-[11px] text-white focus:outline-none"
              >
                <option value="unlimited">Ilimitado</option>
                <option value="1">1 uso</option>
                <option value="5">5 usos</option>
                <option value="25">25 usos</option>
              </select>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#141824]/40 flex items-center justify-end">
          <button
            id="btn-done-invite-modal"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};
