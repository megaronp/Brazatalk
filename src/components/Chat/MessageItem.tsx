import React, { useState } from 'react';
import { Message, User } from '../../types';
import {
  Smile,
  Reply,
  Pin,
  Trash2,
  Lock,
  Play,
  Pause,
  CornerDownRight,
  ShieldCheck,
} from 'lucide-react';
import { EmojiReactionPicker } from './EmojiReactionPicker';

interface MessageItemProps {
  message: Message;
  currentUser: User;
  onReact: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onPin?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
  isAdmin?: boolean;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  currentUser,
  onReact,
  onReply,
  onPin,
  onDelete,
  isAdmin = false,
}) => {
  const [showActions, setShowActions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  const isAuthor = message.authorId === currentUser.id;
  const canDelete = isAuthor || isAdmin;

  // Format timestamp
  const date = new Date(message.timestamp);
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Format Markdown-like content safely
  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, idx) => {
      // Bold **text**
      const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>');
      // Inline code `code`
      const formattedCode = formatted.replace(
        /`(.*?)`/g,
        '<code class="bg-[#181b28] text-amber-300 px-1.5 py-0.5 rounded font-mono text-xs border border-white/[0.06]">$1</code>'
      );

      // Check header ### or ##
      if (line.startsWith('### ')) {
        return (
          <h4
            key={idx}
            className="text-sm font-bold text-white mt-1 mb-0.5 tracking-tight"
            dangerouslySetInnerHTML={{ __html: line.substring(4) }}
          />
        );
      }

      return (
        <span
          key={idx}
          className="block leading-relaxed"
          dangerouslySetInnerHTML={{ __html: formattedCode || '&nbsp;' }}
        />
      );
    });
  };

  return (
    <div
      id={`message-${message.id}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => {
        setShowActions(false);
        setShowEmojiPicker(false);
      }}
      className={`group relative flex gap-3.5 px-4 py-1.5 hover:bg-white/[0.03] transition-colors rounded-xl mx-2 ${
        message.pinned ? 'bg-indigo-500/[0.06] border-l-2 border-indigo-500' : ''
      }`}
    >
      {/* Author Avatar */}
      <div className="shrink-0 pt-0.5">
        <img
          src={message.authorAvatar}
          alt={message.authorName}
          className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-white/10"
        />
      </div>

      {/* Message Body */}
      <div className="flex-1 min-w-0">
        {/* Reply reference header if present */}
        {message.replyTo && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1">
            <CornerDownRight className="w-3 h-3 text-indigo-400" />
            <span className="font-semibold text-slate-300">@{message.replyTo.authorName}:</span>
            <span className="truncate max-w-xs italic text-slate-400">{message.replyTo.content}</span>
          </div>
        )}

        {/* Author Name + Bot Badge + Time */}
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold hover:underline cursor-pointer tracking-tight"
            style={{ color: message.authorRoleColor || '#f1f5f9' }}
          >
            {message.authorName}
          </span>

          {message.isBot && (
            <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider flex items-center gap-0.5 shadow-sm">
              <ShieldCheck className="w-2.5 h-2.5" />
              {message.botTag || 'BOT'}
            </span>
          )}

          {message.isEncrypted && (
            <span
              title="Protegido por Criptografia de Ponta a Ponta (E2EE AES-GCM-256)"
              className="flex items-center gap-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 rounded font-medium"
            >
              <Lock className="w-2.5 h-2.5" /> E2EE
            </span>
          )}

          <span className="text-[11px] text-slate-500">{timeStr}</span>

          {message.pendingSync && (
            <span className="text-[10px] text-amber-400 italic font-medium">
              (Pendente de sincronização)
            </span>
          )}
        </div>

        {/* Message Content */}
        <div className="text-sm text-slate-300 mt-0.5 whitespace-pre-wrap select-text font-normal">
          {renderContent(message.content)}
        </div>

        {/* Voice Note Player if voice note */}
        {message.isVoiceNote && (
          <div className="mt-2 bg-[#141722] border border-white/[0.08] rounded-2xl p-3 max-w-sm flex items-center gap-3 shadow-md">
            <button
              onClick={() => setIsPlayingAudio(!isPlayingAudio)}
              className="w-9 h-9 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 transition-all shadow-md shadow-indigo-600/30"
            >
              {isPlayingAudio ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
            </button>
            <div className="flex-1 flex items-center gap-1">
              {[12, 24, 18, 30, 22, 14, 28, 16, 20, 32, 18, 10, 26, 14].map((h, i) => (
                <div
                  key={i}
                  className={`w-1 rounded-full transition-all duration-300 ${
                    isPlayingAudio ? 'bg-indigo-500 animate-pulse' : 'bg-slate-700'
                  }`}
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              0:{message.voiceDuration || 12}s
            </span>
          </div>
        )}

        {/* Attachments preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <div key={att.id} className="rounded-xl overflow-hidden border border-white/[0.08] max-w-md shadow-lg">
                {att.type === 'image' && (
                  <img src={att.url} alt={att.name} className="max-h-64 object-cover rounded-xl" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Emoji Reactions Bar */}
        {message.reactions && message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {message.reactions.map((reaction) => {
              const hasReacted = reaction.users.includes(currentUser.id);
              return (
                <button
                  key={reaction.emoji}
                  onClick={() => onReact(message.id, reaction.emoji)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-semibold transition-all ${
                    hasReacted
                      ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-400 shadow-sm'
                      : 'bg-[#141722] border-white/[0.06] text-slate-300 hover:bg-white/[0.06]'
                  }`}
                >
                  <span>{reaction.emoji}</span>
                  <span>{reaction.count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Hover Action Bar */}
      {showActions && (
        <div
          id={`actions-bar-msg-${message.id}`}
          className="absolute -top-3.5 right-4 bg-[#141724]/95 backdrop-blur-md border border-white/10 rounded-xl shadow-xl flex items-center p-0.5 z-20"
        >
          <div className="relative">
            <button
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              title="Adicionar Reação"
              className="p-1.5 hover:bg-white/[0.08] text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <Smile className="w-4 h-4" />
            </button>
            {showEmojiPicker && (
              <EmojiReactionPicker
                onSelectEmoji={(emoji) => {
                  onReact(message.id, emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            )}
          </div>

          <button
            onClick={() => onReply(message)}
            title="Responder Mensagem"
            className="p-1.5 hover:bg-white/[0.08] text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <Reply className="w-4 h-4" />
          </button>

          {onPin && (
            <button
              onClick={() => onPin(message.id)}
              title={message.pinned ? 'Desafixar Mensagem' : 'Fixar Mensagem'}
              className={`p-1.5 hover:bg-white/[0.08] rounded-lg transition-colors ${
                message.pinned ? 'text-amber-400' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Pin className="w-4 h-4" />
            </button>
          )}

          {canDelete && onDelete && (
            <button
              onClick={() => onDelete(message.id)}
              title="Excluir Mensagem"
              className="p-1.5 hover:bg-white/[0.08] text-slate-400 hover:text-rose-400 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </div>
  );
};
