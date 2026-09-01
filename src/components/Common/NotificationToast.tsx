import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Tv, Radio, MessageSquare, Shield, X } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationToastProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
  onNavigate?: (serverId?: string, channelId?: string) => void;
}

const TOAST_DURATION_MS = 4500;

interface SingleToastProps {
  item: NotificationItem;
  onDismiss: (id: string) => void;
  onNavigate?: (serverId?: string, channelId?: string) => void;
}

const SingleToast: React.FC<SingleToastProps> = ({ item, onDismiss, onNavigate }) => {
  const [progress, setProgress] = useState(100);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused) return;

    const startTime = Date.now();
    const intervalTime = 50;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remainingPct = Math.max(0, 100 - (elapsed / TOAST_DURATION_MS) * 100);
      setProgress(remainingPct);

      if (elapsed >= TOAST_DURATION_MS) {
        clearInterval(interval);
        onDismiss(item.id);
      }
    }, intervalTime);

    return () => clearInterval(interval);
  }, [item.id, isPaused, onDismiss]);

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'stream_start':
      case 'stream_viewer':
        return <Tv className="w-4 h-4 text-indigo-400" />;
      case 'voice_join':
        return <Radio className="w-4 h-4 text-emerald-400" />;
      case 'mention':
        return <Bell className="w-4 h-4 text-amber-400" />;
      case 'bot_alert':
        return <Shield className="w-4 h-4 text-pink-400" />;
      default:
        return <MessageSquare className="w-4 h-4 text-indigo-400" />;
    }
  };

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: -20, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88, y: -10, transition: { duration: 0.2 } }}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="pointer-events-auto bg-[#121520]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-2xl flex flex-col gap-2.5 cursor-pointer hover:bg-[#161a28] transition-all group overflow-hidden relative"
      onClick={() => {
        if (onNavigate) onNavigate(item.serverId, item.channelId);
        onDismiss(item.id);
      }}
    >
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-[#1a1e2d] border border-white/[0.06] flex items-center justify-center shrink-0 shadow-inner">
          {getIcon(item.type)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-white truncate tracking-tight">{item.title}</h4>
            <button
              id={`btn-close-toast-${item.id}`}
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(item.id);
              }}
              className="text-slate-400 hover:text-white transition-colors p-0.5 rounded hover:bg-white/[0.08]"
              title="Fechar notificação"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed font-normal">{item.body}</p>
        </div>
      </div>

      {/* Auto-dismiss progress bar */}
      <div className="w-full bg-white/[0.06] h-1 rounded-full overflow-hidden">
        <div
          className="h-full bg-indigo-500 transition-all duration-75 ease-linear rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
};

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onDismiss,
  onNavigate,
}) => {
  return (
    <div id="toast-notifications-container" className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {notifications.slice(-4).map((item) => (
          <SingleToast
            key={item.id}
            item={item}
            onDismiss={onDismiss}
            onNavigate={onNavigate}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};
