/**
 * Screen Sharing & Media Stream Service
 *
 * Guarantees direct invocation of the native browser/OS screen selector (getDisplayMedia).
 * Displays full modal guidance if running on mobile or if browser restrictions apply.
 */

export interface ScreenStreamResult {
  stream: MediaStream;
  type: 'native' | 'virtual_canvas';
  cleanup: () => void;
}

class ScreenShareService {
  private activeCleanups: Array<() => void> = [];

  /**
   * Prompts the browser's native screen picker dialog so the user can choose
   * which Screen, Application Window, or Browser Tab to share.
   *
   * NEVER silently falls back to a default canvas if getDisplayMedia fails or is cancelled.
   */
  public async startScreenShare(forceFallback: boolean = false): Promise<ScreenStreamResult> {
    // If the user explicitly requested a simulated stream or if getDisplayMedia is missing
    if (forceFallback || !navigator.mediaDevices?.getDisplayMedia) {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
        if (isMobile) {
          throw new Error('MOBILE_NOT_SUPPORTED');
        }
        throw new Error('GET_DISPLAY_MEDIA_UNAVAILABLE');
      }
    }

    // Direct invocation with standard Chrome/Firefox/Edge/Safari options
    // Do not overload with unsupported constraints that cause browsers to reject or fail
    const displayMediaOptions: DisplayMediaStreamOptions = {
      video: {
        displaySurface: 'monitor', // hint: monitor | window | browser
      } as any,
      audio: false, // Start video first to prevent audio permission denials on OS that don't support system loopback
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia(displayMediaOptions);
    } catch (err: any) {
      // Re-try with minimal options if displaySurface was not accepted
      if (
        err.name !== 'NotAllowedError' &&
        err.name !== 'AbortError' &&
        !err.message?.toLowerCase().includes('permission denied') &&
        !err.message?.toLowerCase().includes('cancelled')
      ) {
        try {
          stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        } catch (retryErr) {
          throw retryErr;
        }
      } else {
        throw err;
      }
    }

    const cleanup = () => {
      stream?.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
    };
    this.activeCleanups.push(cleanup);

    return {
      stream,
      type: 'native',
      cleanup,
    };
  }

  /**
   * Optional Virtual interactive stream used only when user explicitly tests compatibility.
   */
  public createVirtualScreenStream(userName: string = 'Usuário'): ScreenStreamResult {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');

    let animId: number;
    let frame = 0;
    let isRunning = true;

    const render = () => {
      if (!isRunning || !ctx) return;
      frame++;

      ctx.fillStyle = '#090b12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#0f121d';
      ctx.fillRect(30, 30, canvas.width - 60, canvas.height - 60);

      ctx.fillStyle = '#181d2f';
      ctx.fillRect(30, 30, canvas.width - 60, 44);

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(58, 52, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(78, 52, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(98, 52, 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#f8fafc';
      ctx.font = 'bold 13px "Inter", sans-serif';
      ctx.fillText(`Transmissão Interativa de ${userName} • 60FPS Live`, 124, 56);

      ctx.fillStyle = '#4f46e5';
      ctx.fillRect(canvas.width - 150, 42, 90, 20);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('🔴 AO VIVO', canvas.width - 134, 56);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '14px "JetBrains Mono", Consolas, monospace';
      ctx.fillText('// BRAZA TALK - MODO DE TESTE DE TRANSMISSÃO', 60, 120);
      ctx.fillText('const stream = new WebRTCStreamEngine({ mode: "low-latency" });', 60, 150);
      ctx.fillText('console.log("Transmissão ativa!");', 60, 180);

      ctx.fillStyle = '#6366f1';
      for (let i = 0; i < 40; i++) {
        const barHeight = Math.abs(Math.sin((frame * 0.05) + i * 0.2)) * 36 + 6;
        ctx.fillRect(60 + i * 14, canvas.height - 60 - barHeight, 8, barHeight);
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    let stream: MediaStream;
    if (typeof (canvas as any).captureStream === 'function') {
      stream = (canvas as any).captureStream(60);
    } else {
      stream = new MediaStream();
    }

    const cleanup = () => {
      isRunning = false;
      cancelAnimationFrame(animId);
      stream.getTracks().forEach((t) => t.stop());
    };

    this.activeCleanups.push(cleanup);

    return {
      stream,
      type: 'virtual_canvas',
      cleanup,
    };
  }

  public cleanupAll() {
    this.activeCleanups.forEach((fn) => {
      try {
        fn();
      } catch {}
    });
    this.activeCleanups = [];
  }
}

export const screenShareService = new ScreenShareService();
