/**
 * Real WebRTC Mesh Audio & Video Engine for Braza Talk.
 * Manages RTCPeerConnection instances between participants in a voice/video channel.
 * Plays incoming audio through Audio elements and manages remote video/screen tracks.
 * Analyzes audio levels for both local and remote streams in real-time to highlight active speakers.
 */

import { auth } from './firebase';

const getIceServers = (): RTCConfiguration => {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  return {
    iceServers: servers,
    iceCandidatePoolSize: 10,
  };
};

const ICE_SERVERS: RTCConfiguration = getIceServers();

export type RemoteStreamCallback = (peerId: string, stream: MediaStream | null) => void;
export type SpeakingCallback = (userId: string, isSpeaking: boolean) => void;

/**
 * Optimizes SDP for Opus to ensure continuous, crystal-clear, stutter-free voice.
 * usedtx=0 prevents cutting off soft words or Brazilian Portuguese word endings.
 * useinbandfec=1 enables Opus forward error correction against packet loss.
 * minptime=10 provides low-latency frames.
 * maxaveragebitrate=64000 guarantees studio voice quality.
 */
function optimizeOpusSdp(sdp: string): string {
  if (!sdp) return sdp;
  const match = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
  if (!match) return sdp;
  const pt = match[1];
  const fmtpRegex = new RegExp(`a=fmtp:${pt}\\s+.*`, 'i');
  const customFmtp = `a=fmtp:${pt} minptime=10;useinbandfec=1;stereo=0;sprop-stereo=0;usedtx=0;maxaveragebitrate=64000;cbr=1`;
  if (fmtpRegex.test(sdp)) {
    return sdp.replace(fmtpRegex, customFmtp);
  } else {
    return sdp.replace(match[0], `${match[0]}\r\n${customFmtp}`);
  }
}

class WebRTCService {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private localAudioStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;

  private selectedAudioInputId: string = 'default';
  private selectedAudioOutputId: string = 'default';

  private currentUserId: string = '';
  private currentChannelId: string = '';
  private isMutedState: boolean = false;
  private isDeafenedState: boolean = false;
  private sendSignalFn: ((toUserId: string, signal: any) => void) | null = null;
  private onRemoteStreamCallbacks: Set<RemoteStreamCallback> = new Set();
  private onSpeakingCallbacks: Set<SpeakingCallback> = new Set();

  // Audio level analysis (VAD for local user + all remote peers)
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private remoteAudioAnalysers: Map<
    string,
    {
      analyser: AnalyserNode;
      source: MediaStreamAudioSourceNode;
      isSpeaking: boolean;
      quietTimer: NodeJS.Timeout | null;
    }
  > = new Map();
  private isLocalSpeaking: boolean = false;
  private localQuietTimer: NodeJS.Timeout | null = null;
  private analysisInterval: NodeJS.Timeout | null = null;
  private activeIceConfig: RTCConfiguration = ICE_SERVERS;
  private makingOffer: Map<string, boolean> = new Map();
  private disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

  private isPolite(peerId: string): boolean {
    return this.currentUserId > peerId;
  }

