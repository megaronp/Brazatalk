import { SoundPack } from '../types';

class SoundEngine {
  private ctx: AudioContext | null = null;
  private currentPack: SoundPack = 'braza_classic';
  private masterVolume = 0.75;
  private soundToggles = {
    userJoin: true,
    userLeave: true,
    screenShareStart: true,
    screenShareEnd: true,
    streamViewer: true,
    mention: true,
    message: true,
    mute: true,
    deafen: true,
  };

  private getAudioContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  public setSoundPack(pack: SoundPack) {
    this.currentPack = pack;
  }

  public setMasterVolume(volume: number) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  public setToggle(key: keyof typeof this.soundToggles, enabled: boolean) {
    this.soundToggles[key] = enabled;
  }

  public getSettings() {
    return {
      pack: this.currentPack,
      volume: this.masterVolume,
      toggles: { ...this.soundToggles },
    };
  }

  // --- SOUND EFFECTS ---

  // 1. User Joined Voice Room (Harmonic uplifting chime)
  public playUserJoin() {
    if (!this.soundToggles.userJoin) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.45, now);
    master.connect(ctx.destination);

    if (this.currentPack === 'retro_8bit') {
      this.playArpeggio(ctx, master, [523.25, 659.25, 783.99, 1046.5], 0.05, 'square');
      return;
    }

    if (this.currentPack === 'cyberpunk') {
      this.playSynthNote(ctx, master, 440, now, 0.15, 'sawtooth');
      this.playSynthNote(ctx, master, 880, now + 0.08, 0.25, 'triangle');
      return;
    }

    // Classic / Minimal
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.6, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.09); // A5
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0, now + 0.09);
    gain2.gain.linearRampToValueAtTime(0.8, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc1.connect(gain1);
    gain1.connect(master);
    osc2.connect(gain2);
    gain2.connect(master);

    osc1.start(now);
    osc1.stop(now + 0.22);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.4);
  }

  // 2. User Left Voice Room (Descending chord)
  public playUserLeave() {
    if (!this.soundToggles.userLeave) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.45, now);
    master.connect(ctx.destination);

    if (this.currentPack === 'retro_8bit') {
      this.playArpeggio(ctx, master, [880, 659.25, 523.25, 392], 0.06, 'square');
      return;
    }

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.type = this.currentPack === 'cyberpunk' ? 'sawtooth' : 'sine';
    osc1.frequency.setValueAtTime(659.25, now); // E5
    gain1.gain.setValueAtTime(0.5, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc2.type = this.currentPack === 'cyberpunk' ? 'sawtooth' : 'sine';
    osc2.frequency.setValueAtTime(440, now + 0.08); // A4
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.6, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc1.connect(gain1);
    gain1.connect(master);
    osc2.connect(gain2);
    gain2.connect(master);

    osc1.start(now);
    osc1.stop(now + 0.2);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.38);
  }

  // 3. Screen Share Started (Uplifting harmonic sweep + crystal shimmer)
  public playScreenShareStart() {
    if (!this.soundToggles.screenShareStart) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.5, now);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const shimmer = ctx.createOscillator();
    const gain = ctx.createGain();
    const shimmerGain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
    osc.frequency.exponentialRampToValueAtTime(1320, now + 0.28);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.7, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    shimmer.type = 'sine';
    shimmer.frequency.setValueAtTime(1760, now + 0.12);
    shimmerGain.gain.setValueAtTime(0, now);
    shimmerGain.gain.setValueAtTime(0.4, now + 0.12);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    osc.connect(gain);
    gain.connect(master);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(master);

    osc.start(now);
    osc.stop(now + 0.48);
    shimmer.start(now + 0.12);
    shimmer.stop(now + 0.52);
  }

  // 4. Screen Share Ended (Gentle power down tone)
  public playScreenShareEnd() {
    if (!this.soundToggles.screenShareEnd) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.45, now);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046.5, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.22);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.38);
  }

  // 5. Stream Viewer Joined (Special notification when someone starts watching your screen/stream)
  public playStreamViewer() {
    if (!this.soundToggles.streamViewer) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.55, now);
    master.connect(ctx.destination);

    // Sparkle triple chime (D6 -> F#6 -> A6)
    [1174.66, 1479.98, 1760].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.07;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.5, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);

      osc.connect(gain);
      gain.connect(master);
      osc.start(startTime);
      osc.stop(startTime + 0.32);
    });
  }

  // 6. Message received (Soft pop / Chime ping)
  public playMessage() {
    if (!this.soundToggles.message) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.4, now);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08); // B5

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.5, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  // 7. Mention Ping (@everyone or user mention)
  public playMention() {
    if (!this.soundToggles.mention) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.6, now);
    master.connect(ctx.destination);

    [880, 1318.51].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.7, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  // 8. Mute / Unmute Toggles
  public playMute(isMuted: boolean) {
    if (!this.soundToggles.mute) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.35, now);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    if (isMuted) {
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.linearRampToValueAtTime(320, now + 0.08);
    } else {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.linearRampToValueAtTime(480, now + 0.08);
    }

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // 9. Deafen Toggle
  public playDeafen(isDeafened: boolean) {
    if (!this.soundToggles.deafen) return;
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(this.masterVolume * 0.4, now);
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    if (isDeafened) {
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(250, now + 0.15);
    } else {
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(600, now + 0.15);
    }

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // Helper for retro arpeggios
  private playArpeggio(ctx: AudioContext, master: GainNode, notes: number[], speed: number, type: OscillatorType) {
    const now = ctx.currentTime;
    notes.forEach((note, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * speed;

      osc.type = type;
      osc.frequency.setValueAtTime(note, t);
      gain.gain.setValueAtTime(0.4, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + speed * 1.5);

      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + speed * 1.6);
    });
  }

  // Helper for synth notes
  private playSynthNote(ctx: AudioContext, master: GainNode, freq: number, startTime: number, duration: number, type: OscillatorType) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    gain.gain.setValueAtTime(0.4, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundEngine = new SoundEngine();
