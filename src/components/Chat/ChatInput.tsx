import React, { useState, useRef, useEffect } from 'react';
import { Channel, Message } from '../../types';
import {
  PlusCircle,
  Smile,
  Mic,
  Send,
  Lock,
  X,
  Bot,
  Sparkles,
  Square,
} from 'lucide-react';
import { BOT_COMMANDS, BotCommand } from '../../services/botEngine';
import { EmojiReactionPicker } from './EmojiReactionPicker';

interface ChatInputProps {
  channel: Channel;
  replyingTo: Message | null;
  onCancelReply: () => void;
  onSendMessage: (content: string, isVoiceNote?: boolean, voiceDuration?: number) => void;
  isEncrypted: boolean;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  channel,
  replyingTo,
  onCancelReply,
  onSendMessage,
  isEncrypted,
}) => {
  const [text, setText] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<BotCommand[]>(BOT_COMMANDS);
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

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
    if (!text.trim()) return;
    onSendMessage(text.trim());
    setText('');
    setShowCommandMenu(false);
  };

  // Voice note recording simulation / media recorder
  const startVoiceRecording = () => {
    setIsRecordingVoice(true);
    setRecordingSeconds(0);
    recordTimerRef.current = setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  };

  const finishVoiceRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    const duration = Math.max(1, recordingSeconds);
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
    onSendMessage('🎙️ Mensagem de Voz Criptografada', true, duration);
  };

  const cancelVoiceRecording = () => {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setIsRecordingVoice(false);
    setRecordingSeconds(0);
  };

  return (
    <div id="chat-input-wrapper" className="p-4 pt-0 select-none relative">
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

      {/* Main Input Container */}
      <div
        className={`bg-[#141722] border border-white/[0.08] rounded-2xl flex items-center px-4 py-2.5 gap-3 transition-all focus-within:border-indigo-500/50 focus-within:shadow-[0_0_20px_-3px_rgba(99,102,241,0.2)] ${
          replyingTo ? 'rounded-t-none' : ''
        }`}
      >
        {/* Attachment button */}
        <button
          id="btn-chat-attach-file"
          title="Adicionar Anexo / Mídia"
          onClick={() => {
            onSendMessage('📎 [Imagem Anexada: preview_mockup.png]', false);
          }}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/[0.06]"
        >
          <PlusCircle className="w-5 h-5" />
        </button>

        {/* E2EE Lock badge inside input */}
        {isEncrypted && (
          <div
            title="Criptografia E2EE AES-GCM 256 Ativa nesta sala"
            className="flex items-center gap-1 text-[11px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg font-semibold shrink-0 cursor-default"
          >
            <Lock className="w-3 h-3" />
            <span className="hidden sm:inline">E2EE</span>
          </div>
        )}

        {/* Text Input or Voice Recording Bar */}
        {isRecordingVoice ? (
          <div className="flex-1 flex items-center justify-between text-xs font-semibold text-rose-400">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span>Gravando áudio de voz... 0:{recordingSeconds.toString().padStart(2, '0')}s</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={cancelVoiceRecording}
                className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.12] text-white"
              >
                Cancelar
              </button>
              <button
                onClick={finishVoiceRecording}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 shadow-md"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Enviar</span>
              </button>
            </div>
          </div>
        ) : (
          <input
            id="chat-message-input"
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Conversar em #${channel.name} (Digite / para comandos de bots e IA)`}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 focus:outline-none select-text font-normal"
          />
        )}

        {/* Right Action Buttons */}
        {!isRecordingVoice && (
          <div className="flex items-center gap-1 text-slate-400 relative">
            {/* Quick AI Trigger button */}
            <button
              id="btn-quick-ai-trigger"
              onClick={() => {
                setText('/ai ');
                inputRef.current?.focus();
              }}
              title="Perguntar ao Gemini AI (/ai)"
              className="hover:text-indigo-400 p-1.5 transition-colors rounded-lg hover:bg-white/[0.06]"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            {/* Voice note record button */}
            <button
              id="btn-record-voice-note"
              onClick={startVoiceRecording}
              title="Gravar Mensagem de Voz"
              className="hover:text-white p-1.5 transition-colors rounded-lg hover:bg-white/[0.06]"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Emoji picker toggle */}
            <div className="relative">
              <button
                id="btn-toggle-emoji-input"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Inserir Emoji"
                className="hover:text-white p-1.5 transition-colors rounded-lg hover:bg-white/[0.06]"
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

            {/* Send Button */}
            <button
              id="btn-send-message-submit"
              onClick={handleSend}
              title="Enviar Mensagem (Enter)"
              disabled={!text.trim()}
              className={`p-1.5 rounded-xl transition-all ${
                text.trim()
                  ? 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'text-slate-600 hover:text-slate-400'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
