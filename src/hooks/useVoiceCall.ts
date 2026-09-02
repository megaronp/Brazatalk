import { useState, useEffect, useRef } from 'react';
import { VoiceParticipant, User } from '../types';
import { soundEngine } from '../services/soundEngine';
import { screenShareService } from '../services/screenShareService';
import { webrtcService } from '../services/webrtcService';

interface UseVoiceCallOptions {
  currentUser: User;
  wsRef: React.RefObject<WebSocket | null>;
  pushNotificationToast: (title: string, body: string, type: any) => void;
}

export function useVoiceCall({ currentUser, wsRef, pushNotificationToast }: UseVoiceCallOptions) {
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [screenMediaStream, setScreenMediaStream] = useState<MediaStream | null>(null);

  // VAD refs
  const vadQuietTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  // PTT refs
  const pttReleaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPttPressedRef = useRef<boolean>(false);

  // 1. Microphone Voice Activity Detection (VAD) for Open Mic Mode
  useEffect(() => {
    if (currentUser.voiceInputMode === 'ptt' || !currentVoiceChannelId || isMuted || isDeafened) {
      if (isSpeakingRef.current) {
        isSpeakingRef.current = false;
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
        );
        if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
          wsRef.current.send(
            JSON.stringify({
              type: 'voice-state-update',
              channelId: currentVoiceChannelId,
              userId: currentUser.id,
              isSpeaking: false,
            })
          );
        }
      }
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let micStream: MediaStream | null = null;
    let checkInterval: NodeJS.Timeout | null = null;

    const startVAD = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(micStream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        checkInterval = setInterval(() => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          if (avg > 10) {
            if (vadQuietTimeoutRef.current) {
              clearTimeout(vadQuietTimeoutRef.current);
              vadQuietTimeoutRef.current = null;
            }
            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              setVoiceParticipants((prev) =>
                prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: true } : p))
              );
              if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'voice-state-update',
                    channelId: currentVoiceChannelId,
                    userId: currentUser.id,
                    isSpeaking: true,
                  })
                );
              }
            }
          } else {
            if (isSpeakingRef.current && !vadQuietTimeoutRef.current) {
              vadQuietTimeoutRef.current = setTimeout(() => {
                isSpeakingRef.current = false;
                setVoiceParticipants((prev) =>
                  prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
                );
                if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'voice-state-update',
                      channelId: currentVoiceChannelId,
                      userId: currentUser.id,
                      isSpeaking: false,
                    })
                  );
                }
                vadQuietTimeoutRef.current = null;
              }, 400);
            }
          }
        }, 80);
      } catch (e) {
        console.warn('VAD AudioContext init skipped or blocked:', e);
      }
    };

    startVAD();

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (vadQuietTimeoutRef.current) clearTimeout(vadQuietTimeoutRef.current);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      if (isSpeakingRef.current) {
        isSpeakingRef.current = false;
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
        );
      }
    };
  }, [currentUser.voiceInputMode, currentVoiceChannelId, isMuted, isDeafened, currentUser.id]);

  // 2. Push-to-Talk (PTT) Global Key Listener
  useEffect(() => {
    if (currentUser.voiceInputMode !== 'ptt' || !currentVoiceChannelId) {
      isPttPressedRef.current = false;
      return;
    }

    const pttKeyTarget = currentUser.pttKey || 'Space';
    const releaseDelay = currentUser.pttReleaseDelay ?? 200;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const pressedKey = e.code || e.key;
      if (pressedKey === pttKeyTarget || e.key === pttKeyTarget || e.code === pttKeyTarget) {
        if (isPttPressedRef.current) return;
        isPttPressedRef.current = true;

        if (pttReleaseTimeoutRef.current) {
          clearTimeout(pttReleaseTimeoutRef.current);
          pttReleaseTimeoutRef.current = null;
        }

        setIsMuted(false);
        webrtcService.setMuted(false);
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: false, isSpeaking: true } : p))
        );

        if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
          wsRef.current.send(
            JSON.stringify({
              type: 'voice-state-update',
              channelId: currentVoiceChannelId,
              userId: currentUser.id,
              isMuted: false,
              isSpeaking: true,
            })
          );
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const pressedKey = e.code || e.key;
      if (pressedKey === pttKeyTarget || e.key === pttKeyTarget || e.code === pttKeyTarget) {
        if (!isPttPressedRef.current) return;
        isPttPressedRef.current = false;

        if (pttReleaseTimeoutRef.current) {
          clearTimeout(pttReleaseTimeoutRef.current);
        }

        pttReleaseTimeoutRef.current = setTimeout(() => {
          setIsMuted(true);
          webrtcService.setMuted(true);
          setVoiceParticipants((prev) =>
            prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: true, isSpeaking: false } : p))
          );

          if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
            wsRef.current.send(
              JSON.stringify({
                type: 'voice-state-update',
                channelId: currentVoiceChannelId,
                userId: currentUser.id,
                isMuted: true,
                isSpeaking: false,
              })
            );
          }
        }, releaseDelay);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (pttReleaseTimeoutRef.current) clearTimeout(pttReleaseTimeoutRef.current);
    };
  }, [currentUser.voiceInputMode, currentUser.pttKey, currentUser.pttReleaseDelay, currentVoiceChannelId]);

  // 3. Connect to Voice Channel
  const handleJoinVoice = async (channelId: string) => {
    if (currentVoiceChannelId === channelId) return;

    if (currentVoiceChannelId) {
      soundEngine.playUserLeave();
      webrtcService.leaveSession();
    }

    setCurrentVoiceChannelId(channelId);
    soundEngine.playUserJoin();

    const myParticipant: VoiceParticipant = {
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      channelId,
      isMuted,
      isDeafened,
      isSpeaking: false,
      isScreenSharing: false,
      isCameraOn: false,
      viewers: [],
      joinedAt: Date.now(),
    };

    setVoiceParticipants((prev) => [...prev.filter((p) => p.userId !== currentUser.id), myParticipant]);

    // Send join-voice to WebSocket server
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join-voice',
          channelId,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          isMuted,
          isDeafened,
        })
      );
    }

    // Initialize WebRTC Mesh Audio & Video Session
    const existingPeerIds = voiceParticipants
      .filter((p) => p.channelId === channelId && p.userId !== currentUser.id)
      .map((p) => p.userId);

    await webrtcService.initSession(
      currentUser.id,
      channelId,
      (toUserId, signal) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'webrtc-signal',
              channelId,
              fromUserId: currentUser.id,
              toUserId,
              signal,
            })
          );
        }
      },
      existingPeerIds
    );
  };

  // 4. Leave Voice Channel
  const handleLeaveVoice = () => {
    if (!currentVoiceChannelId) return;
    soundEngine.playUserLeave();

    if (screenMediaStream) {
      screenMediaStream.getTracks().forEach((track) => track.stop());
      setScreenMediaStream(null);
    }
    screenShareService.cleanupAll();
    webrtcService.leaveSession();

    setVoiceParticipants((prev) => prev.filter((p) => p.userId !== currentUser.id));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'leave-voice',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          userName: currentUser.name,
        })
      );
    }

    setCurrentVoiceChannelId(null);
    setIsScreenSharing(false);
    setIsCameraOn(false);
  };

  // 5. Toggle Mute
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    webrtcService.setMuted(nextMuted);
    soundEngine.playMute(nextMuted);

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: nextMuted } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice-state-update',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          isMuted: nextMuted,
        })
      );
    }
  };

  // 6. Toggle Deafen
  const handleToggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    webrtcService.setDeafened(nextDeafened);
    soundEngine.playDeafen(nextDeafened);

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isDeafened: nextDeafened } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice-state-update',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          isDeafened: nextDeafened,
        })
      );
    }
  };

  // 7. Stop Screen Share
  const handleStopScreenShare = () => {
    if (screenMediaStream) {
      screenMediaStream.getTracks().forEach((track) => track.stop());
      setScreenMediaStream(null);
    }
    screenShareService.cleanupAll();
    webrtcService.setScreenShareStream(null);
    setIsScreenSharing(false);
    soundEngine.playScreenShareEnd();

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isScreenSharing: false } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'stop-screen-share',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          userName: currentUser.name,
        })
      );
    }
  };

  // 8. Start Screen Share
  const handleStartScreenShare = async () => {
    if (isScreenSharing) {
      handleStopScreenShare();
      return;
    }

    try {
      const result = await screenShareService.startScreenShare();
      const stream = result.stream;

      setScreenMediaStream(stream);
      setIsScreenSharing(true);
      soundEngine.playScreenShareStart();
      webrtcService.setScreenShareStream(stream);

      pushNotificationToast(
        'Transmissão ao Vivo Iniciada',
        'Você selecionou uma tela/janela para transmitir com WebRTC.',
        'stream_start'
      );

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopScreenShare();
        };
      }

      setVoiceParticipants((prev) =>
        prev.map((p) => (p.userId === currentUser.id ? { ...p, isScreenSharing: true } : p))
      );

      if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
        wsRef.current.send(
          JSON.stringify({
            type: 'start-screen-share',
            channelId: currentVoiceChannelId,
            userId: currentUser.id,
            userName: currentUser.name,
          })
        );
      }
    } catch (err: any) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('permission denied') ||
        err.message?.toLowerCase().includes('cancelled')
      ) {
        return;
      }

      console.warn('Screen share error:', err);
      pushNotificationToast(
        'Captura de Tela',
        `Não foi possível iniciar a captura: ${err.message || 'Verifique as permissões de tela.'}`,
        'message'
      );
    }
  };

  // 9. Change Screen Source
  const handleChangeScreenSource = async () => {
    try {
      const result = await screenShareService.startScreenShare();

      if (screenMediaStream) {
        screenMediaStream.getTracks().forEach((track) => track.stop());
      }
      screenShareService.cleanupAll();

      setScreenMediaStream(result.stream);
      webrtcService.setScreenShareStream(result.stream);

      const videoTrack = result.stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopScreenShare();
        };
      }
    } catch (err: any) {
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('permission denied') ||
        err.message?.toLowerCase().includes('cancelled')
      ) {
        return;
      }
      console.warn('Change screen error:', err);
    }
  };

  // 10. Toggle Camera
  const handleToggleCamera = () => {
    const nextCam = !isCameraOn;
    setIsCameraOn(nextCam);

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isCameraOn: nextCam } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice-state-update',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          isCameraOn: nextCam,
        })
      );
    }
  };

  return {
    currentVoiceChannelId,
    setCurrentVoiceChannelId,
    voiceParticipants,
    setVoiceParticipants,
    isMuted,
    setIsMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
    screenMediaStream,
    handleJoinVoice,
    handleLeaveVoice,
    handleToggleMute,
    handleToggleDeafen,
    handleStartScreenShare,
    handleStopScreenShare,
    handleChangeScreenSource,
    handleToggleCamera,
  };
}
