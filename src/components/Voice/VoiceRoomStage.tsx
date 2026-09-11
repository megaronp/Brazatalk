import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Channel, VoiceParticipant, User } from '../../types';
import {
  Tv,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  VolumeX,
  Volume2,
  Radio,
  Menu,
  Monitor,
  Sparkles,
  LayoutGrid,
  UserPlus,
  Users,
  PhoneOff,
  Sliders,
  Pin,
  Check,
  Eye,
  Bell,
} from 'lucide-react';
import { soundEngine } from '../../services/soundEngine';
import { webrtcService } from '../../services/webrtcService';

interface VoiceRoomStageProps {
  channel: Channel;
  participants: VoiceParticipant[];
  currentUser: User;
  onWatchStream: (streamerUserId: string) => void;
  isWatchingStreamId: string | null;
  onStopWatchingStream: () => void;
  onToggleMobileNav?: () => void;
  onToggleMemberList?: () => void;
  showMemberList?: boolean;
  screenMediaStream?: MediaStream | null;
  onChangeScreenSource?: () => void;
  onToggleScreenShare?: () => void;
  onOpenInvite?: () => void;
  onLeaveVoice?: () => void;
  onOpenNotifications?: () => void;
  unreadNotificationsCount?: number;
}

interface LiveStreamVideoProps {
  stream: MediaStream | null;
  isLocal: boolean;
  isMuted?: boolean;
  volume?: number;
  userName?: string;
}

const LiveStreamVideo: React.FC<LiveStreamVideoProps> = ({
  stream,
  isLocal,
  isMuted = false,
  volume = 100,
  userName,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasLoadedVideoTrack, setHasLoadedVideoTrack] = useState(false);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      if (stream.getVideoTracks().length > 0) {
        setHasLoadedVideoTrack(true);
      }

      const handleAddTrack = () => {
        if (stream.getVideoTracks().length > 0) {
          setHasLoadedVideoTrack(true);
        }
      };

      stream.addEventListener('addtrack', handleAddTrack);

      videoEl.play().catch((err) => {
        console.warn('Video play delayed until user gesture:', err);
      });

      return () => {
        stream.removeEventListener('addtrack', handleAddTrack);
      };
    } else {
      videoEl.srcObject = null;
      setHasLoadedVideoTrack(false);
    }
  }, [stream]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : Math.min(1, volume / 100);
      videoRef.current.muted = isLocal || isMuted;
    }
  }, [volume, isMuted, isLocal]);

  return (
    <div className="w-full h-full relative flex items-center justify-center bg-black overflow-hidden rounded-xl">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isLocal || isMuted}
        className={`w-full h-full object-contain ${hasLoadedVideoTrack ? 'block' : 'opacity-0'}`}
      />
      {!hasLoadedVideoTrack && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 bg-[#07090e] p-4 text-center">
          <div className="relative">
            <div className="w-10 h-10 rounded-full border-2 border-indigo-500/30 border-t-indigo-500 animate-spin" />
            <Tv className="w-4 h-4 text-indigo-400 absolute inset-0 m-auto" />
          </div>
          <p className="text-xs font-semibold text-slate-300">
            Conectando transmissão de tela WebRTC...
          </p>
          {userName && (
            <span className="text-[11px] text-slate-500 truncate max-w-xs">
              Sincronizando stream ao vivo de {userName}
            </span>
          )}
        </div>
      )}
    </div>
  );
};

