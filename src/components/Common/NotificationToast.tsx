import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, Tv, Radio, MessageSquare, Shield, X } from 'lucide-react';
import { NotificationItem } from '../../types';

interface NotificationToastProps {
  notifications: NotificationItem[];
  onDismiss: (id: string) => void;
  onNavigate?: (serverId?: string, channelId?: string) => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({
  notifications,
  onDismiss,
  onNavigate,
}) => {
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
    <div id="toast-notifications-container" className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      <AnimatePresence>
        {notifications.slice(-3).map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
            className="pointer-events-auto bg-[#121520]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-2xl flex items-start gap-3 cursor-pointer hover:bg-[#161a28] transition-all group"
            onClick={() => {
              if (onNavigate) onNavigate(item.serverId, item.channelId);
              onDismiss(item.id);
            }}
          >
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
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-300 mt-0.5 line-clamp-2 leading-relaxed font-normal">{item.body}</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
