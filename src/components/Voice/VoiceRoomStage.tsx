import React, { useState, useEffect, useRef } from 'react';
import { Channel, VoiceParticipant, User } from '../../types';
import {
  Tv,
  Eye,
  Maximize2,
  Minimize2,
  Mic,
  MicOff,
  VolumeX,
  Volume2,
  Volume1,
  Radio,
  Menu,
  Monitor,
  RefreshCw,
  Sparkles,
  Layers,
  Video,
  VideoOff,
  Headphones,
  Sliders,
} from 'lucide-react';
import { soundEngine } from '../../services/soundEngine';

interface VoiceRoomStageProps {
  channel: Channel;
  participants: VoiceParticipant[];
  currentUser: User;
  onWatchStream: (streamerUserId: string) => void;
  isWatchingStreamId: string | null;
  onStopWatchingStream: () => void;
  onToggleMobileNav?: () => void;
  screenMediaStream?: MediaStream | null;
  onChangeScreenSource?: () => void;
  onToggleScreenShare?: () => void;
}

export const VoiceRoomStage: React.FC<VoiceRoomStageProps> = ({
  channel,
  participants,
  currentUser,
  onWatchStream,
  isWatchingStreamId,
  onStopWatchingStream,
  onToggleMobileNav,
  screenMediaStream,
  onChangeScreenSource,
  onToggleScreenShare,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

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
  };

  // Active Screen Sharing Participant
  const streamer = participants.find((p) => p.isScreenSharing);
  const isMeStreaming = streamer?.userId === currentUser.id;

  // Update real video element volume
  useEffect(() => {
    if (videoRef.current) {
      const vol = isStreamMuted ? 0 : Math.min(1, streamVolume / 100);
      videoRef.current.volume = vol;
      videoRef.current.muted = isStreamMuted || isMeStreaming;
    }
  }, [streamVolume, isStreamMuted, isMeStreaming]);

  // Attach real MediaStream to video element
  useEffect(() => {
    if (videoRef.current) {
      if (screenMediaStream) {
        videoRef.current.srcObject = screenMediaStream;
        videoRef.current.play().catch((err) => console.warn('Video play prevented:', err));
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [screenMediaStream, streamer]);

  // Fallback Animated Screen Visualizer (when viewing remote stream or demo)
  useEffect(() => {
    if (!streamer || screenMediaStream || !screenCanvasRef.current) return;
    const canvas = screenCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    let animId: number;

    const renderStream = () => {
      frame++;
      ctx.fillStyle = '#06070a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw simulated code IDE & real-time stream visualizer
      ctx.fillStyle = '#0e111a';
      ctx.fillRect(20, 20, canvas.width - 40, canvas.height - 40);

      // IDE Header
      ctx.fillStyle = '#161a26';
      ctx.fillRect(20, 20, canvas.width - 40, 36);

      ctx.fillStyle = '#6366f1';
      ctx.beginPath();
      ctx.arc(45, 38, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(65, 38, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.fillText(`Transmissão de ${streamer.userName} - 60FPS Live HD (E2EE)`, 90, 42);

      // Code Lines simulation
      const codeLines = [
        'import { RealTimeVoiceStream, E2EESecurity } from "@brazatalk/core";',
        'const stream = new RealTimeVoiceStream({ codec: "opus-hd", bitrate: 384000 });',
        'await stream.enableNoiseSuppression({ mode: "neural-dsp" });',
        'stream.on("viewerJoined", (viewer) => soundEngine.playStreamViewer());',
        `// Transmissão ativa | Frame: ${frame} | Volume: ${isStreamMuted ? 'Mudo' : `${streamVolume}%`} | 1080p 60fps`,
        'console.log("Transmissão ao vivo segura com áudio estéreo!");',
      ];

      codeLines.forEach((line, idx) => {
        const y = 85 + idx * 24;
        ctx.fillStyle = idx === 3 ? '#f59e0b' : idx === 4 ? '#10b981' : '#94a3b8';
        ctx.fillText(line, 40, y);
      });

      // Animated audio frequency bars in stream
      ctx.fillStyle = isStreamMuted ? '#475569' : '#6366f1';
      const volMultiplier = isStreamMuted ? 0 : streamVolume / 100;
      for (let i = 0; i < 28; i++) {
        const barHeight = (Math.abs(Math.sin((frame + i * 5) * 0.08)) * 40 + 6) * Math.min(1.5, volMultiplier);
        ctx.fillRect(40 + i * 14, canvas.height - 70 - barHeight, 8, barHeight);
      }

      animId = requestAnimationFrame(renderStream);
    };

    animId = requestAnimationFrame(renderStream);
    return () => cancelAnimationFrame(animId);
  }, [streamer, screenMediaStream, streamVolume, isStreamMuted]);

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

  const handlePiP = async () => {
    if (videoRef.current && document.pictureInPictureEnabled) {
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        } else {
          await videoRef.current.requestPictureInPicture();
        }
      } catch (err) {
        console.warn('PiP error:', err);
      }
    }
  };

  return (
    <div
      id="voice-stage-container"
      ref={stageContainerRef}
      className="flex-1 bg-[#090b10] flex flex-col overflow-hidden relative select-none p-3 sm:p-4"
    >
      {/* Stage Header */}
      <div className="flex items-center justify-between mb-3 md:mb-4 bg-[#121520]/80 backdrop-blur-xl px-3 sm:px-4 py-2.5 rounded-2xl border border-white/[0.08] shadow-lg shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Mobile menu toggle */}
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
              {streamer ? `Transmitindo tela: ${streamer.userName}` : channel.topic || 'Sala de voz e conferência'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {streamer && (
            <div className="flex items-center gap-1.5 bg-rose-600 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl shadow-md shadow-rose-600/30 animate-pulse">
              <Tv className="w-3.5 h-3.5" />
              <span>AO VIVO 60FPS</span>
            </div>
          )}

          <button
            id="btn-toggle-stage-fullscreen"
            onClick={toggleFullscreen}
            title="Alternar Tela Cheia"
            className="p-1.5 sm:p-2 rounded-xl bg-[#181c2b] text-slate-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content: Streamer View or Grid */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* If someone is sharing screen */}
        {streamer ? (
          <div className="flex-[3] bg-[#06070a] rounded-2xl border border-white/10 flex flex-col overflow-hidden relative shadow-2xl group min-h-[300px]">
            {/* Real Video Stream if local or fallback canvas */}
            {screenMediaStream ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMeStreaming || isStreamMuted}
                className="w-full h-full object-contain bg-black"
              />
            ) : (
              <canvas
                ref={screenCanvasRef}
                width={1280}
                height={720}
                className="w-full h-full object-contain bg-black"
              />
            )}

            {/* Stream Top Info Overlay */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs shadow-lg flex-wrap">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
              <span className="font-bold text-white truncate">
                {isMeStreaming ? 'Sua Tela Real' : `Tela de ${streamer.userName}`}
              </span>
              <span className="text-slate-500">|</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> 1080p 60FPS
              </span>
              <span className="text-slate-500">|</span>
              <div className="flex items-center gap-1 text-indigo-300 font-medium">
                <Eye className="w-3.5 h-3.5" />
                <span>{streamer.viewers.length + (isWatchingStreamId === streamer.userId ? 1 : 0)} assistindo</span>
              </div>
            </div>

            {/* Stream Bottom Floating Action Controls */}
            <div className="absolute bottom-3 sm:bottom-4 right-3 sm:right-4 flex items-center gap-2 flex-wrap">
              {/* Stream Volume Control */}
              <div className="relative">
                <button
                  id="btn-toggle-stream-volume-slider"
                  onClick={() => setShowStreamVolumeSlider((prev) => !prev)}
                  title="Controle de Volume da Transmissão"
                  className="px-3 py-2 rounded-xl bg-black/75 hover:bg-black/90 text-white text-xs font-semibold flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg"
                >
                  {isStreamMuted || streamVolume === 0 ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : streamVolume < 50 ? (
                    <Volume1 className="w-4 h-4 text-indigo-300" />
                  ) : (
                    <Volume2 className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{isStreamMuted ? 'Mudo' : `${streamVolume}%`}</span>
                </button>

                {/* Popover volume slider for the stream */}
                {showStreamVolumeSlider && (
                  <div className="absolute bottom-full right-0 mb-2 p-3 bg-[#121520]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl w-56 flex flex-col gap-2 z-30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-indigo-400" /> Volume do Stream
                      </span>
                      <span className="font-mono font-bold text-indigo-300">{streamVolume}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        id="btn-stream-quick-mute"
                        onClick={() => setIsStreamMuted((prev) => !prev)}
                        title={isStreamMuted ? 'Desmutar Transmissão' : 'Mutar Transmissão'}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          isStreamMuted
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : 'bg-white/10 text-slate-300 hover:text-white border-white/10'
                        }`}
                      >
                        {isStreamMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      <input
                        id="input-stream-volume-range"
                        type="range"
                        min="0"
                        max="200"
                        step="1"
                        value={isStreamMuted ? 0 : streamVolume}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setStreamVolume(val);
                          if (isStreamMuted && val > 0) setIsStreamMuted(false);
                        }}
                        className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                      />
                    </div>

                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>0%</span>
                      <span>100% (Padrão)</span>
                      <span className="text-amber-400 font-semibold">200% (Boost)</span>
                    </div>
                  </div>
                )}
              </div>

              {/* If I am the streamer: Switch Screen source or Stop */}
              {isMeStreaming ? (
                <>
                  {onChangeScreenSource && (
                    <button
                      id="btn-switch-screen-source"
                      onClick={onChangeScreenSource}
                      className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md border border-white/20 transition-all cursor-pointer shadow-lg"
                      title="Escolher outra tela, janela ou guia"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Trocar Janela/Tela</span>
                    </button>
                  )}

                  {onToggleScreenShare && (
                    <button
                      id="btn-stop-sharing-from-stage"
                      onClick={onToggleScreenShare}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 backdrop-blur-md transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                    >
                      <Tv className="w-3.5 h-3.5" />
                      <span>Parar Transmissão</span>
                    </button>
                  )}
                </>
              ) : (
                /* If watching someone else: Watch live button */
                <button
                  id="btn-watch-streamer"
                  onClick={() => {
                    if (isWatchingStreamId === streamer.userId) {
                      onStopWatchingStream();
                    } else {
                      onWatchStream(streamer.userId);
                      soundEngine.playStreamViewer();
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xl transition-all cursor-pointer ${
                    isWatchingStreamId === streamer.userId
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 shadow-indigo-600/30'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{isWatchingStreamId === streamer.userId ? 'Assistindo Transmissão' : 'Assistir ao Vivo'}</span>
                </button>
              )}

              {screenMediaStream && (
                <button
                  id="btn-pip-stage"
                  onClick={handlePiP}
                  title="Picture in Picture (Mini Janela)"
                  className="p-2 rounded-xl bg-black/60 hover:bg-black/80 text-white border border-white/20 backdrop-blur-md transition-colors cursor-pointer"
                >
                  <Layers className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Participants Grid */}
        <div
          className={`grid gap-3.5 ${
            streamer
              ? 'flex-1 grid-cols-2 lg:grid-cols-1 overflow-y-auto max-h-[260px] lg:max-h-none custom-scrollbar'
              : 'w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
          }`}
        >
          {participants.map((user) => {
            const isMe = user.userId === currentUser.id;
            const userVol = userVolumes[user.userId] ?? 100;
            const isUserMutedLocally = userVol === 0;
            const isVolumePopoverOpen = activeVolumePopoverUserId === user.userId;

            return (
              <div
                key={user.userId}
                className={`relative bg-[#121520] rounded-2xl flex flex-col items-center justify-between p-4 sm:p-5 border transition-all duration-300 overflow-hidden group shadow-lg min-h-[175px] ${
                  user.isSpeaking
                    ? 'border-emerald-400 ring-4 ring-emerald-500/30 shadow-[0_0_35px_rgba(16,185,129,0.35)] scale-[1.01]'
                    : 'border-white/[0.08] hover:border-white/[0.16]'
                }`}
              >
                {/* Background Banner Blur */}
                <div
                  className="absolute inset-0 opacity-15 bg-cover bg-center filter blur-2xl scale-125 pointer-events-none"
                  style={{ backgroundImage: `url(${user.userAvatar})` }}
                />

                {/* Top Row: Speaking Indicator Banner & Controls */}
                <div className="w-full flex items-center justify-between z-10 gap-1.5">
                  {/* Speaking or Open Mic Indicator */}
                  {user.isSpeaking ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 px-2 py-0.5 rounded-full animate-pulse shadow-sm">
                      <Volume2 className="w-3 h-3" /> Falando
                    </span>
                  ) : user.isMuted ? (
                    <span className="flex items-center gap-1 text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded-full">
                      <MicOff className="w-3 h-3 text-rose-400" /> Mutado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                      <Mic className="w-3 h-3 text-emerald-400" /> Mic Aberto
                    </span>
                  )}

                  {/* Volume Slider Toggle for this participant (if not me) */}
                  <div className="relative">
                    {!isMe && (
                      <button
                        id={`btn-user-volume-${user.userId}`}
                        onClick={() =>
                          setActiveVolumePopoverUserId(
                            isVolumePopoverOpen ? null : user.userId
                          )
                        }
                        title={`Ajustar volume de ${user.userName} (${userVol}%)`}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          isUserMutedLocally
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : userVol !== 100
                            ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/40'
                            : 'bg-black/40 hover:bg-black/70 text-slate-400 hover:text-white border-white/[0.08]'
                        }`}
                      >
                        {isUserMutedLocally ? (
                          <VolumeX className="w-3.5 h-3.5" />
                        ) : userVol < 50 ? (
                          <Volume1 className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {/* Popover slider for individual user */}
                    {isVolumePopoverOpen && (
                      <div className="absolute top-full right-0 mt-2 p-3 bg-[#121520]/95 backdrop-blur-xl border border-white/15 rounded-2xl shadow-2xl w-48 flex flex-col gap-2 z-30">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-white truncate max-w-[100px]">{user.userName}</span>
                          <span className="font-mono font-bold text-indigo-300">{userVol}%</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            id={`btn-mute-user-${user.userId}`}
                            onClick={() =>
                              handleUpdateUserVolume(user.userId, isUserMutedLocally ? 100 : 0)
                            }
                            title={isUserMutedLocally ? 'Desmutar usuário' : 'Mutar usuário'}
                            className={`p-1.5 rounded-lg border transition-colors ${
                              isUserMutedLocally
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-white/10 text-slate-300 hover:text-white border-white/10'
                            }`}
                          >
                            {isUserMutedLocally ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                          </button>

                          <input
                            id={`slider-user-volume-${user.userId}`}
                            type="range"
                            min="0"
                            max="200"
                            step="1"
                            value={userVol}
                            onChange={(e) => handleUpdateUserVolume(user.userId, Number(e.target.value))}
                            className="w-full accent-indigo-500 cursor-pointer h-1.5 bg-white/10 rounded-lg appearance-none"
                          />
                        </div>

                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>0%</span>
                          <span>100%</span>
                          <span className="text-amber-400 font-semibold">200%</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Avatar with Animated Speaking Ring & Wave */}
                <div className="relative z-10 my-2 flex flex-col items-center">
                  <div
                    className={`relative rounded-full transition-all duration-300 p-0.5 ${
                      user.isSpeaking
                        ? 'ring-4 ring-emerald-400 ring-offset-2 ring-offset-[#121520] shadow-[0_0_24px_rgba(52,211,153,0.7)] scale-105'
                        : 'ring-1 ring-white/10'
                    }`}
                  >
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden">
                      <img
                        src={user.userAvatar}
                        alt={user.userName}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {user.isSpeaking && (
                      <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1.5 rounded-full shadow-md animate-bounce">
                        <Volume2 className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  {/* Equalizer Frequency bars animation when speaking */}
                  {user.isSpeaking && (
                    <div className="flex items-center gap-0.5 mt-2 h-3">
                      <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-2" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.6s_ease-in-out_infinite] h-3" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.3s_ease-in-out_infinite] h-2.5" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.5s_ease-in-out_infinite] h-3" />
                      <span className="w-1 bg-emerald-400 rounded-full animate-[pulse_0.4s_ease-in-out_infinite] h-1.5" />
                    </div>
                  )}
                </div>

                {/* Name & Role */}
                <div className="z-10 flex flex-col items-center text-center w-full">
                  <span className="text-sm font-bold text-white flex items-center justify-center gap-1.5 tracking-tight w-full">
                    <span className="truncate max-w-[140px]">{user.userName}</span>
                    {isMe && <span className="text-[10px] text-slate-400 font-normal shrink-0">(Você)</span>}
                  </span>

                  {/* Status Badges Row */}
                  <div className="flex items-center justify-center gap-1.5 mt-1.5 flex-wrap">
                    {user.isScreenSharing && (
                      <span className="flex items-center gap-1 text-[9px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-sm animate-pulse">
                        <Tv className="w-2.5 h-2.5" /> Tela Compartilhada
                      </span>
                    )}

                    {user.isCameraOn && (
                      <span className="flex items-center gap-1 text-[9px] font-semibold bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded-full">
                        <Video className="w-2.5 h-2.5" /> Câmera On
                      </span>
                    )}

                    {user.isDeafened && (
                      <span className="flex items-center gap-1 text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full" title="Áudio bloqueado">
                        <VolumeX className="w-2.5 h-2.5" /> Bloqueado
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
