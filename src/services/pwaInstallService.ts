export interface PwaState {
  canInstallDirectly: boolean;
  isInstalled: boolean;
  isSecureContext: boolean;
  platform: 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'other';
  browser: 'chrome' | 'edge' | 'safari' | 'firefox' | 'other';
  isIframe: boolean;
  appUrl: string;
}

class PwaInstallService {
  private deferredPrompt: any = null;
  private state: PwaState;
  private listeners: Array<(state: PwaState) => void> = [];

  constructor() {
    this.state = this.detectInitialState();
    this.initListeners();
  }

  private detectInitialState(): PwaState {
    if (typeof window === 'undefined') {
      return {
        canInstallDirectly: false,
        isInstalled: false,
        isSecureContext: true,
        platform: 'other',
        browser: 'other',
        isIframe: false,
        appUrl: 'https://brazatalk.app',
      };
    }

    const ua = navigator.userAgent || '';
    const isStandalone =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches ||
      window.matchMedia('(display-mode: fullscreen)').matches ||
      document.referrer.includes('android-app://');

    const isSecure =
      window.isSecureContext ||
      window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    let platform: PwaState['platform'] = 'other';
    if (/Android/i.test(ua)) platform = 'android';
    else if (/iPhone|iPad|iPod/i.test(ua)) platform = 'ios';
    else if (/Windows/i.test(ua)) platform = 'windows';
    else if (/Macintosh|Mac OS X/i.test(ua)) platform = 'mac';
    else if (/Linux/i.test(ua)) platform = 'linux';

    let browser: PwaState['browser'] = 'other';
    if (/Edg/i.test(ua)) browser = 'edge';
    else if (/Chrome|CriOS/i.test(ua)) browser = 'chrome';
    else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) browser = 'safari';
    else if (/Firefox|FxiOS/i.test(ua)) browser = 'firefox';

    let isIframe = false;
    try {
      isIframe = window.self !== window.top;
    } catch {
      isIframe = true;
    }

    return {
      canInstallDirectly: false,
      isInstalled: isStandalone,
      isSecureContext: isSecure,
      platform,
      browser,
      isIframe,
      appUrl: window.location.href,
    };
  }

  private initListeners() {
    if (typeof window === 'undefined') return;

    // Capture early beforeinstallprompt
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.state.canInstallDirectly = true;
      this.notify();
    });

    // App installed event
    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.state.canInstallDirectly = false;
      this.state.isInstalled = true;
      this.notify();
    });

    // Listen for standalone display mode changes
    try {
      const matchMedia = window.matchMedia('(display-mode: standalone)');
      matchMedia.addEventListener('change', (e) => {
        if (e.matches) {
          this.state.isInstalled = true;
          this.notify();
        }
      });
    } catch {}
  }

  public getState(): PwaState {
    return { ...this.state };
  }

  public subscribe(listener: (state: PwaState) => void): () => void {
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

  /**
   * Triggers native install prompt if available
   */
  public async promptInstall(): Promise<'accepted' | 'dismissed' | 'manual_required'> {
    if (this.deferredPrompt) {
      try {
        this.deferredPrompt.prompt();
        const { outcome } = await this.deferredPrompt.userChoice;
        if (outcome === 'accepted') {
          this.state.isInstalled = true;
          this.state.canInstallDirectly = false;
          this.deferredPrompt = null;
          this.notify();
          return 'accepted';
        }
        this.deferredPrompt = null;
        this.state.canInstallDirectly = false;
        this.notify();
        return 'dismissed';
      } catch (err) {
        console.warn('Error during native install prompt:', err);
      }
    }
    return 'manual_required';
  }

  /**
   * Get device-specific install steps
   */
  public getInstallGuide(): { title: string; steps: string[]; badge: string } {
    const { platform, browser } = this.state;

    if (platform === 'ios' || browser === 'safari') {
      return {
        badge: 'iOS Safari / iPadOS',
        title: 'Como instalar no iPhone / iPad:',
        steps: [
          'Abra o app no navegador Safari.',
          'Toque no botão "Compartilhar" (ícone quadrado com uma seta para cima na barra inferior).',
          'Role a lista para baixo e toque em "Adicionar à Tela de Início" (+).',
          'Confirme tocando em "Adicionar" no canto superior direito.'
        ],
      };
    }

    if (platform === 'android') {
      return {
        badge: 'Android (Chrome / Edge)',
        title: 'Como instalar no Android:',
        steps: [
          'Toque no menu do navegador (três pontinhos ⋮ no canto superior direito).',
          'Selecione a opção "Instalar aplicativo" ou "Adicionar à tela inicial".',
          'Confirme a instalação para criar o ícone do Braza Talk na sua tela inicial.'
        ],
      };
    }

    if (browser === 'edge') {
      return {
        badge: 'Microsoft Edge (Desktop)',
        title: 'Como instalar no Edge (PC / Mac):',
        steps: [
          'Clique no ícone de "Aplicativo disponível" no canto direito da barra de endereço.',
          'Ou clique nos três pontinhos (...) > "Aplicativos" > "Instalar este site como aplicativo".',
          'Clique em "Instalar" para fixar na barra de tarefas.'
        ],
      };
    }

    return {
      badge: 'Google Chrome (Desktop)',
      title: 'Como instalar no Computador (Chrome):',
      steps: [
        'Clique no ícone de computador/instalação no canto direito da barra de endereço.',
        'Ou clique no menu do Chrome (três pontinhos ⋮) > "Salvar e compartilhar" > "Instalar Braza Talk...".',
        'Confirme a instalação para abrir o Braza Talk em janela dedicada sem barras de navegação.'
      ],
    };
  }

  public async copyAppUrl(): Promise<boolean> {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }
}

export const pwaInstallService = new PwaInstallService();
