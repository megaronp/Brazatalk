import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface OfflineBannerProps {
  isOnline: boolean;
  pendingSyncCount: number;
  onManualSync: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({ isOnline, pendingSyncCount, onManualSync }) => {
  if (isOnline && pendingSyncCount === 0) return null;

  return (
    <div
      id="offline-status-banner"
      className={`px-4 py-2.5 text-xs font-semibold flex items-center justify-between transition-colors shadow-lg z-40 ${
        !isOnline ? 'bg-rose-600 text-white' : 'bg-amber-400 text-slate-950 font-bold'
      }`}
    >
      <div className="flex items-center gap-2">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span>
          {!isOnline
            ? 'Você está offline no momento. O histórico de mensagens e canais em cache permanecem disponíveis para leitura local.'
            : `Conexão restaurada! Sincronizando ${pendingSyncCount} mensagem(ns) pendente(s)...`}
        </span>
      </div>

      <button
        id="btn-sync-offline-data"
        onClick={onManualSync}
        className="flex items-center gap-1.5 bg-black/20 hover:bg-black/30 px-3 py-1 rounded-xl transition-all cursor-pointer text-xs font-bold shrink-0"
      >
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
        <span>Sincronizar</span>
      </button>
    </div>
  );
};
