/**
 * Real WebRTC Mesh Audio & Video Engine for Braza Talk.
 * Manages RTCPeerConnection instances between participants in a voice/video channel.
 * Plays incoming audio through Audio elements and manages remote video/screen tracks.
 */

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export type RemoteStreamCallback = (peerId: string, stream: MediaStream | null) => void;

class WebRTCService {
  private peers: Map<string, RTCPeerConnection> = new Map();
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

  private localAudioStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;

  private currentUserId: string = '';
  private currentChannelId: string = '';
  private sendSignalFn: ((toUserId: string, signal: any) => void) | null = null;
  private onRemoteStreamCallbacks: Set<RemoteStreamCallback> = new Set();

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

    try {
      // Capture local microphone audio with echo cancellation and noise suppression
      this.localAudioStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
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

  /**
   * Initiates an outgoing WebRTC offer to a new peer
   */
  public async initiateConnection(peerId: string): Promise<void> {
    if (this.peers.has(peerId)) {
      return;
    }

    const pc = this.createPeerConnection(peerId);
    this.peers.set(peerId, pc);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.sendSignal(peerId, {
        type: 'offer',
        sdp: pc.localDescription,
      });
    } catch (e) {
      console.error(`Failed to create offer for peer ${peerId}:`, e);
    }
  }

  /**
   * Handles incoming signaling messages forwarded from WebSocket
   */
  public async handleSignal(fromUserId: string, signal: any): Promise<void> {
    if (!signal || fromUserId === this.currentUserId) return;

    let pc = this.peers.get(fromUserId);

    if (signal.type === 'offer') {
      if (!pc) {
        pc = this.createPeerConnection(fromUserId);
        this.peers.set(fromUserId, pc);
      }

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

        // Process any queued ICE candidates
        const queued = this.pendingCandidates.get(fromUserId) || [];
        for (const cand of queued) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          } catch {}
        }
        this.pendingCandidates.delete(fromUserId);

        const answer = await pc.createAnswer();
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
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          const queued = this.pendingCandidates.get(fromUserId) || [];
          for (const cand of queued) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            } catch {}
          }
          this.pendingCandidates.delete(fromUserId);
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
    const pc = new RTCPeerConnection(ICE_SERVERS);

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

      event.streams[0]?.getTracks().forEach((t) => {
        if (!stream!.getTracks().some((existing) => existing.id === t.id)) {
          stream!.addTrack(t);
        }
      });

      if (event.track.kind === 'audio') {
        // Play remote audio
        let audioEl = this.audioElements.get(peerId);
        if (!audioEl) {
          audioEl = new Audio();
          audioEl.autoplay = true;
          this.audioElements.set(peerId, audioEl);
        }
        audioEl.srcObject = stream;
        audioEl.play().catch((e) => {
          console.warn('Auto-play blocked, will play on user gesture:', e);
        });
      }

      this.notifyRemoteStream(peerId, stream);
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
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
    if (this.localAudioStream) {
      this.localAudioStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
  }

  /**
   * Set deafen state (mutes incoming audio elements)
   */
  public setDeafened(deafened: boolean) {
    this.audioElements.forEach((audio) => {
      audio.muted = deafened;
    });
  }

  /**
   * Add or replace screen share video track across all connected peers
   */
  public async setScreenShareStream(stream: MediaStream | null): Promise<void> {
    this.localVideoStream = stream;

    const videoTrack = stream ? stream.getVideoTracks()[0] : null;

    for (const [peerId, pc] of this.peers.entries()) {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track?.kind === 'video');

      if (videoTrack) {
        if (videoSender) {
          await videoSender.replaceTrack(videoTrack);
        } else {
          pc.addTrack(videoTrack, stream!);
          // Renegotiate with peer
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignal(peerId, {
              type: 'offer',
              sdp: pc.localDescription,
            });
          } catch (e) {
            console.error('Error renegotiating screen share track:', e);
          }
        }
      } else {
        if (videoSender) {
          pc.removeTrack(videoSender);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.sendSignal(peerId, {
              type: 'offer',
              sdp: pc.localDescription,
            });
          } catch (e) {
            console.error('Error renegotiating track removal:', e);
          }
        }
      }
    }
  }

  /**
   * Closes connection with a single peer when they leave the channel
   */
  public closePeer(peerId: string) {
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

    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
    this.notifyRemoteStream(peerId, null);
  }

  /**
   * Clean up entire session when leaving voice channel
   */
  public leaveSession() {
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
  }
}

export const webrtcService = new WebRTCService();
