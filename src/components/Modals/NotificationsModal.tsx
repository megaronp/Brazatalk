import React, { useState } from 'react';
import { 
  Bell, 
  X, 
  CheckCheck, 
  Volume2, 
  Hash, 
  Sparkles, 
  ArrowRight, 
  Trash2, 
  UserCheck, 
  ShieldAlert, 
  Radio,
  CheckCircle2
} from 'lucide-react';

export interface AppNotification {
  id: string;
  type: 'invite' | 'news' | 'mention';
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  inviteData?: {
    inviteId: string;
    serverId: string;
    serverName: string;
    channelId: string;
    channelName: string;
    senderUserId: string;
    senderName: string;
    senderAvatar?: string;
  };
}

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onMarkAllAsRead: () => void;
  onClearAll: () => void;
  onAcceptInvite: (invite: NonNullable<AppNotification['inviteData']>) => void;
  onDismissNotification: (id: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  isOpen,
  onClose,
  notifications,
  onMarkAllAsRead,
  onClearAll,
  onAcceptInvite,
  onDismissNotification,
}) => {
  const [activeFilter, setActiveFilter] = useState<'all' | 'invites' | 'news'>('all');

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'invites') return n.type === 'invite';
    if (activeFilter === 'news') return n.type === 'news';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read).length;
  const inviteCount = notifications.filter((n) => n.type === 'invite').length;

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Agora mesmo';
    if (mins < 60) return `há ${mins}m`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `há ${hours}h`;
    return new Date(timestamp).toLocaleDateString('pt-BR');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#07080d]/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div 
        id="braza-notifications-modal"
        className="w-full max-w-xl bg-[#11131f] border border-white/[0.08] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-orange-500/10 via-transparent to-transparent">
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 shadow-inner">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-orange-500 to-amber-500 text-[11px] font-bold text-white rounded-full flex items-center justify-center shadow-lg animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide flex items-center gap-2">
                Notícias & Convites
                {unreadCount > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-semibold border border-orange-500/30">
                    {unreadCount} novo{unreadCount > 1 ? 's' : ''}
                  </span>
                )}
              </h2>
              <p className="text-xs text-zinc-400">
                Convites para salas de voz, mensagens e atualizações da plataforma
              </p>
            </div>
          </div>
          <button
            id="close-notifications-btn"
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white rounded-xl hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Navigation & Global Actions */}
        <div className="px-5 sm:px-6 py-3 border-b border-white/[0.04] bg-[#0c0e18] flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5">
            <button
              id="filter-all-notifications"
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeFilter === 'all'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Todos ({notifications.length})
            </button>
            <button
              id="filter-invites-notifications"
              onClick={() => setActiveFilter('invites')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeFilter === 'invites'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Convites de Sala
              {inviteCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-amber-400/30 text-amber-300 text-[10px] flex items-center justify-center font-bold">
                  {inviteCount}
                </span>
              )}
            </button>
            <button
              id="filter-news-notifications"
              onClick={() => setActiveFilter('news')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeFilter === 'news'
                  ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25'
                  : 'text-zinc-400 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              Notícias Braza
            </button>
          </div>

          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                id="mark-all-read-btn"
                onClick={onMarkAllAsRead}
                className="px-2.5 py-1 text-xs text-zinc-400 hover:text-orange-400 rounded-lg hover:bg-white/[0.04] transition-colors flex items-center gap-1 whitespace-nowrap"
                title="Marcar todas como lidas"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lidas</span>
              </button>
            )}
            {notifications.length > 0 && (
              <button
                id="clear-all-notifications-btn"
                onClick={onClearAll}
                className="px-2.5 py-1 text-xs text-zinc-500 hover:text-rose-400 rounded-lg hover:bg-rose-500/10 transition-colors flex items-center gap-1 whitespace-nowrap"
                title="Limpar histórico"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Notifications List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 divide-y divide-white/[0.03]">
          {filteredNotifications.length === 0 ? (
            <div className="py-14 text-center flex flex-col items-center justify-center">
              <div className="w-14 h-14 rounded-3xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-center text-zinc-500 mb-3">
                <Bell className="w-6 h-6 stroke-[1.5]" />
              </div>
              <p className="text-sm font-semibold text-zinc-300">Nenhum aviso no momento</p>
              <p className="text-xs text-zinc-500 max-w-xs mt-1">
                {activeFilter === 'invites'
                  ? 'Você não possui convites de salas pendentes.'
                  : 'Tudo em dia! Novos convites e anúncios da comunidade aparecerão aqui.'}
              </p>
            </div>
          ) : (
            filteredNotifications.map((notification) => {
              const isInvite = notification.type === 'invite' && notification.inviteData;

              return (
                <div
                  key={notification.id}
                  className={`pt-3 first:pt-0 transition-all rounded-2xl p-3 sm:p-4 border ${
                    notification.read
                      ? 'bg-white/[0.01] border-white/[0.04]'
                      : 'bg-orange-500/[0.04] border-orange-500/20 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      {/* Icon */}
                      <div className="shrink-0 mt-0.5">
                        {isInvite ? (
                          notification.inviteData?.senderAvatar ? (
                            <img
                              src={notification.inviteData.senderAvatar}
                              alt={notification.inviteData.senderName}
                              className="w-10 h-10 rounded-2xl object-cover ring-2 ring-orange-500/30"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center font-bold shadow-md">
                              {notification.inviteData?.senderName?.charAt(0).toUpperCase() || 'B'}
                            </div>
                          )
                        ) : notification.type === 'news' ? (
                          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                            <Sparkles className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-10 h-10 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 flex items-center justify-center">
                            <Radio className="w-5 h-5" />
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h4 className="text-sm font-bold text-white tracking-tight">
                            {notification.title}
                          </h4>
                          {isInvite && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              Convite Pendente
                            </span>
                          )}
                          {!notification.read && (
                            <span className="w-2 h-2 rounded-full bg-orange-500" />
                          )}
                          <span className="text-[11px] text-zinc-500 ml-auto">
                            {formatRelativeTime(notification.timestamp)}
                          </span>
                        </div>

                        <p className="text-xs text-zinc-300 leading-relaxed mb-3">
                          {notification.message}
                        </p>

                        {/* Invite Details & Action Buttons */}
                        {isInvite && notification.inviteData && (
                          <div className="bg-[#0b0d16] border border-white/[0.06] rounded-2xl p-3 mb-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
                                <span>{notification.inviteData.serverName}</span>
                                <span className="text-zinc-600">•</span>
                                <span className="text-orange-400 flex items-center gap-1">
                                  <Volume2 className="w-3.5 h-3.5" />
                                  {notification.inviteData.channelName}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-400">
                                Convidado por{' '}
                                <strong className="text-zinc-200">
                                  {notification.inviteData.senderName}
                                </strong>
                              </p>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-auto">
                              <button
                                id={`dismiss-invite-${notification.id}`}
                                onClick={() => onDismissNotification(notification.id)}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
                              >
                                Recusar
                              </button>
                              <button
                                id={`accept-invite-${notification.id}`}
                                onClick={() => {
                                  if (notification.inviteData) {
                                    onAcceptInvite(notification.inviteData);
                                    onDismissNotification(notification.id);
                                    onClose();
                                  }
                                }}
                                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 shadow-md shadow-orange-500/20 flex items-center gap-1.5 transition-all transform active:scale-95"
                              >
                                <span>Entrar na Sala</span>
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delete action */}
                    {!isInvite && (
                      <button
                        onClick={() => onDismissNotification(notification.id)}
                        className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded-lg hover:bg-white/[0.04] transition-colors"
                        title="Remover aviso"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="p-3 sm:px-6 bg-[#0c0e18] border-t border-white/[0.04] text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Braza Talk Realtime Signaling Engine</span>
          <span className="text-emerald-400 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3 h-3" />
            Notificações sincronizadas
          </span>
        </div>
      </div>
    </div>
  );
};
