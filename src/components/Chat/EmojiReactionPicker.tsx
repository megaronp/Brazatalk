import React from 'react';

interface EmojiReactionPickerProps {
  onSelectEmoji: (emoji: string) => void;
  onClose: () => void;
}

const COMMON_EMOJIS = ['👍', '❤️', '🔥', '🎉', '🚀', '👀', '💯', '😂', '🔒', '🛡️', '⚡', '💡', '🎮', '🎧', '✨'];

export const EmojiReactionPicker: React.FC<EmojiReactionPickerProps> = ({ onSelectEmoji, onClose }) => {
  return (
    <div
      id="popover-emoji-picker"
      className="absolute bottom-10 right-0 bg-[#121520]/95 border border-white/10 rounded-2xl p-3 shadow-2xl z-50 flex flex-wrap gap-1.5 w-64 backdrop-blur-xl"
    >
      <div className="w-full flex items-center justify-between pb-1.5 mb-1 border-b border-white/[0.06] text-[11px] font-bold text-slate-400 uppercase tracking-wider">
        <span>Reagir com Emoji</span>
        <button onClick={onClose} className="hover:text-white p-0.5 rounded hover:bg-white/[0.08]">✕</button>
      </div>

      {COMMON_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          onClick={() => {
            onSelectEmoji(emoji);
            onClose();
          }}
          className="w-9 h-9 rounded-xl hover:bg-white/[0.08] text-lg flex items-center justify-center transition-all hover:scale-125 cursor-pointer"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
};
