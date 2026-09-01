import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Monitor, 
  Smartphone, 
  Apple, 
  RefreshCw, 
  CheckCircle2, 
  Sparkles, 
  ShieldCheck, 
  ArrowUpCircle, 
  Zap, 
  Info,
  Check,
  HardDrive,
  Laptop
} from 'lucide-react';
import { updateService, UpdateState } from '../../services/updateService';

interface AppInstallerModalProps {
  onClose: () => void;
  initialTab?: 'install' | 'update';
}

export const AppInstallerModal: React.FC<AppInstallerModalProps> = ({ onClose, initialTab = 'install' }) => {
  const [activeTab, setActiveTab] = useState<'install' | 'update'>(initialTab);
  const [downloadingPlatform, setDownloadingPlatform] = useState<string | null>(null);
  const [updateState, setUpdateState] = useState<UpdateState>(updateService.getState());
  const [pwaInstalledSuccess, setPwaInstalledSuccess] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const clientInfo = updateService.getClientInfo();

  useEffect(() => {
    const unsubscribe = updateService.subscribe((state) => {
      setUpdateState(state);
    });

    // Capture beforeinstallprompt if browser supports it
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      unsubscribe();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleDownload = (platform: string, filename: string) => {
    setDownloadingPlatform(platform);
    setTimeout(() => {
      const blob = new Blob(
        [
          `Braza Talk Native Installer for ${platform}\n` +
          `Version: ${updateState.currentVersion}\n` +
          `Security: E2EE Encrypted Channels Enabled\n` +
          `Package: ${filename}\n` +
          `Build Date: ${new Date().toISOString()}\n`
        ],
        { type: 'text/plain' }
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      setDownloadingPlatform(null);
    }, 700);
  };

  const handleInstallPWA = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setPwaInstalledSuccess(true);
      }
      setDeferredPrompt(null);
    } else {
      // Show visual confirmation guide
      setPwaInstalledSuccess(true);
    }
  };

  const handleCheckForUpdates = () => {
    updateService.checkForUpdates(true);
  };

  const handleApplyOTAUpdate = () => {
    updateService.performOTAUpdate();
  };

  return (
    <div
      id="modal-app-installer"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 select-none overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-[#0f1118] w-full max-w-2xl rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with gradient */}
        <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 p-4 sm:p-6 text-white relative shadow-lg shrink-0">
          <button
            id="btn-close-installer-modal"
            onClick={onClose}
            className="absolute top-3 right-3 sm:top-4 sm:right-4 w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center text-sm transition-colors backdrop-blur-sm border border-white/10 cursor-pointer"
            aria-label="Fechar modal"
          >
            ✕
          </button>

          <div className="flex items-center gap-3 sm:gap-3.5 pr-8">
            <div className="p-2.5 sm:p-3 bg-white/15 rounded-xl sm:rounded-2xl backdrop-blur-md border border-white/20 shadow-inner shrink-0">
              <Download className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black tracking-tight truncate">Central de Instalação & Atualizações</h2>
                <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30 shrink-0">
                  v{updateState.currentVersion}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-indigo-100 mt-0.5 line-clamp-1 sm:line-clamp-none font-normal">
                Instale no seu celular ou PC e mantenha o app sempre atualizado com 1 clique.
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/15">
            <button
              id="tab-installer-platforms"
              onClick={() => setActiveTab('install')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'install'
                  ? 'bg-white text-indigo-900 shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              <span>Instalar Aplicativo</span>
            </button>

            <button
              id="tab-installer-update"
              onClick={() => setActiveTab('update')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
                activeTab === 'update'
                  ? 'bg-white text-indigo-900 shadow-md'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${updateState.isChecking ? 'animate-spin' : ''}`} />
              <span>Sistema de Updates (OTA)</span>
              {updateState.updateAvailable && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
              )}
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 bg-[#0a0c12] custom-scrollbar flex-1">
          {activeTab === 'install' ? (
            <>
              {/* Device Detected Banner */}
              <div className="bg-[#141722] border border-indigo-500/20 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                    <Monitor className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-white truncate">Dispositivo detectado: {clientInfo.os}</p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {clientInfo.isPWA ? 'Executando como PWA nativo instalado' : 'Ambiente Web - pronto para instalação'}
                    </p>
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  Compatível
                </span>
              </div>

              {/* Desktop Platforms Grid */}
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
                  Instaladores para Desktop
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
                  {/* Windows */}
                  <button
                    id="btn-download-windows"
                    onClick={() => handleDownload('Windows', 'BrazaTalk-Setup-x64.exe')}
                    className="bg-[#141722] hover:bg-[#181c2b] border border-white/[0.06] hover:border-indigo-500/50 p-3.5 sm:p-4 rounded-2xl flex flex-col items-center text-center transition-all group shadow-md cursor-pointer"
                  >
                    <Monitor className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-400 mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-bold text-white tracking-tight">Windows</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Windows 10 / 11 (64-bit)</span>
                    <span className="mt-2.5 sm:mt-3 text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl font-semibold w-full shadow-md shadow-indigo-600/30">
                      {downloadingPlatform === 'Windows' ? 'Baixando...' : 'Baixar .exe'}
                    </span>
                  </button>

                  {/* macOS */}
                  <button
                    id="btn-download-macos"
                    onClick={() => handleDownload('macOS', 'BrazaTalk-Universal.dmg')}
                    className="bg-[#141722] hover:bg-[#181c2b] border border-white/[0.06] hover:border-emerald-500/50 p-3.5 sm:p-4 rounded-2xl flex flex-col items-center text-center transition-all group shadow-md cursor-pointer"
                  >
                    <Apple className="w-7 h-7 sm:w-8 sm:h-8 text-slate-200 mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-bold text-white tracking-tight">macOS</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">Apple Silicon & Intel</span>
                    <span className="mt-2.5 sm:mt-3 text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3 py-1.5 rounded-xl font-bold w-full shadow-md shadow-emerald-500/30">
                      {downloadingPlatform === 'macOS' ? 'Baixando...' : 'Baixar .dmg'}
                    </span>
                  </button>

                  {/* Linux */}
                  <button
                    id="btn-download-linux"
                    onClick={() => handleDownload('Linux', 'BrazaTalk-Linux.AppImage')}
                    className="bg-[#141722] hover:bg-[#181c2b] border border-white/[0.06] hover:border-amber-500/50 p-3.5 sm:p-4 rounded-2xl flex flex-col items-center text-center transition-all group shadow-md cursor-pointer"
                  >
                    <Monitor className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 mb-1.5 sm:mb-2 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-bold text-white tracking-tight">Linux</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">AppImage / Deb</span>
                    <span className="mt-2.5 sm:mt-3 text-xs bg-[#1c202e] text-white px-3 py-1.5 rounded-xl font-semibold w-full hover:bg-indigo-600 border border-white/[0.06]">
                      {downloadingPlatform === 'Linux' ? 'Baixando...' : 'Baixar .AppImage'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Mobile PWA & Push Notifications Card */}
              <div className="bg-[#141722] border border-white/[0.08] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl shrink-0 border border-indigo-500/20">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white tracking-tight">
                        Aplicativo Mobile (PWA & Android/iOS)
                      </h4>
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                        Offline & Push
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      Instale no seu celular sem precisar de loja de aplicativos. O app recebe atualizações automáticas em segundo plano via tecnologia OTA.
                    </p>
                  </div>
                </div>

                <button
                  id="btn-install-pwa"
                  onClick={handleInstallPWA}
                  className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl whitespace-nowrap shadow-md shadow-indigo-600/30 transition-all shrink-0 cursor-pointer flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>Instalar PWA</span>
                </button>
              </div>

              {/* PWA Instruction Guide */}
              {pwaInstalledSuccess && (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Como concluir a instalação no seu navegador:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-300 text-[11px]">
                    <li><strong>No Chrome / Edge (Desktop/Android):</strong> Clique no ícone de computador/instalação na barra de endereço ou toque nos três pontinhos e selecione <em>"Instalar Braza Talk"</em> ou <em>"Adicionar à tela inicial"</em>.</li>
                    <li><strong>No Safari (iPhone/iPad):</strong> Toque no botão de Compartilhar (ícone de quadrado com seta para cima) e escolha <em>"Adicionar à Tela de Início"</em>.</li>
                  </ul>
                </div>
              )}
            </>
          ) : (
            /* TAB: UPDATE SYSTEM (OTA) */
            <div className="space-y-4">
              {/* Current Version & Health Status */}
              <div className="bg-[#141722] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-lg">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.06]">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Versão Instalada no Dispositivo
                    </span>
                    <div className="flex items-center gap-2.5 mt-1">
                      <span className="text-xl sm:text-2xl font-black text-white">v{updateState.currentVersion}</span>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        Canal Estável
                      </span>
                    </div>
                  </div>

                  <button
                    id="btn-check-updates-now"
                    onClick={handleCheckForUpdates}
                    disabled={updateState.isChecking || updateState.isDownloading}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-bold transition-all border border-white/10 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${updateState.isChecking ? 'animate-spin' : ''}`} />
                    <span>{updateState.isChecking ? 'Buscando...' : 'Verificar Atualizações'}</span>
                  </button>
                </div>

                <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Info className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{updateState.statusText}</span>
                  </div>
                  {updateState.lastChecked && (
                    <span className="text-[11px] text-slate-500">
                      Última verificação: {new Date(updateState.lastChecked).toLocaleTimeString('pt-BR')}
                    </span>
                  )}
                </div>
              </div>

              {/* Available Update Card */}
              {updateState.updateAvailable && updateState.releaseInfo && (
                <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/40 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          Nova Versão Disponível
                        </span>
                        <span className="text-sm font-black text-white">v{updateState.releaseInfo.version}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white mt-1">{updateState.releaseInfo.title}</h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Tamanho do patch: {updateState.releaseInfo.downloadSize} • Lançado em {updateState.releaseInfo.releaseDate}
                      </p>
                    </div>

                    <button
                      id="btn-apply-ota-update"
                      onClick={handleApplyOTAUpdate}
                      disabled={updateState.isDownloading}
                      className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black px-5 py-3 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
                    >
                      {updateState.isDownloading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                          <span>Atualizando...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-4 h-4 fill-current" />
                          <span>Atualizar com 1 Clique (OTA)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Progress Bar if Downloading */}
                  {updateState.isDownloading && (
                    <div className="space-y-1.5 pt-2">
                      <div className="flex justify-between text-xs text-indigo-200 font-semibold">
                        <span>Progresso do Update</span>
                        <span>{updateState.downloadProgress}%</span>
                      </div>
                      <div className="w-full h-2.5 bg-black/40 rounded-full overflow-hidden border border-white/10">
                        <div
                          className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-200"
                          style={{ width: `${updateState.downloadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Highlights / Release Notes */}
                  <div className="bg-black/30 rounded-xl p-3 border border-white/[0.04] space-y-1.5">
                    <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider">
                      O que há de novo neste update:
                    </span>
                    <ul className="space-y-1 text-xs text-slate-300">
                      {updateState.releaseInfo.highlights.map((h, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <p className="text-[11px] text-slate-400 italic">
                    ✨ <strong>Sem reinstalação:</strong> O sistema atualiza o cache local, bancos de dados e Service Worker preservando todas as suas conversas, servidores e preferências.
                  </p>
                </div>
              )}

              {/* Auto Update Settings */}
              <div className="bg-[#141722] border border-white/[0.08] rounded-2xl p-4 flex items-center justify-between gap-3">
                <div>
                  <h5 className="text-xs font-bold text-white">Verificar atualizações automaticamente</h5>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    O Braza Talk buscará melhorias e patches de segurança sempre que o aplicativo for iniciado.
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    id="toggle-auto-update"
                    type="checkbox"
                    checked={updateState.autoCheckEnabled}
                    onChange={(e) => updateService.setAutoCheck(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
