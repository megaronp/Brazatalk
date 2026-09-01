import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, Check, ChevronRight } from 'lucide-react';
import { pwaInstallService, PwaState } from '../../services/pwaInstallService';

interface PWAInstallBannerProps {
  onOpenInstallerModal: () => void;
}

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ onOpenInstallerModal }) => {
  const [pwaState, setPwaState] = useState<PwaState>(pwaInstallService.getState());
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem('braza_pwa_banner_dismissed') === 'true';
    } catch {
      return false;
    }
  });
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const unsub = pwaInstallService.subscribe((state) => {
      setPwaState(state);
    });
    return () => unsub();
  }, []);

  // Hide if already running in standalone PWA app mode or dismissed in this session
  if (pwaState.isInstalled || isDismissed) {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    try {
      sessionStorage.setItem('braza_pwa_banner_dismissed', 'true');
    } catch {}
  };

  const handleInstallClick = async () => {
    setInstalling(true);
    const result = await pwaInstallService.promptInstall();
    setInstalling(false);
    if (result === 'manual_required' || result === 'dismissed') {
      onOpenInstallerModal();
    }
  };

  const isMobile = pwaState.platform === 'android' || pwaState.platform === 'ios';

  return (
    <div
      id="pwa-install-app-banner"
      className="bg-gradient-to-r from-indigo-950 via-[#13172e] to-purple-950 border-b border-indigo-500/30 px-3.5 sm:px-4 py-2 flex items-center justify-between gap-3 text-xs z-30 shadow-md animate-in slide-in-from-top duration-200"
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 shrink-0">
          <Smartphone className="w-4 h-4" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-white font-bold truncate tracking-tight flex items-center gap-1.5">
            {isMobile ? '📱 Use o Braza Talk como Aplicativo Nativo' : '💻 Instale o Braza Talk no seu Computador'}
          </span>
          <span className="text-slate-300 text-[11px] truncate">
            {isMobile
              ? 'Abra em tela cheia sem barra de endereço do navegador e com som em segundo plano'
              : 'Janela dedicada sem abas de navegador e menor latência de áudio'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          id="btn-banner-install-pwa"
          onClick={handleInstallClick}
          disabled={installing}
          className="bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer whitespace-nowrap"
        >
          <Download className="w-3.5 h-3.5" />
          <span>{pwaState.canInstallDirectly ? 'Instalar Agora' : 'Como Instalar'}</span>
        </button>

        <button
          id="btn-banner-dismiss-pwa"
          onClick={handleDismiss}
          title="Fechar aviso de instalação"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