export const VoiceRoomStage: React.FC<VoiceRoomStageProps> = ({
  channel,
  participants,
  currentUser,
  onWatchStream,
  isWatchingStreamId,
  onStopWatchingStream,
  onToggleMobileNav,
  onToggleMemberList,
  showMemberList,
  screenMediaStream,
  onChangeScreenSource,
  onToggleScreenShare,
  onOpenInvite,
  onLeaveVoice,
  onOpenNotifications,
  unreadNotificationsCount = 0,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);

  // Active Streamer (if any)
  const activeStreamer = useMemo(
    () => participants.find((p) => p.isScreenSharing),
    [participants]
  );

  // Layout mode: 'spotlight' (single large stage) or 'grid' (all side-by-side)
  const [layoutMode, setLayoutMode] = useState<'spotlight' | 'grid'>('grid');
  const [spotlightUserId, setSpotlightUserId] = useState<string | null>(null);

  // Default to spotlight when someone starts screen sharing
  useEffect(() => {
    if (activeStreamer) {
      setSpotlightUserId(activeStreamer.userId);
      setLayoutMode('spotlight');
    }
  }, [activeStreamer?.userId]);

  // Stream Volume Controls (0% to 200%)
  const [streamVolume, setStreamVolume] = useState<number>(100);
  const [isStreamMuted, setIsStreamMuted] = useState<boolean>(false);
  const [showStreamVolumeSlider, setShowStreamVolumeSlider] = useState<boolean>(false);

  // Participant User Volume Controls (0% to 200%)
  const [userVolumes, setUserVolumes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('braza_user_volumes');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [activeVolumePopoverUserId, setActiveVolumePopoverUserId] = useState<string | null>(null);

  const handleUpdateUserVolume = (userId: string, volume: number) => {
    setUserVolumes((prev) => {
      const updated = { ...prev, [userId]: volume };
      try {
        localStorage.setItem('braza_user_volumes', JSON.stringify(updated));
      } catch {}
      return updated;
    });
    webrtcService.setPeerVolume(userId, volume);
  };

  // Real-time listener for WebRTC remote media streams
  const [, setRemoteStreamRevision] = useState(0);
  useEffect(() => {
    return webrtcService.onRemoteStream(() => {
      setRemoteStreamRevision((rev) => rev + 1);
    });
  }, []);

  const toggleFullscreen = () => {
    if (!stageContainerRef.current) return;
    if (!document.fullscreenElement) {
      stageContainerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Selected spotlight participant
  const spotlightUser = useMemo(() => {
    if (spotlightUserId) {
      return participants.find((p) => p.userId === spotlightUserId) || participants[0];
    }
    return activeStreamer || participants[0] || null;
  }, [spotlightUserId, participants, activeStreamer]);

  // Helper to get media stream for a participant
  const getParticipantStream = (user: VoiceParticipant): MediaStream | null => {
    if (user.userId === currentUser.id) {
      return screenMediaStream || null;
    }
    return webrtcService.getRemoteStream(user.userId) || null;
  };

  // Dynamic grid column class based on total tiles
  const getGridColsClass = (count: number) => {
    if (count <= 1) return 'grid-cols-1 max-w-3xl';
    if (count === 2) return 'grid-cols-1 sm:grid-cols-2 max-w-5xl';
    if (count <= 4) return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 max-w-6xl';
    if (count <= 6) return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 max-w-7xl';
    return 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4';
  };

  return (
    <div
      id="voice-stage-container"
      ref={stageContainerRef}
      className="flex-1 bg-[#090b10] flex flex-col overflow-hidden relative select-none p-3 sm:p-4"
    >
      {/* Stage Header */}
      <div className="flex items-center justify-between mb-3 bg-[#121520]/90 backdrop-blur-xl px-3.5 sm:px-4 py-2.5 rounded-2xl border border-white/[0.08] shadow-lg shrink-0 gap-2 flex-wrap sm:flex-nowrap">
        <div className="flex items-center gap-2.5 min-w-0">
          {onToggleMobileNav && (
            <button
              id="btn-voice-mobile-menu-toggle"
              onClick={onToggleMobileNav}
              title="Abrir Menu de Canais"
              className="md:hidden p-1.5 -ml-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <Radio className="w-4.5 h-4.5 sm:w-5 sm:h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 tracking-tight truncate">
              <span className="truncate">{channel.name}</span>
              {channel.isE2EE && (
                <span className="hidden sm:inline text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-semibold shrink-0">
                  E2EE
                </span>
              )}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-400 font-normal truncate">
              {participants.length} {participants.length === 1 ? 'membro na sala' : 'membros na sala'}
            </p>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Layout Mode Toggle: Grade vs Tela Principal */}
          <div className="flex items-center bg-[#151926] p-0.5 rounded-xl border border-white/[0.08]">
            <button
              id="btn-stage-mode-grid"
              onClick={() => setLayoutMode('grid')}
              title="Modo Grade: Ver todos lado a lado"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'grid'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Lado a Lado</span>
            </button>
            <button
              id="btn-stage-mode-spotlight"
              onClick={() => {
                setLayoutMode('spotlight');
                if (!spotlightUserId && participants.length > 0) {
                  setSpotlightUserId(activeStreamer?.userId || participants[0].userId);
                }
              }}
              title="Modo Foco: Tela Principal maior"
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                layoutMode === 'spotlight'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Tela Principal</span>
            </button>
          </div>

          {activeStreamer && (
            <div className="flex items-center gap-1.5 bg-rose-600 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl shadow-md shadow-rose-600/30 animate-pulse">
              <Tv className="w-3.5 h-3.5" />
              <span>AO VIVO</span>
            </div>
          )}

          {onOpenInvite && (
            <button
              id="btn-stage-invite"
              onClick={onOpenInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              title="Convidar amigos para este canal de voz"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Convidar</span>
            </button>
          )}

          {onOpenNotifications && (
            <button
              id="btn-stage-notifications"
              onClick={onOpenNotifications}
              title={
                unreadNotificationsCount > 0
                  ? `${unreadNotificationsCount} aviso(s) ou convite(s) pendente(s)`
                  : 'Avisos & Convites'
              }
              className={`relative p-1.5 sm:p-2 rounded-xl transition-colors cursor-pointer border ${
                unreadNotificationsCount > 0
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30'
                  : 'bg-[#181c2b] text-slate-300 hover:text-white border-white/[0.06]'
              }`}
            >
              <Bell className="w-4 h-4" />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[15px] h-[15px] px-0.5 bg-gradient-to-r from-red-500 to-orange-500 rounded-full text-[9px] font-extrabold text-white flex items-center justify-center shadow-md animate-pulse">
                  {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                </span>
              )}
            </button>
          )}

          <button
            id="btn-toggle-stage-fullscreen"
            onClick={toggleFullscreen}
            title="Alternar Tela Cheia"
            className="p-1.5 sm:p-2 rounded-xl bg-[#181c2b] text-slate-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {onToggleMemberList && (
            <button
              id="btn-stage-toggle-member-list"
              onClick={onToggleMemberList}
              title={showMemberList ? 'Ocultar Lista de Membros' : 'Exibir Membros da Sala'}
              className={`p-1.5 sm:p-2 rounded-xl border transition-colors cursor-pointer flex items-center gap-1.5 ${
                showMemberList
                  ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                  : 'bg-[#181c2b] text-slate-300 hover:text-white border-white/[0.06]'
              }`}
            >
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-semibold">Membros</span>
            </button>
          )}

          {/* Sair da Sala & Ir ao Chat Geral */}
          {onLeaveVoice && (
            <button
              id="btn-stage-leave-voice"
              onClick={onLeaveVoice}
              title="Sair da sala de voz e ir para o Chat Geral"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sair (Chat Geral)</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden min-h-0">
        {/* ===================== MODE 1: SPOTLIGHT / TELA PRINCIPAL ===================== */}
        {layoutMode === 'spotlight' && spotlightUser && (
          <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Main Stage (Grande Tela Principal) */}
            <div className="flex-[3] min-h-[260px] bg-[#06070a] rounded-2xl border border-white/10 flex flex-col overflow-hidden relative shadow-2xl group">
              {/* Media feed or Avatar presentation */}
              {spotlightUser.isScreenSharing ? (
                <LiveStreamVideo
                  stream={getParticipantStream(spotlightUser)}
                  isLocal={spotlightUser.userId === currentUser.id}
                  isMuted={isStreamMuted}
                  volume={streamVolume}
                  userName={spotlightUser.userName}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-gradient-to-b from-[#111422] to-[#090b12] relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-15 bg-cover bg-center filter blur-3xl scale-150 pointer-events-none"
                    style={{ backgroundImage: `url(${spotlightUser.userAvatar})` }}
                  />
                  <div className="relative z-10 flex flex-col items-center text-center">
                    <div className="relative mb-4">
                      <img
                        src={spotlightUser.userAvatar}
                        alt={spotlightUser.userName}
                        referrerPolicy="no-referrer"
                        className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 shadow-2xl object-cover transition-all ${
                          spotlightUser.isSpeaking
                            ? 'border-emerald-400 ring-8 ring-emerald-500/30 scale-105 shadow-[0_0_40px_rgba(16,185,129,0.4)]'
                            : 'border-white/10'
                        }`}
                      />
                      {spotlightUser.isSpeaking && (
                        <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1.5 rounded-full shadow-lg animate-pulse">
                          <Volume2 className="w-4 h-4" />
                        </div>
                      )}
                      {spotlightUser.isMuted && (
                        <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1.5 rounded-full shadow-lg">
                          <MicOff className="w-4 h-4" />
                        </div>
                      )}
                    </div>
                    <h3 className="text-lg sm:text-xl font-black text-white tracking-tight flex items-center gap-2">
                      <span>{spotlightUser.userName}</span>
                      {spotlightUser.userId === currentUser.id && (
                        <span className="text-[11px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-semibold border border-indigo-500/30">
                          Você
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      {spotlightUser.isSpeaking
                        ? 'Falando ao vivo no microfone...'
                        : spotlightUser.isMuted
                        ? 'Microfone mutado no momento.'
                        : 'Conectado no canal com áudio de alta definição.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Stream Overlay Header */}
              <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs shadow-lg flex-wrap">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    spotlightUser.isScreenSharing ? 'bg-rose-500 animate-ping' : 'bg-emerald-500'
                  }`}
                />
                <span className="font-bold text-white truncate max-w-[160px] sm:max-w-xs">
                  {spotlightUser.userId === currentUser.id
                    ? spotlightUser.isScreenSharing
                      ? 'Sua Tela Ao Vivo'
                      : 'Você (Tela Principal)'
                    : spotlightUser.isScreenSharing
                    ? `Tela de ${spotlightUser.userName}`
                    : spotlightUser.userName}
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                  <Sparkles className="w-3 h-3" /> WebRTC HD 60FPS
                </span>
              </div>

              {/* Controls at Bottom Overlay */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2 z-20">
                {/* Volume Slider for Stream */}
                {spotlightUser.isScreenSharing && (
                  <div className="relative">
                    <button
                      id="btn-stream-volume-toggle"
                      onClick={() => setShowStreamVolumeSlider(!showStreamVolumeSlider)}
                      title={`Volume da Transmissão (${isStreamMuted ? 'Mudo' : `${streamVolume}%`})`}
                      className="p-2 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/10 backdrop-blur-md transition-colors cursor-pointer shadow-lg"
                    >
                      {isStreamMuted || streamVolume === 0 ? (
                        <VolumeX className="w-4 h-4 text-rose-400" />
                      ) : (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      )}
                    </button>
                    {showStreamVolumeSlider && (
                      <div className="absolute bottom-full right-0 mb-2 p-3 bg-[#121520] border border-white/10 rounded-2xl shadow-2xl flex flex-col items-center gap-2 w-36 backdrop-blur-xl z-30">
                        <span className="text-[10px] font-bold text-slate-300">
                          Volume: {streamVolume}%
                        </span>
                        <input
                          type="range"
                          min="0"
                          max="200"
                          value={streamVolume}
                          onChange={(e) => {
                            setStreamVolume(Number(e.target.value));
                            if (isStreamMuted) setIsStreamMuted(false);
                          }}
                          className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Back to Grid Button */}
                <button
                  id="btn-spotlight-back-to-grid"
                  onClick={() => setLayoutMode('grid')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-black/70 hover:bg-black/90 text-white border border-white/10 backdrop-blur-md text-xs font-bold transition-all shadow-lg cursor-pointer"
                  title="Voltar para exibição lado a lado"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Ver Todos (Grade)</span>
                </button>
              </div>
            </div>

            {/* Horizontal Strip of All Participants (Lado a Lado abaixo da Tela Principal) */}
            <div className="shrink-0 bg-[#0d1019] p-2.5 rounded-2xl border border-white/[0.08] shadow-inner">
              <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
                {participants.map((user) => {
                  const isMe = user.userId === currentUser.id;
                  const isSelected = spotlightUser.userId === user.userId;
                  const userVol = userVolumes[user.userId] ?? 100;

                  return (
                    <div
                      key={user.userId}
                      onClick={() => setSpotlightUserId(user.userId)}
                      className={`shrink-0 w-36 sm:w-44 bg-[#141724] rounded-xl p-2.5 border transition-all cursor-pointer flex flex-col items-center gap-2 relative group hover:border-indigo-500/50 ${
                        isSelected
                          ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-[#191e30]'
                          : 'border-white/[0.06]'
                      }`}
                    >
                      {/* Avatar or Mini Video indicator */}
                      <div className="relative">
                        <img
                          src={user.userAvatar}
                          alt={user.userName}
                          referrerPolicy="no-referrer"
                          className={`w-10 h-10 rounded-full border-2 object-cover ${
                            user.isSpeaking
                              ? 'border-emerald-400 ring-4 ring-emerald-500/30'
                              : 'border-white/10'
                          }`}
                        />
                        {user.isScreenSharing && (
                          <div className="absolute -bottom-1 -right-1 bg-rose-500 text-white p-1 rounded-full shadow">
                            <Tv className="w-2.5 h-2.5" />
                          </div>
                        )}
                      </div>

                      {/* Info & Status */}
                      <div className="w-full min-w-0 text-center">
                        <p className="text-xs font-bold text-white truncate">
                          {user.userName}
                        </p>
                        <div className="flex items-center justify-center gap-1 mt-0.5">
                          {user.isSpeaking ? (
                            <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-0.5">
                              <Volume2 className="w-2.5 h-2.5" /> Falando
                            </span>
                          ) : user.isMuted ? (
                            <span className="text-[10px] text-rose-400 flex items-center gap-0.5">
                              <MicOff className="w-2.5 h-2.5" /> Mutado
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Ativo</span>
                          )}
                        </div>
                      </div>

                      {isSelected && (
                        <div className="absolute top-1.5 right-1.5 text-[9px] font-bold bg-indigo-500 text-white px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                          <Pin className="w-2.5 h-2.5" /> Foco
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================== MODE 2: MODO GRADE (LADO A LADO) ===================== */}
        {layoutMode === 'grid' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-1 flex flex-col justify-center min-h-0">
            <div
              id="voice-participants-responsive-grid"
              className={`grid gap-3 sm:gap-4 w-full mx-auto ${getGridColsClass(
                participants.length
              )}`}
            >
              {participants.map((user) => {
                const isMe = user.userId === currentUser.id;
                const userVol = userVolumes[user.userId] ?? 100;
                const isUserMutedLocally = userVol === 0;
                const isVolumePopoverOpen = activeVolumePopoverUserId === user.userId;
                const stream = getParticipantStream(user);

                return (
                  <div
                    key={user.userId}
                    className={`w-full aspect-[16/10] relative bg-[#121520] rounded-2xl flex flex-col items-center justify-between p-3 border transition-all duration-300 overflow-hidden group shadow-xl ${
                      user.isSpeaking
                        ? 'border-emerald-400 ring-4 ring-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.3)] scale-[1.01]'
                        : 'border-white/[0.08] hover:border-white/[0.2]'
                    }`}
                  >
                    {/* If this user is screen sharing, show the real live video feed inside the card */}
                    {user.isScreenSharing ? (
                      <div className="absolute inset-0 z-0">
                        <LiveStreamVideo
                          stream={stream}
                          isLocal={isMe}
                          isMuted={isUserMutedLocally}
                          volume={userVol}
                          userName={user.userName}
                        />
                      </div>
                    ) : (
                      /* Background Glow for audio-only */
                      <div
                        className="absolute inset-0 opacity-20 bg-cover bg-center filter blur-xl scale-125 pointer-events-none"
                        style={{ backgroundImage: `url(${user.userAvatar})` }}
                      />
                    )}

                    {/* Top Bar: Status Badges & Pin to Spotlight */}
                    <div className="w-full flex items-center justify-between z-10 gap-1 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-xl border border-white/5">
                      {/* Speaking / Mic Status */}
                      <div className="flex items-center gap-1.5">
                        {user.isSpeaking ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500/25 text-emerald-300 border border-emerald-400/50 px-2 py-0.5 rounded-full animate-pulse">
                            <Volume2 className="w-3 h-3" /> Falando
                          </span>
                        ) : user.isMuted ? (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                            <MicOff className="w-3 h-3 text-rose-400" /> Mutado
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                            <Mic className="w-3 h-3 text-emerald-400" /> Aberto
                          </span>
                        )}

                        {user.isScreenSharing && (
                          <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-500 text-white px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                            <Tv className="w-3 h-3" /> Tela
                          </span>
                        )}
                      </div>

                      {/* Right Action Icons: Volume & Pin to Spotlight */}
                      <div className="flex items-center gap-1">
                        {/* Volume Slider Popover */}
                        {!isMe && (
                          <div className="relative">
                            <button
                              id={`btn-user-volume-${user.userId}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveVolumePopoverUserId(
                                  isVolumePopoverOpen ? null : user.userId
                                );
                              }}
                              title={`Volume de ${user.userName} (${userVol}%)`}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isUserMutedLocally
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-black/60 text-slate-300 hover:text-white border-white/10'
                              }`}
                            >
                              {isUserMutedLocally ? (
                                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5 text-slate-300" />
                              )}
                            </button>

                            {isVolumePopoverOpen && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="absolute right-0 top-full mt-2 z-30 w-44 p-3 bg-[#161a28] rounded-2xl border border-white/15 shadow-2xl backdrop-blur-xl flex flex-col gap-2"
                              >
                                <div className="flex items-center justify-between text-[11px] text-white font-bold">
                                  <span className="truncate">{user.userName}</span>
                                  <span className="text-emerald-400 font-mono">{userVol}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="200"
                                  value={userVol}
                                  onChange={(e) =>
                                    handleUpdateUserVolume(user.userId, Number(e.target.value))
                                  }
                                  className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                                />
                                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-white/5">
                                  <button
                                    onClick={() => handleUpdateUserVolume(user.userId, 0)}
                                    className="hover:text-rose-400 transition-colors"
                                  >
                                    Mutar
                                  </button>
                                  <button
                                    onClick={() => handleUpdateUserVolume(user.userId, 100)}
                                    className="hover:text-indigo-400 transition-colors"
                                  >
                                    100% Padrão
                                  </button>
                                  <button
                                    onClick={() => handleUpdateUserVolume(user.userId, 200)}
                                    className="hover:text-emerald-400 transition-colors"
                                  >
                                    200% Max
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Button to Spotlight this User */}
                        <button
                          id={`btn-spotlight-user-${user.userId}`}
                          onClick={() => {
                            setSpotlightUserId(user.userId);
                            setLayoutMode('spotlight');
                          }}
                          title="Exibir na Tela Principal Maior"
                          className="p-1.5 rounded-lg bg-black/60 hover:bg-indigo-600 text-slate-300 hover:text-white border border-white/10 transition-all cursor-pointer"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Center: Avatar when not sharing screen or mini avatar overlay */}
                    {!user.isScreenSharing && (
                      <div className="my-auto flex flex-col items-center justify-center z-10">
                        <img
                          src={user.userAvatar}
                          alt={user.userName}
                          referrerPolicy="no-referrer"
                          className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full border-3 shadow-xl object-cover transition-transform ${
                            user.isSpeaking
                              ? 'border-emerald-400 ring-4 ring-emerald-500/30 scale-105'
                              : 'border-white/10'
                          }`}
                        />
                      </div>
                    )}

                    {/* Bottom Bar: User Name & Click to Focus Banner */}
                    <div
                      onClick={() => {
                        setSpotlightUserId(user.userId);
                        setLayoutMode('spotlight');
                      }}
                      className="w-full flex items-center justify-between z-10 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/5 cursor-pointer hover:bg-black/80 transition-colors"
                    >
                      <span className="text-xs font-bold text-white truncate max-w-[130px] sm:max-w-xs flex items-center gap-1.5">
                        <span className="truncate">{user.userName}</span>
                        {isMe && (
                          <span className="text-[9px] bg-indigo-500/30 text-indigo-300 px-1.5 py-0.5 rounded font-semibold shrink-0">
                            Você
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] text-slate-400 group-hover:text-indigo-300 flex items-center gap-1 shrink-0 font-medium transition-colors">
                        <Eye className="w-3 h-3" /> Foco
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