  public async fetchIceConfig(): Promise<RTCConfiguration> {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/webrtc/ice-servers', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
          this.activeIceConfig = {
            iceServers: data.iceServers,
            iceCandidatePoolSize: 10,
          };
          return this.activeIceConfig;
        }
      }
    } catch {}
    return this.activeIceConfig;
  }

  constructor() {
    try {
      const savedInput = localStorage.getItem('braza_audio_input_id');
      const savedOutput = localStorage.getItem('braza_audio_output_id');
      if (savedInput) this.selectedAudioInputId = savedInput;
      if (savedOutput) this.selectedAudioOutputId = savedOutput;
    } catch {}
  }

  /**
   * Set preferred audio input (microphone) device ID
   */
  public async setAudioInputDevice(deviceId: string): Promise<void> {
    this.selectedAudioInputId = deviceId || 'default';
    try {
      localStorage.setItem('braza_audio_input_id', this.selectedAudioInputId);
    } catch {}

    // If currently connected in voice, hot-swap microphone track
    if (this.localAudioStream && this.currentChannelId) {
      try {
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        };
        if (deviceId && deviceId !== 'default') {
          audioConstraints.deviceId = { exact: deviceId };
        }

        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        const newTrack = newStream.getAudioTracks()[0];

        if (newTrack) {
          // Replace track in local audio stream
          const oldTrack = this.localAudioStream.getAudioTracks()[0];
          if (oldTrack) {
            this.localAudioStream.removeTrack(oldTrack);
            oldTrack.stop();
          }
          this.localAudioStream.addTrack(newTrack);

          // Re-attach local audio analyser
          this.attachLocalAudioAnalyser();

          // Replace track on all active peer connections
          for (const pc of this.peers.values()) {
            const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
            if (sender) {
              await sender.replaceTrack(newTrack);
            }
          }
        }
      } catch (err) {
        console.warn('Could not hot-swap audio input device:', err);
      }
    }
  }

  /**
   * Set preferred audio output (headphones/speakers) device ID
   */
  public async setAudioOutputDevice(deviceId: string): Promise<void> {
    this.selectedAudioOutputId = deviceId || 'default';
    try {
      localStorage.setItem('braza_audio_output_id', this.selectedAudioOutputId);
    } catch {}

    // Apply to all current audio elements
    for (const audioEl of this.audioElements.values()) {
      if ((audioEl as any).setSinkId && deviceId && deviceId !== 'default') {
        try {
          await (audioEl as any).setSinkId(deviceId);
        } catch (err) {
          console.warn('Could not set sinkId on audio element:', err);
        }
      }
    }
  }

  public getSelectedAudioInputId(): string {
    return this.selectedAudioInputId;
  }

  public getSelectedAudioOutputId(): string {
    return this.selectedAudioOutputId;
  }

  public getLocalAudioStream(): MediaStream | null {
    return this.localAudioStream;
  }

  /**
   * Register speaking state listener for both local and remote users
   */
  public onSpeakingChange(callback: SpeakingCallback): () => void {
    this.onSpeakingCallbacks.add(callback);
    return () => {
      this.onSpeakingCallbacks.delete(callback);
    };
  }

  private notifySpeaking(userId: string, isSpeaking: boolean) {
    this.onSpeakingCallbacks.forEach((cb) => {
      try {
        cb(userId, isSpeaking);
      } catch (e) {
        console.error('Error in onSpeakingChange callback:', e);
      }
    });
  }

  /**
   * Initialize local media session for voice channel
   */
  public async initSession(
    userId: string,
    channelId: string,
    sendSignal: (toUserId: string, signal: any) => void,
    existingParticipantIds: string[] = []
  ): Promise<MediaStream | null> {
    this.currentUserId = userId;
    this.currentChannelId = channelId;
    this.sendSignalFn = sendSignal;
    this.isMutedState = false;
    this.isDeafenedState = false;

    await this.fetchIceConfig();

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1, // Mono delivers lower jitter and higher packet consistency
        sampleRate: 48000,
      };
      if (this.selectedAudioInputId && this.selectedAudioInputId !== 'default') {
        audioConstraints.deviceId = { ideal: this.selectedAudioInputId };
      }

      // Capture single authoritative microphone audio stream
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });

      // Setup audio context & local analyser for VAD
      this.initAudioContext();
      this.attachLocalAudioAnalyser();
      this.startAudioAnalysisLoop();
    } catch (err) {
      console.warn('Microphone permission denied or audio device not available:', err);
      this.localAudioStream = null;
    }

    // Connect to all existing participants in the channel
    for (const peerId of existingParticipantIds) {
      if (peerId !== userId) {
        this.initiateConnection(peerId);
      }
    }

    return this.localAudioStream;
  }

  private initAudioContext() {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
        if (this.audioCtx.state === 'suspended') {
          this.audioCtx.resume().catch(() => {});
        }
      }
    }
  }

  private attachLocalAudioAnalyser() {
    if (!this.audioCtx || !this.localAudioStream) return;
    try {
      if (this.localSource) {
        try {
          this.localSource.disconnect();
        } catch {}
      }
      this.localAnalyser = this.audioCtx.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localAnalyser.smoothingTimeConstant = 0.3;
      this.localSource = this.audioCtx.createMediaStreamSource(this.localAudioStream);
      this.localSource.connect(this.localAnalyser);
    } catch (e) {
      console.warn('Could not attach local audio analyser:', e);
    }
  }

  private attachRemoteAudioAnalyser(peerId: string, stream: MediaStream) {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      this.initAudioContext();
    }
    if (!this.audioCtx) return;

    try {
      const existing = this.remoteAudioAnalysers.get(peerId);
      if (existing) {
        try {
          existing.source.disconnect();
        } catch {}
        if (existing.quietTimer) clearTimeout(existing.quietTimer);
      }

      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      const source = this.audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      this.remoteAudioAnalysers.set(peerId, {
        analyser,
        source,
        isSpeaking: false,
        quietTimer: null,
      });
    } catch (e) {
      console.warn(`Could not attach remote audio analyser for ${peerId}:`, e);
    }
  }

  private startAudioAnalysisLoop() {
    if (this.analysisInterval) clearInterval(this.analysisInterval);

    this.analysisInterval = setInterval(() => {
      // 1. Local speaking analysis
      if (this.localAnalyser && this.currentUserId && !this.isMutedState && !this.isDeafenedState) {
        const dataArray = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;

        if (avg > 11) {
          if (this.localQuietTimer) {
            clearTimeout(this.localQuietTimer);
            this.localQuietTimer = null;
          }
          if (!this.isLocalSpeaking) {
            this.isLocalSpeaking = true;
            this.notifySpeaking(this.currentUserId, true);
          }
        } else if (this.isLocalSpeaking && !this.localQuietTimer) {
          this.localQuietTimer = setTimeout(() => {
            this.isLocalSpeaking = false;
            this.notifySpeaking(this.currentUserId, false);
            this.localQuietTimer = null;
          }, 350);
        }
      }

      // 2. Remote peers speaking analysis (detects voice directly from incoming audio stream)
      if (!this.isDeafenedState) {
        this.remoteAudioAnalysers.forEach((node, peerId) => {
          const dataArray = new Uint8Array(node.analyser.frequencyBinCount);
          node.analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          if (avg > 10) {
            if (node.quietTimer) {
              clearTimeout(node.quietTimer);
              node.quietTimer = null;
            }
            if (!node.isSpeaking) {
              node.isSpeaking = true;
              this.notifySpeaking(peerId, true);
            }
          } else if (node.isSpeaking && !node.quietTimer) {
            node.quietTimer = setTimeout(() => {
              node.isSpeaking = false;
              this.notifySpeaking(peerId, false);
              node.quietTimer = null;
            }, 350);
          }
        });
      }
    }, 70);
  }

  /**
   * Subscribe to remote stream updates (for rendering remote screen shares / webcams)
   */
  public onRemoteStream(callback: RemoteStreamCallback): () => void {
    this.onRemoteStreamCallbacks.add(callback);
    // Emit existing streams to subscriber
    this.remoteStreams.forEach((stream, peerId) => {
      callback(peerId, stream);
    });
    return () => {
      this.onRemoteStreamCallbacks.delete(callback);
    };
  }

  private notifyRemoteStream(peerId: string, stream: MediaStream | null) {
    this.onRemoteStreamCallbacks.forEach((cb) => {
      try {
        cb(peerId, stream);
      } catch (e) {
        console.error('Remote stream callback error:', e);
      }
    });
  }

  public getRemoteStream(peerId: string): MediaStream | undefined {
    return this.remoteStreams.get(peerId);
  }

  public setPeerVolume(peerId: string, volumePercent: number): void {
    const audioEl = this.audioElements.get(peerId);
    if (audioEl) {
      audioEl.volume = Math.max(0, Math.min(1, volumePercent / 100));
      audioEl.muted = volumePercent === 0;
    }
  }

  /**
   * Initiates an outgoing WebRTC offer to a new peer
   */
  public async initiateConnection(peerId: string): Promise<void> {
    if (!peerId || peerId === this.currentUserId) return;

    let pc = this.peers.get(peerId);
    if (!pc) {
      pc = this.createPeerConnection(peerId);
      this.peers.set(peerId, pc);
    } else if (pc.signalingState !== 'stable') {
      return;
    }

    try {
      this.makingOffer.set(peerId, true);
      const offer = await pc.createOffer();
      if (offer.sdp) {
        offer.sdp = optimizeOpusSdp(offer.sdp);
      }
      await pc.setLocalDescription(offer);

      this.sendSignal(peerId, {
        type: 'offer',
        sdp: pc.localDescription,
      });
    } catch (e) {
      console.error(`Failed to create offer for peer ${peerId}:`, e);
    } finally {
      this.makingOffer.set(peerId, false);
    }
  }

  /**
   * Handles incoming signaling messages forwarded from WebSocket with Perfect Negotiation
   */
  public async handleSignal(fromUserId: string, signal: any): Promise<void> {
    if (!signal || !fromUserId || fromUserId === this.currentUserId) return;

    let pc = this.peers.get(fromUserId);

    if (signal.type === 'offer') {
      if (!pc) {
        pc = this.createPeerConnection(fromUserId);
        this.peers.set(fromUserId, pc);
      }

      try {
        const isPolite = this.isPolite(fromUserId);
        const isMakingOffer = Boolean(this.makingOffer.get(fromUserId));
        const offerCollision = isMakingOffer || pc.signalingState !== 'stable';

        if (offerCollision) {
          if (!isPolite) {
            // Impolite peer ignores incoming offer when colliding
            return;
          }
          // Polite peer rolls back local description to yield to remote offer
          await pc.setLocalDescription({ type: 'rollback' });
        }

        const remoteDesc = new RTCSessionDescription(signal.sdp);
        await pc.setRemoteDescription(remoteDesc);

        // Process any queued ICE candidates
        const queued = this.pendingCandidates.get(fromUserId) || [];
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
        this.pendingCandidates.delete(fromUserId);

        const answer = await pc.createAnswer();
        if (answer.sdp) {
          answer.sdp = optimizeOpusSdp(answer.sdp);
        }
        await pc.setLocalDescription(answer);

        this.sendSignal(fromUserId, {
          type: 'answer',
          sdp: pc.localDescription,
        });
      } catch (e) {
        console.error(`Error handling offer from ${fromUserId}:`, e);
      }
    } else if (signal.type === 'answer') {
      if (pc) {
        try {
          if (pc.signalingState === 'have-local-offer') {
            const remoteDesc = new RTCSessionDescription(signal.sdp);
            await pc.setRemoteDescription(remoteDesc);

            const queued = this.pendingCandidates.get(fromUserId) || [];
            for (const cand of queued) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(cand));
              } catch {}
            }
            this.pendingCandidates.delete(fromUserId);
          }
        } catch (e) {
          console.error(`Error handling answer from ${fromUserId}:`, e);
        }
      }
    } else if (signal.type === 'candidate' && signal.candidate) {
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (e) {
          console.warn(`Error adding ice candidate for ${fromUserId}:`, e);
        }
      } else {
        // Queue until remote description is set
        const list = this.pendingCandidates.get(fromUserId) || [];
        list.push(signal.candidate);
        this.pendingCandidates.set(fromUserId, list);
      }
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.activeIceConfig || ICE_SERVERS);

    // Add transceivers with high quality audio parameters
    try {
      const audioTransceiver = pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (audioTransceiver.sender && audioTransceiver.sender.getParameters) {
        const params = audioTransceiver.sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 64000;
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          audioTransceiver.sender.setParameters(params).catch(() => {});
        }
      }
    } catch {}

    // Pre-negotiate video transceiver so video is immediately ready to receive
    try {
      pc.addTransceiver('video', { direction: 'sendrecv' });
    } catch {}

    // Add local audio tracks if available
    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localAudioStream!);
      });
    }

    // Add local screen / video tracks if available
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localVideoStream!);
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(peerId, {
          type: 'candidate',
          candidate: event.candidate,
        });
      }
    };

    // Handle incoming remote media tracks (audio & screen share video)
    pc.ontrack = (event) => {
      let stream = this.remoteStreams.get(peerId);
      if (!stream) {
        stream = new MediaStream();
        this.remoteStreams.set(peerId, stream);
      }

      if (event.streams && event.streams[0]) {
        event.streams[0].getTracks().forEach((t) => {
          if (!stream!.getTracks().some((existing) => existing.id === t.id)) {
            stream!.addTrack(t);
          }
        });
      }

      if (event.track && !stream.getTracks().some((existing) => existing.id === event.track.id)) {
        stream.addTrack(event.track);
      }

      // Re-notify when video track un-mutes or ends
      event.track.onunmute = () => {
        this.notifyRemoteStream(peerId, stream!);
      };
      event.track.onended = () => {
        this.notifyRemoteStream(peerId, stream!);
      };

      if (event.track.kind === 'audio') {
        // Play remote audio
        let audioEl = this.audioElements.get(peerId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          if ((audioEl as any).setSinkId && this.selectedAudioOutputId && this.selectedAudioOutputId !== 'default') {
            (audioEl as any).setSinkId(this.selectedAudioOutputId).catch(() => {});
          }
          this.audioElements.set(peerId, audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch((e) => {
          console.warn('Auto-play blocked, will play on user gesture:', e);
        });

        // Attach audio analyser to monitor remote peer's real-time speaking state
        this.attachRemoteAudioAnalyser(peerId, stream);
      }

      this.notifyRemoteStream(peerId, stream);
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'disconnected') {
        if (!this.disconnectTimers.has(peerId)) {
          const timer = setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected') {
              this.closePeer(peerId);
            }
            this.disconnectTimers.delete(peerId);
          }, 6000);
          this.disconnectTimers.set(peerId, timer);
        }
      } else if (state === 'connected' || state === 'completed') {
        const timer = this.disconnectTimers.get(peerId);
        if (timer) {
          clearTimeout(timer);
          this.disconnectTimers.delete(peerId);
        }
      } else if (state === 'failed') {
        this.closePeer(peerId);
      }
    };

    return pc;
  }

  private sendSignal(toUserId: string, signal: any) {
    if (this.sendSignalFn) {
      this.sendSignalFn(toUserId, signal);
    }
  }

  /**
   * Set local mute state (disables audio track transmission)
   */
  public setMuted(muted: boolean) {
    this.isMutedState = muted;
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    if (muted && this.isLocalSpeaking) {
      this.isLocalSpeaking = false;
      this.notifySpeaking(this.currentUserId, false);
    }
  }

  /**
   * Set deafen state (mutes incoming audio elements)
   */
  public setDeafened(deafened: boolean) {
    this.isDeafenedState = deafened;
    this.audioElements.forEach((audio) => {
      audio.muted = deafened;
    });
  }

  /**
   * Add or replace screen share video track across all connected peers
   */
  public async setScreenStream(screenStream: MediaStream | null): Promise<void> {
    this.localVideoStream = screenStream;
    const videoTrack = screenStream ? screenStream.getVideoTracks()[0] : null;

    for (const [peerId, pc] of this.peers.entries()) {
      try {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track?.kind === 'video' || (s.track === null && !s.track));
        const videoTransceiver = pc.getTransceivers().find(
          (t) => t.receiver.track.kind === 'video' || t.sender === videoSender
        );

        if (videoTrack) {
          if (videoTransceiver) {
            videoTransceiver.direction = 'sendrecv';
          }
          if (videoSender) {
            await videoSender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, screenStream!);
          }
        } else {
          if (videoTransceiver) {
            videoTransceiver.direction = 'recvonly';
          }
          if (videoSender) {
            await videoSender.replaceTrack(null);
          }
        }

        // Renegotiate with peer if connection is stable
        if (pc.signalingState === 'stable') {
          this.makingOffer.set(peerId, true);
          const offer = await pc.createOffer();
          if (offer.sdp) offer.sdp = optimizeOpusSdp(offer.sdp);
          await pc.setLocalDescription(offer);
          this.sendSignal(peerId, { type: 'offer', sdp: pc.localDescription });
        }
      } catch (err) {
        console.warn(`Renegotiation error with ${peerId}:`, err);
      } finally {
        this.makingOffer.set(peerId, false);
      }
    }
  }

  public async setScreenShareStream(screenStream: MediaStream | null): Promise<void> {
    return this.setScreenStream(screenStream);
  }

  private getPeerIdForPc(targetPc: RTCPeerConnection): string | undefined {
    for (const [peerId, pc] of this.peers.entries()) {
      if (pc === targetPc) return peerId;
    }
    return undefined;
  }

  /**
   * Close a specific peer connection
   */
  public closePeer(peerId: string) {
    const timer = this.disconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(peerId);
    }
    this.makingOffer.delete(peerId);

    const pc = this.peers.get(peerId);
    if (pc) {
      pc.close();
      this.peers.delete(peerId);
    }

    const audioEl = this.audioElements.get(peerId);
    if (audioEl) {
      audioEl.pause();
      audioEl.srcObject = null;
      this.audioElements.delete(peerId);
    }

    const remoteAnalyser = this.remoteAudioAnalysers.get(peerId);
    if (remoteAnalyser) {
      try {
        remoteAnalyser.source.disconnect();
      } catch {}
      if (remoteAnalyser.quietTimer) clearTimeout(remoteAnalyser.quietTimer);
      this.remoteAudioAnalysers.delete(peerId);
    }

    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.notifyRemoteStream(peerId, null);
  }

  /**
   * Clean up entire session when leaving voice channel
   */
  public leaveSession() {
    this.disconnectTimers.forEach((timer) => clearTimeout(timer));
    this.disconnectTimers.clear();
    this.makingOffer.clear();
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
    if (this.localQuietTimer) {
      clearTimeout(this.localQuietTimer);
      this.localQuietTimer = null;
    }

    this.remoteAudioAnalysers.forEach((item) => {
      try {
        item.source.disconnect();
      } catch {}
      if (item.quietTimer) clearTimeout(item.quietTimer);
    });
    this.remoteAudioAnalysers.clear();

    if (this.localSource) {
      try {
        this.localSource.disconnect();
      } catch {}
      this.localSource = null;
    }
    this.localAnalyser = null;

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }

    this.peers.forEach((pc) => pc.close());
    this.peers.clear();

    this.audioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    this.audioElements.clear();

    if (this.localAudioStream) {
      this.localAudioStream.getTracks().forEach((t) => t.stop());
      this.localAudioStream = null;
    }

    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
    }

    this.remoteStreams.clear();
    this.pendingCandidates.clear();
    this.currentChannelId = '';
    this.currentUserId = '';
    this.sendSignalFn = null;
    this.isLocalSpeaking = false;
  }
}

export const webrtcService = new WebRTCService();
