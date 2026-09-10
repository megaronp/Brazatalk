import React, { useState, useRef, useEffect } from 'react';
import { Channel, Message, MessageAttachment, User } from '../../types';
import {
  Hash,
  Volume2,
  Megaphone,
  Radio,
  Lock,
  Pin,
  Users,
  Search,
  ShieldCheck,
  X,
  Menu,
  UserPlus,
  UserCheck,
  Download,
  Settings,
} from 'lucide-react';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';

interface ChatAreaProps {
  channel: Channel;
  messages: Message[];
  currentUser: User;
  onSendMessage: (
    content: string,
    isVoiceNote?: boolean,
    voiceDuration?: number,
    attachments?: MessageAttachment[]
  ) => void;
  onReact: (messageId: string, emoji: string) => void;
  onPinMessage: (messageId: string) => void;
  onDeleteMessage: (messageId: string) => void;
  onToggleMemberList: () => void;
  showMemberList: boolean;
  onOpenE2EESecurityModal: () => void;
  onToggleMobileNav?: () => void;
  onOpenInvite?: () => void;
  onOpenManageChannel?: () => void;
}

export const ChatArea: React.FC<ChatAreaProps> = ({
  channel,
  messages,
  currentUser,
  onSendMessage,
  onReact,
  onPinMessage,
  onDeleteMessage,
  onToggleMemberList,
  showMemberList,
  onOpenE2EESecurityModal,
  onToggleMobileNav,
  onOpenInvite,
  onOpenManageChannel,
}) => {
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isDirectMessage = channel.id.startsWith('dm-');

  // Auto-scroll to bottom on messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Filter messages by search query or pinned status
  const displayedMessages = messages.filter((m) => {
    if (showPinnedOnly && !m.pinned) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return m.content.toLowerCase().includes(q) || m.authorName.toLowerCase().includes(q);
    }
    return true;
  });

  const getChannelIcon = () => {
    if (isDirectMessage) {
      return <UserCheck className="w-5 h-5 text-indigo-400" />;
    }
    switch (channel.type) {
      case 'voice':
        return <Volume2 className="w-5 h-5 text-slate-400" />;
      case 'announcement':
        return <Megaphone className="w-5 h-5 text-slate-400" />;
      case 'stage':
        return <Radio className="w-5 h-5 text-pink-400" />;
      default:
        return <Hash className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div id="chat-main-area" className="flex-1 bg-[#0e1017] flex flex-col min-w-0 overflow-hidden relative">
      {/* Lightbox / Image Zoom Modal */}
      {previewImage && (
        <div
          id="modal-image-lightbox"
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="Ampliação"
              className="max-h-[82vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
            />
            <div className="flex items-center gap-3 mt-3">
              <a
                href={previewImage}
                download="brazatalk_media.jpg"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md cursor-pointer transition-colors"
              >
                <Download className="w-4 h-4" />
                <span>Salvar Imagem</span>
              </a>
              <button
                onClick={() => setPreviewImage(null)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer transition-colors"
              >
                Fechar
              </button>
            </div>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-3 -right-3 w-8 h-8 rounded-full bg-slate-800 text-white border border-white/20 flex items-center justify-center shadow-lg hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Channel Header */}
      <div
        id="channel-header-bar"
        className="h-12 px-4 border-b border-white/[0.06] flex items-center justify-between shadow-sm z-20 shrink-0 select-none bg-[#0e1017]/90 backdrop-blur-md"
      >
        {/* Left: Channel Name & Topic */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Mobile Drawer Toggle Hamburger */}
          {onToggleMobileNav && (
            <button
              id="btn-mobile-menu-toggle"
              onClick={onToggleMobileNav}
              title="Abrir Menu de Canais"
              className="md:hidden p-1.5 -ml-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          {getChannelIcon()}
          <span className="font-bold text-white text-sm truncate tracking-tight">{channel.name}</span>

          {/* E2EE badge ONLY for 1-on-1 private Direct Messages */}
          {isDirectMessage && (
            <button
              id="btn-channel-e2ee-badge"
              onClick={onOpenE2EESecurityModal}
              title="Criptografia de Ponta a Ponta Ativa nesta conversa privada. Clique para verificar chaves."
              className="flex items-center gap-1.5 text-[11px] bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-semibold transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              <Lock className="w-3 h-3" />
              <span>E2EE Ponta a Ponta</span>
            </button>
          )}

          {channel.topic && (
            <>
              <div className="w-[1px] h-4 bg-white/[0.1] mx-1 hidden md:block" />
              <span className="text-xs text-slate-400 truncate max-w-sm hidden md:inline font-normal">
                {channel.topic}
              </span>
            </>
          )}
        </div>

        {/* Right: Actions (Pinned, Invite, Member list toggle, Search) */}
        <div className="flex items-center gap-1.5 text-slate-400">
          {onOpenInvite && (
            <button
              id="btn-chat-invite-header"
              onClick={onOpenInvite}
              title={`Convidar amigos para #${channel.name}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition-all cursor-pointer mr-1"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Convidar</span>
            </button>
          )}

          {/* Pinned Messages Toggle */}
          <button
            id="btn-toggle-pinned-messages"
            onClick={() => setShowPinnedOnly(!showPinnedOnly)}
            title={showPinnedOnly ? 'Mostrar todas as mensagens' : 'Mensagens Fixadas'}
            className={`p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors ${
              showPinnedOnly ? 'text-amber-400 bg-amber-400/10 border border-amber-400/20' : 'hover:text-slate-200'
            }`}
          >
            <Pin className="w-4 h-4" />
          </button>

          {/* Search Box */}
          <div className="relative hidden sm:flex items-center">
            <input
              id="input-channel-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar..."
              className="w-36 focus:w-48 bg-[#141722] text-xs text-white placeholder-slate-500 rounded-lg px-2.5 py-1 pr-6 border border-white/[0.06] focus:border-indigo-500/50 focus:outline-none transition-all"
            />
            {searchQuery ? (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 text-slate-400 hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            ) : (
              <Search className="w-3.5 h-3.5 absolute right-2 text-slate-500 pointer-events-none" />
            )}
          </div>

          {/* Member List Toggle */}
          <button
            id="btn-toggle-member-list"
            onClick={onToggleMemberList}
            title={showMemberList ? 'Ocultar Lista de Membros' : 'Exibir Lista de Membros'}
            className={`p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors ${
              showMemberList ? 'text-white bg-white/[0.08]' : 'hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
          </button>

          {/* Channel Management Settings */}
          {onOpenManageChannel && !isDirectMessage && (
            <button
              id="btn-chat-manage-channel"
              onClick={onOpenManageChannel}
              title={`Gerenciar Sala #${channel.name}`}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] hover:text-slate-200 transition-colors"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages Scroll Feed */}
      <div className="flex-1 overflow-y-auto py-4 space-y-1 select-text">
        {/* Welcome Channel Banner if beginning of channel */}
        {!searchQuery && !showPinnedOnly && (
          <div className="px-5 py-6 border-b border-white/[0.04] mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
              {getChannelIcon()}
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">Bem-vindo a #{channel.name}!</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-lg leading-relaxed">
              Este é o início do canal #{channel.name}.
              {channel.isE2EE
                ? ' Todas as conversas nesta sala possuem proteção criptográfica de ponta a ponta AES-GCM 256-bit.'
                : ' Converse, compartilhe ideias e utilize os comandos inteligentes dos bots de automação.'}
            </p>
          </div>
        )}

        {/* Search / Pinned Filter Feedback */}
        {(searchQuery || showPinnedOnly) && (
          <div className="px-4 py-2 bg-[#141722] mx-4 rounded-xl border border-white/[0.06] flex items-center justify-between text-xs text-slate-300">
            <span>
              {showPinnedOnly
                ? `Mostrando ${displayedMessages.length} mensagem(ns) fixada(s)`
                : `Resultados da busca por "${searchQuery}": ${displayedMessages.length} encontrada(s)`}
            </span>
            <button
              onClick={() => {
                setSearchQuery('');
                setShowPinnedOnly(false);
              }}
              className="text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
            >
              Limpar filtro
            </button>
          </div>
        )}

        {/* Message Items */}
        {displayedMessages.map((msg) => (
          <MessageItem
            key={msg.id}
            message={msg}
            currentUser={currentUser}
            onReact={onReact}
            onReply={(replyMsg) => setReplyingTo(replyMsg)}
            onPin={onPinMessage}
            onDelete={onDeleteMessage}
            isAdmin={currentUser.roles?.includes('role-admin')}
          />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <ChatInput
        channel={channel}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        onSendMessage={(content, isVoice, duration, attachments) => {
          onSendMessage(content, isVoice, duration, attachments);
          setReplyingTo(null);
        }}
        isEncrypted={channel.isE2EE}
      />
    </div>
  );
};
