import React, { useState, useRef, useEffect } from 'react';
import { Channel, Message, MessageAttachment, User, Server, Permission } from '../../types';
import {
  PlusCircle,
  Smile,
  Send,
  Lock,
  X,
  Bot,
  Sparkles,
  FileText,
  Image as ImageIcon,
} from 'lucide-react';
import { BOT_COMMANDS, BotCommand } from '../../services/botEngine';
import { EmojiReactionPicker } from './EmojiReactionPicker';
import { hasPermission } from '../../utils/permissions';

interface ChatInputProps {
  channel: Channel;
  replyingTo: Message | null;
  currentUser?: User | null;
  server?: Server | null;
  onCancelReply: () => void;
  onSendMessage: (
    content: string,
    isVoiceNote?: boolean,
    voiceDuration?: number,
    attachments?: MessageAttachment[]
  ) => void;
  isEncrypted: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  channel,
  replyingTo,
  currentUser,
  server,
  onCancelReply,
  onSendMessage,
  isEncrypted,
}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<BotCommand[]>(BOT_COMMANDS);
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState<MessageAttachment | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSend = currentUser && server ? hasPermission(currentUser, server, Permission.SEND_MESSAGES) : true;
  const canAttach = currentUser && server ? hasPermission(currentUser, server, Permission.ATTACH_FILES) : true;

  // Command auto-complete trigger
  useEffect(() => {
    if (text.startsWith('/')) {
      const query = text.toLowerCase();
      const matched = BOT_COMMANDS.filter((cmd) => cmd.command.startsWith(query));
      setFilteredCommands(matched);
      setShowCommandMenu(matched.length > 0);
      setSelectedCmdIndex(0);
    } else {
      setShowCommandMenu(false);
    }
  }, [text]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommandMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCmdIndex((prev) => (prev + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCmdIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        const selected = filteredCommands[selectedCmdIndex];
        if (selected) {
          setText(`${selected.command} `);
          setShowCommandMenu(false);
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed && !pendingAttachment) return;
    const finalContent = trimmed || (pendingAttachment ? `[Anexo: ${pendingAttachment.name}]` : '');
    onSendMessage(
      finalContent,
      false,
      undefined,
      pendingAttachment ? [pendingAttachment] : undefined
    );
    setText('');
    setPendingAttachment(null);
    setShowCommandMenu(false);
  };

  // Process and optimize real file upload
  const processFile = (file: File) => {
    if (!file) return;

    // Hard limit: 700 KB for direct inline base64 to stay under Firestore's 1MB document limit
    const MAX_FILE_SIZE = 700 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `O arquivo "${file.name}" (${(file.size / 1024 / 1024).toFixed(2)} MB) ultrapassa o limite de 700 KB permitido para anexos inline no chat.`
      );
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Resize if too large to save space in Firestore / IndexedDB
          const maxDim = 1200;
          let width = img.width;
          let height = img.height;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const optimizedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
            setPendingAttachment({
              id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              url: optimizedDataUrl,
              type: 'image',
              size: file.size,
            });
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPendingAttachment({
          id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          url: event.target?.result as string,
          type: 'file',
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset file input so user can pick the same file again if desired
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (!canAttach) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  return (
    <div
      id="chat-input-wrapper"
      className="p-4 pt-0 select-none relative"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      {/* Hidden file picker input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*,.pdf,.txt,.zip"
        className="hidden"
      />

      {/* Drag overlay indicator */}
      {isDraggingOver && (
        <div className="absolute inset-0 m-4 mb-0 bg-indigo-600/20 border-2 border-dashed border-indigo-400 rounded-2xl flex items-center justify-center z-50 backdrop-blur-sm pointer-events-none animate-in fade-in duration-150">
          <div className="flex items-center gap-2 text-indigo-200 font-semibold text-sm">
            <ImageIcon className="w-5 h-5 animate-bounce" />
            <span>Solte o arquivo ou imagem para anexar</span>
          </div>
        </div>
      )}

      {/* Slash command popover */}
      {showCommandMenu && (
        <div
          id="popover-slash-commands"
          className="absolute bottom-16 left-4 right-4 bg-[#121520]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl p-2 z-40 max-h-60 overflow-y-auto no-scrollbar"
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase border-b border-white/[0.06] mb-1 tracking-wider">
            <Bot className="w-3.5 h-3.5 text-indigo-400" />
            <span>Comandos e Bots Disponíveis</span>
          </div>
          {filteredCommands.map((cmd, idx) => (
            <button
              key={cmd.command}
              onClick={() => {
                setText(`${cmd.command} `);
                setShowCommandMenu(false);
                inputRef.current?.focus();
              }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-colors ${
                idx === selectedCmdIndex
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'hover:bg-white/[0.06] text-slate-300'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="font-mono font-bold text-xs">{cmd.command}</span>
                <span className="text-xs opacity-80">{cmd.description}</span>
              </div>
              <span className="text-[10px] font-mono opacity-60">{cmd.syntax}</span>
            </button>
          ))}
        </div>
      )}

      {/* Reply Banner */}
      {replyingTo && (
        <div className="bg-[#141722] px-3.5 py-2 rounded-t-xl border-t border-x border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 truncate">
            <span className="text-slate-400 font-medium">Respondendo a</span>
            <span className="font-bold text-indigo-400">@{replyingTo.authorName}</span>
            <span className="truncate italic opacity-75">&quot;{replyingTo.content}&quot;</span>
          </div>
          <button onClick={onCancelReply} className="hover:text-white transition-colors p-1 rounded hover:bg-white/[0.08]">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Attachment Preview Banner */}
      {pendingAttachment && (
        <div className="bg-[#121520] px-3.5 py-2 rounded-t-xl border-t border-x border-indigo-500/30 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2.5 min-w-0">
            {pendingAttachment.type === 'image' ? (
              <img
                src={pendingAttachment.url}
                alt="Preview"
                className="w-8 h-8 rounded-lg object-cover border border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center">
                <FileText className="w-4 h-4" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-semibold text-white text-xs truncate max-w-xs">{pendingAttachment.name}</p>
              <p className="text-[10px] text-slate-400 font-mono">
                {pendingAttachment.size ? `${(pendingAttachment.size / 1024).toFixed(1)} KB` : 'Pronto para envio'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setPendingAttachment(null)}
            title="Remover anexo"
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Input Container */}
      <div
        className={`bg-[#141722] border border-white/[0.08] rounded-2xl flex items-center px-4 py-2.5 gap-3 transition-all ${
          canSend
            ? 'focus-within:border-indigo-500/50 focus-within:shadow-[0_0_20px_-3px_rgba(99,102,241,0.2)]'
            : 'opacity-60 cursor-not-allowed'
        } ${replyingTo || pendingAttachment ? 'rounded-t-none' : ''}`}
      >
        {/* Attachment button */}
        {canAttach && (
          <button
            id="btn-chat-attach-file"
            title="Adicionar Anexo / Mídia (ou arraste e solte)"
            onClick={() => fileInputRef.current?.click()}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.06] cursor-pointer"
          >
            <PlusCircle className="w-5 h-5" />
          </button>
        )}

        {/* Channel Cipher badge */}
        {isEncrypted && (
          <div
            title="Cifra AES-GCM-256 ativa no canal"
            className="flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg font-semibold shrink-0 cursor-default"
          >
            <Lock className="w-3 h-3" />
            <span className="hidden sm:inline">AES-GCM</span>
          </div>
        )}

        {/* Text Input */}
        <input
          id="chat-message-input"
          ref={inputRef}
          type="text"
          value={text}
          disabled={!canSend}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            !canSend
              ? 'Você não tem permissão para enviar mensagens neste canal'
              : isEncrypted
              ? `Mensagem criptografada (AES-GCM) para #${channel.name}...`
              : `Conversar em #${channel.name} (Digite / para comandos de IA e bots)`
          }
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none select-text font-normal disabled:cursor-not-allowed"
        />

        {/* Right Action Buttons */}
        <div className="flex items-center gap-1 text-slate-400 relative">
          {/* Quick AI Trigger button */}
          {!isEncrypted && canSend && (
            <button
              id="btn-quick-ai-trigger"
              onClick={() => {
                setText('/ai ');
                inputRef.current?.focus();
              }}
              title="Perguntar ao Gemini AI (/ai)"
              className="hover:text-indigo-400 p-1.5 transition-colors rounded-lg hover:bg-white/[0.06] cursor-pointer"
            >
              <Sparkles className="w-4 h-4" />
            </button>
          )}

          {/* Emoji picker toggle */}
          {canSend && (
            <div className="relative">
              <button
                id="btn-toggle-emoji-input"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Inserir Emoji"
                className="hover:text-white p-1.5 transition-colors rounded-lg hover:bg-white/[0.06] cursor-pointer"
              >
                <Smile className="w-4 h-4" />
              </button>
              {showEmojiPicker && (
                <EmojiReactionPicker
                  onSelectEmoji={(emoji) => {
                    setText((prev) => prev + emoji);
                    setShowEmojiPicker(false);
                  }}
                  onClose={() => setShowEmojiPicker(false)}
                />
              )}
            </div>
          )}

          {/* Send Button */}
          <button
            id="btn-send-message-submit"
            onClick={handleSend}
            title="Enviar Mensagem (Enter)"
            disabled={!canSend || (!text.trim() && !pendingAttachment)}
            className={`p-1.5 rounded-xl transition-all ${
              canSend && (text.trim() || pendingAttachment)
                ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30 cursor-pointer'
                : 'text-slate-600 cursor-not-allowed'
            }`}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

