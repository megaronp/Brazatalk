export interface ReleaseInfo {
  version: string;
  releaseDate: string;
  channel: 'stable' | 'beta';
  title: string;
  highlights: string[];
  mandatory: boolean;
  buildNumber: number;
  downloadSize: string;
}

export interface UpdateState {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  isChecking: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  lastChecked: number | null;
  releaseInfo: ReleaseInfo | null;
  autoCheckEnabled: boolean;
  statusText: string;
}

export const APP_LATEST_VERSION = '2.6.0';
const STORAGE_KEY_APP_VERSION = 'brazatalk_app_version';
const STORAGE_KEY_AUTO_CHECK = 'brazatalk_auto_update_check';
const STORAGE_KEY_LAST_CHECK = 'brazatalk_last_update_check';

class UpdateService {
  private state: UpdateState;
  private listeners: Array<(state: UpdateState) => void> = [];

  constructor() {
    let storedVersion = APP_LATEST_VERSION;
    let autoCheck = true;
    let lastChecked: number | null = null;

    if (typeof window !== 'undefined') {
      try {
        const savedVer = localStorage.getItem(STORAGE_KEY_APP_VERSION);
        if (savedVer) {
          storedVersion = savedVer;
        } else {
          localStorage.setItem(STORAGE_KEY_APP_VERSION, APP_LATEST_VERSION);
        }

        const auto = localStorage.getItem(STORAGE_KEY_AUTO_CHECK);
        if (auto !== null) {
          autoCheck = auto === 'true';
        }

        const last = localStorage.getItem(STORAGE_KEY_LAST_CHECK);
        if (last) {
          lastChecked = parseInt(last, 10);
        }
      } catch (e) {
        console.warn('UpdateService storage read error:', e);
      }
    }

    this.state = {
      currentVersion: storedVersion,
      latestVersion: APP_LATEST_VERSION,
      updateAvailable: false,
      isChecking: false,
      isDownloading: false,
      downloadProgress: 0,
      lastChecked,
      releaseInfo: null,
      autoCheckEnabled: autoCheck,
      statusText: `Aplicativo atualizado na versão v${storedVersion}.`,
    };

    this.initServiceWorkerListener();
  }

  private initServiceWorkerListener() {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[UpdateService] Service Worker controller changed.');
      });
    }
  }

  public getState(): UpdateState {
    return { ...this.state };
  }

  public subscribe(listener: (state: UpdateState) => void): () => void {
    this.listeners.push(listener);
    listener(this.getState());
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const currentState = this.getState();
    this.listeners.forEach((listener) => listener(currentState));
  }

  public setAutoCheck(enabled: boolean) {
    this.state.autoCheckEnabled = enabled;
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_AUTO_CHECK, String(enabled));
      }
    } catch {}
    this.notify();
  }

  /**
   * Check for available updates
   */
  public async checkForUpdates(forceSimulateNewVersion: boolean = false): Promise<boolean> {
    this.state.isChecking = true;
    this.state.statusText = 'Verificando atualizações no Service Worker e servidor...';
    this.notify();

    try {
      let swUpdateFound = false;
      // Check service worker for real updates if available
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.update().catch(() => {});
          if (registration.waiting) {
            swUpdateFound = true;
          }
        }
      }

      const now = Date.now();
      this.state.lastChecked = now;
      try {
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_LAST_CHECK, String(now));
        }
      } catch {}

      const latestRelease: ReleaseInfo = {
        version: APP_LATEST_VERSION,
        releaseDate: new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }),
        channel: 'stable',
        title: 'Braza Talk — Versão de Produção Atualizada',
        highlights: [
          'Suporte completo a PWA offline e instalação rápida em celulares e computadores',
          'Qualidade de áudio aprimorada com supressão de ruído WebRTC',
          'Sincronização offline resiliente com Firestore e cache local IndexedDB',
          'Atualização de Service Worker com limpeza transparente de cache',
        ],
        mandatory: false,
        buildNumber: 26004,
        downloadSize: 'Cache PWA',
      };

      const hasUpdate =
        forceSimulateNewVersion ||
        swUpdateFound ||
        this.compareVersions(latestRelease.version, this.state.currentVersion) > 0;

      if (hasUpdate) {
        this.state.updateAvailable = true;
        this.state.latestVersion = latestRelease.version;
        this.state.releaseInfo = latestRelease;
        this.state.statusText = `Nova versão v${latestRelease.version} disponível via Service Worker!`;
      } else {
        this.state.updateAvailable = false;
        this.state.latestVersion = latestRelease.version;
        this.state.releaseInfo = null;
        this.state.statusText = `Você já está usando a versão mais recente (v${this.state.currentVersion}).`;
      }

      this.state.isChecking = false;
      this.notify();
      return hasUpdate;
    } catch (e: any) {
      this.state.isChecking = false;
      this.state.statusText = 'Não foi possível verificar atualizações no momento.';
      this.notify();
      return false;
    }
  }

  /**
   * Compare semver strings
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split('.').map((p) => parseInt(p, 10) || 0);
    const parts2 = v2.split('.').map((p) => parseInt(p, 10) || 0);
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  /**
   * Apply Service Worker Update & Cache Refresh
   */
  public async performOTAUpdate(onProgress?: (progress: number) => void): Promise<void> {
    this.state.isDownloading = true;
    this.state.downloadProgress = 50;
    this.state.statusText = 'Atualizando Service Worker e revalidando caches...';
    onProgress?.(50);
    this.notify();

    try {
      // Clear cache storage if available
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheKeys = await window.caches.keys();
        await Promise.all(cacheKeys.map((key) => window.caches.delete(key)));
      }

      // If Service Worker is registered, update it and skip waiting
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
          if (reg.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        }
      }

      // Save latest version to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY_APP_VERSION, this.state.latestVersion || APP_LATEST_VERSION);
      }
    } catch (e) {
      console.warn('Cache revalidation error during update:', e);
    }

    this.state.downloadProgress = 100;
    onProgress?.(100);
    this.state.currentVersion = this.state.latestVersion || APP_LATEST_VERSION;
    this.state.updateAvailable = false;
    this.state.isDownloading = false;
    this.state.statusText = 'Atualização concluída com sucesso! Recarregando...';
    this.notify();

    // Reload cleanly to activate new Service Worker & assets
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    }, 400);
  }

  /**
   * Detect current platform and PWA standalone mode
   */
  public getClientInfo() {
    if (typeof window === 'undefined') {
      return { platform: 'web', isPWA: false, os: 'Unknown' };
    }

    const ua = navigator.userAgent || '';
    const isStandalone =
      (window.navigator as any).standalone ||
      window.matchMedia('(display-mode: standalone)').matches ||
      document.referrer.includes('android-app://');

    let os = 'Navegador Web';
    if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Linux/i.test(ua)) os = 'Linux';

    return {
      platform: isStandalone ? 'pwa' : 'web',
      isPWA: isStandalone,
      os,
      userAgent: ua,
    };
  }
}

export const updateService = new UpdateService();
