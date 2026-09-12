import React, { useState, useEffect } from 'react';
import { Server } from '../../types';
import { Plus, Compass, Download, ShieldCheck, Flame, RefreshCw, Bell } from 'lucide-react';
import { updateService, UpdateState } from '../../services/updateService';

interface ServerNavProps {
  servers: Server[];
  activeServerId: string | null;
  unreadNotificationsCount?: number;
  onSelectServer: (id: string | null) => void;
  onOpenCreateServer: () => void;
  onOpenInstaller: () => void;
  onOpenExplore?: () => void;
  onOpenNotifications?: () => void;
}

export const ServerNav: React.FC<ServerNavProps> = ({
  servers,
  activeServerId,
  unreadNotificationsCount = 0,
  onSelectServer,
  onOpenCreateServer,
  onOpenInstaller,
  onOpenExplore,
  onOpenNotifications,
}) => {
  const [updateState, setUpdateState] = useState<UpdateState>(updateService.getState());

  useEffect(() => {
    return updateService.subscribe((state) => {
      setUpdateState(state);
    });
  }, []);
  return (
    <nav
      id="server-navigation-bar"
      aria-label="Servidores"
      className="w-[72px] bg-[#07080c] border-r border-white/[0.06] flex flex-col items-center py-3.5 gap-2 shrink-0 z-30 select-none overflow-y-auto no-scrollbar"
    >
      {/* Braza Talk Home / Direct Messages */}
      <div className="relative group flex items-center justify-center w-full">
        <div
          className={`absolute left-0 w-1 bg-indigo-500 rounded-r-full transition-all duration-300 ${
            activeServerId === null ? 'h-9 shadow-[0_0_12px_rgba(99,102,241,0.8)]' : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'
          }`}
        />
        <button
          id="btn-nav-home-dms"
          onClick={() => onSelectServer(null)}
          title="Mensagens Diretas & Início"
          className={`w-12 h-12 flex items-center justify-center transition-all duration-300 cursor-pointer ${
            activeServerId === null
              ? 'rounded-[16px] bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-lg shadow-indigo-500/25 ring-2 ring-indigo-400/30'
              : 'rounded-[22px] bg-[#12141d] text-slate-400 hover:rounded-[16px] hover:bg-indigo-600 hover:text-white hover:shadow-md hover:shadow-indigo-600/20 border border-white/[0.04]'
          }`}
        >
          <Flame className="w-6 h-6 fill-current" />
        </button>
      </div>

      <div className="w-8 h-[1.5px] bg-white/[0.08] rounded-full my-1" />

      {/* Servers List */}
      <div className="flex flex-col gap-2.5 w-full">
        {servers.map((server) => {
          const isActive = activeServerId === server.id;
          return (
            <div key={server.id} className="relative group flex items-center justify-center w-full">
              {/* Active / Hover White Pill */}
              <div
                className={`absolute left-0 w-1 bg-white rounded-r-full transition-all duration-300 ${
                  isActive ? 'h-9 shadow-[0_0_10px_rgba(255,255,255,0.7)]' : 'h-2 scale-0 group-hover:scale-100 group-hover:h-5'
                }`}
              />

              <button
                id={`btn-server-item-${server.id}`}
                onClick={() => onSelectServer(server.id)}
                title={server.name}
                className={`relative w-12 h-12 flex items-center justify-center font-bold text-lg transition-all duration-300 cursor-pointer overflow-hidden ${
                  isActive
                    ? 'rounded-[16px] bg-indigo-600 text-white ring-2 ring-indigo-400/40 shadow-lg shadow-indigo-600/30'
                    : 'rounded-[22px] bg-[#12141d] text-slate-300 hover:rounded-[16px] hover:bg-indigo-600 hover:text-white border border-white/[0.04] shadow-sm'
                }`}
              >
                {server.icon.length <= 4 ? (
                  <span className="text-xl">{server.icon}</span>
                ) : (
                  <img src={server.icon} alt={server.name} className="w-full h-full object-cover" />
                )}

                {server.e2eeEnabled && (
                  <div
                    title="Cifra de Canal AES-GCM Ativa"
                    className="absolute bottom-0 right-0 p-0.5 bg-[#090a0f] rounded-tl-md text-emerald-400 border-t border-l border-white/[0.08]"
                  >
                    <ShieldCheck className="w-3 h-3" />
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Action Buttons: Add Server */}
      <div className="relative group flex items-center justify-center w-full mt-1">
        <div className="absolute left-0 w-1 bg-emerald-400 rounded-r-full h-2 scale-0 group-hover:scale-100 group-hover:h-5 transition-all duration-300" />
        <button
          id="btn-add-new-server"
          onClick={onOpenCreateServer}
          title="Adicionar um Servidor"
          className="w-12 h-12 rounded-[22px] bg-[#12141d] text-emerald-400 hover:rounded-[16px] hover:bg-emerald-500 hover:text-slate-950 flex items-center justify-center transition-all duration-300 cursor-pointer border border-white/[0.04] hover:shadow-lg hover:shadow-emerald-500/20"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Explore Public Hub */}
      <div className="relative group flex items-center justify-center w-full">
        <button
          id="btn-explore-servers"
          onClick={onOpenExplore}
          title="Buscar e Explorar Comunidades"
          className="w-12 h-12 rounded-[22px] bg-[#12141d] text-slate-400 hover:rounded-[16px] hover:bg-emerald-500 hover:text-slate-950 flex items-center justify-center transition-all duration-300 cursor-pointer border border-white/[0.04]"
        >
          <Compass className="w-5 h-5" />
        </button>
      </div>

      <div className="w-8 h-[1.5px] bg-white/[0.08] rounded-full my-1 mt-auto" />

      {/* Notifications & Invites Button */}
      <div className="relative group flex items-center justify-center w-full mb-1">
        <button
          id="btn-open-notifications-nav"
          onClick={onOpenNotifications}
          title={
            unreadNotificationsCount > 0
              ? `${unreadNotificationsCount} aviso(s) ou convite(s) pendente(s)`
              : 'Avisos & Convites de Sala'
          }
          className={`w-12 h-12 rounded-[22px] flex items-center justify-center transition-all duration-300 cursor-pointer relative ${
            unreadNotificationsCount > 0
              ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-400/50'
              : 'bg-[#12141d] text-slate-400 hover:rounded-[16px] hover:bg-orange-500/20 hover:text-orange-400 border border-white/[0.04]'
          }`}
        >
          <Bell className={`w-5 h-5 ${unreadNotificationsCount > 0 ? 'animate-bounce' : ''}`} />

          {unreadNotificationsCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-gradient-to-r from-red-500 to-orange-500 border-2 border-[#07080c] rounded-full text-[10px] font-extrabold text-white flex items-center justify-center shadow-md animate-pulse">
              {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
            </span>
          )}
        </button>
      </div>

      {/* Installer & PWA Download Button */}
      <div className="relative group flex items-center justify-center w-full mb-1">
        <button
          id="btn-open-pwa-installer"
          onClick={onOpenInstaller}
          title={updateState.updateAvailable ? `Nova versão v${updateState.latestVersion} disponível! Clique para atualizar.` : "Instalações & Central de Updates"}
          className={`w-12 h-12 rounded-[22px] flex items-center justify-center transition-all duration-300 cursor-pointer relative ${
            updateState.updateAvailable
              ? 'bg-gradient-to-tr from-emerald-600 to-indigo-600 text-white shadow-lg shadow-emerald-500/30 ring-2 ring-emerald-400/50 animate-bounce'
              : 'bg-[#12141d] text-emerald-400 hover:rounded-[16px] hover:bg-emerald-500 hover:text-slate-950 border border-emerald-500/30 hover:border-transparent hover:shadow-lg hover:shadow-emerald-500/20'
          }`}
        >
          {updateState.updateAvailable ? (
            <RefreshCw className="w-5 h-5 animate-spin" />
          ) : (
            <Download className="w-5 h-5 animate-pulse" />
          )}

          {updateState.updateAvailable && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-[#07080c] rounded-full" />
          )}
        </button>
      </div>
    </nav>
  );
};
