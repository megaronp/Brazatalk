import React, { useState, useEffect, useRef } from 'react';
import { Channel, VoiceParticipant, User } from '../../types';
import {
  Tv,
  Eye,
  Maximize2,
  Minimize2,
  MicOff,
  VolumeX,
  Volume2,
  Radio,
  Menu,
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
}

export const VoiceRoomStage: React.FC<VoiceRoomStageProps> = ({
  channel,
  participants,
  currentUser,
  onWatchStream,
  isWatchingStreamId,
  onStopWatchingStream,
  onToggleMobileNav,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const screenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Active Screen Sharing Participant
  const streamer = participants.find((p) => p.isScreenSharing);

  // Animated Screen Simulator Canvas (when streaming active)
  useEffect(() => {
    if (!streamer || !screenCanvasRef.current) return;
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
      ctx.fillText('BrazaTalk_Core_Engine.tsx - Live 60FPS Stream (E2EE 4K)', 90, 42);

      // Code Lines simulation
      const codeLines = [
        'import { RealTimeVoiceStream, E2EESecurity } from "@brazatalk/core";',
        'const stream = new RealTimeVoiceStream({ codec: "opus-hd", bitrate: 384000 });',
        'await stream.enableNoiseSuppression({ mode: "neural-dsp" });',
        'stream.on("viewerJoined", (viewer) => soundEngine.playStreamViewer());',
        `// Real-time Active Frame: ${frame} | Latency: 16ms | Codec: AES-GCM-256`,
        'console.log("Transmissão segura de tela ativa em tempo real!");',
      ];

      codeLines.forEach((line, idx) => {
        const y = 85 + idx * 24;
        ctx.fillStyle = idx === 3 ? '#f59e0b' : idx === 4 ? '#10b981' : '#94a3b8';
        ctx.fillText(line, 40, y);
      });

      // Animated audio frequency bars in stream
      ctx.fillStyle = '#6366f1';
      for (let i = 0; i < 28; i++) {
        const barHeight = Math.abs(Math.sin((frame + i * 5) * 0.08)) * 40 + 6;
        ctx.fillRect(40 + i * 14, canvas.height - 70 - barHeight, 8, barHeight);
      }

      animId = requestAnimationFrame(renderStream);
    };

    animId = requestAnimationFrame(renderStream);
    return () => cancelAnimationFrame(animId);
  }, [streamer]);

  return (
    <div
      id="voice-stage-container"
      className="flex-1 bg-[#090b10] flex flex-col overflow-hidden relative select-none p-4"
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
            <p className="text-[11px] sm:text-xs text-slate-400 font-normal truncate">{channel.topic || 'Sala de voz e transmissão'}</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {streamer && (
            <div className="flex items-center gap-1.5 bg-indigo-600 text-white text-[11px] sm:text-xs font-bold px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl shadow-md shadow-indigo-600/30 animate-pulse">
              <Tv className="w-3.5 h-3.5" />
              <span>AO VIVO</span>
            </div>
          )}

          <button
            id="btn-toggle-stage-fullscreen"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 sm:p-2 rounded-xl bg-[#181c2b] text-slate-300 hover:text-white border border-white/[0.06] transition-colors"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main Content: Streamer View or Grid */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 overflow-hidden">
        {/* If someone is sharing screen */}
        {streamer ? (
          <div className="flex-[3] bg-[#06070a] rounded-2xl border border-white/10 flex flex-col overflow-hidden relative shadow-2xl">
            {/* Stream Canvas */}
            <canvas
              ref={screenCanvasRef}
              width={1280}
              height={720}
              className="w-full h-full object-contain bg-black"
            />

            {/* Stream overlay controls */}
            <div className="absolute top-3 left-3 flex items-center gap-2 bg-black/80 backdrop-blur-md px-3.5 py-1.5 rounded-xl border border-white/10 text-xs">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              <span className="font-bold text-white truncate">{streamer.userName}&apos;s Screen</span>
              <span className="text-slate-500">|</span>
              <div className="flex items-center gap-1 text-emerald-400 font-medium">
                <Eye className="w-3.5 h-3.5" />
                <span>{streamer.viewers.length + (isWatchingStreamId === streamer.userId ? 1 : 0)} assistindo</span>
              </div>
            </div>

            {/* Watch stream button (triggers sound cue to streamer) */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              {streamer.userId !== currentUser.id && (
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
                  className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xl transition-all ${
                    isWatchingStreamId === streamer.userId
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:scale-105 shadow-indigo-600/30'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span>{isWatchingStreamId === streamer.userId ? 'Assistindo Transmissão' : 'Assistir ao Vivo'}</span>
                </button>
              )}
            </div>
          </div>
        ) : null}

        {/* Participants Grid */}
        <div
          className={`grid gap-3 ${
            streamer
              ? 'flex-1 grid-cols-2 lg:grid-cols-1 overflow-y-auto'
              : 'w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 auto-rows-fr'
          }`}
        >
          {participants.map((user) => {
            const isMe = user.userId === currentUser.id;

            return (
              <div
                key={user.userId}
                className={`relative bg-[#121520] rounded-2xl flex flex-col items-center justify-center p-6 border transition-all duration-300 overflow-hidden group shadow-lg min-h-[160px] ${
                  user.isSpeaking
                    ? 'border-emerald-500 ring-4 ring-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.3)]'
                    : 'border-white/[0.06] hover:border-white/[0.12]'
                }`}
              >
                {/* Background Banner Blur */}
                <div
                  className="absolute inset-0 opacity-15 bg-cover bg-center filter blur-2xl scale-125"
                  style={{ backgroundImage: `url(${user.userAvatar})` }}
                />

                {/* Avatar with Speaking Ring */}
                <div className="relative z-10 mb-3">
                  <div
                    className={`w-20 h-20 rounded-full overflow-hidden border-2 transition-transform duration-300 ${
                      user.isSpeaking ? 'border-emerald-400 scale-105 shadow-lg shadow-emerald-500/40' : 'border-transparent'
                    }`}
                  >
                    <img
                      src={user.userAvatar}
                      alt={user.userName}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  {user.isSpeaking && (
                    <div className="absolute -bottom-1 -right-1 bg-emerald-500 text-slate-950 p-1 rounded-full shadow-md animate-bounce">
                      <Volume2 className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {/* Name & Status */}
                <div className="z-10 flex flex-col items-center">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5 tracking-tight">
                    {user.userName}
                    {isMe && <span className="text-[10px] text-slate-400 font-normal">(Você)</span>}
                  </span>

                  {user.isScreenSharing && (
                    <span className="mt-1 flex items-center gap-1 text-[10px] font-bold bg-indigo-600 text-white px-2 py-0.5 rounded-full shadow-sm">
                      <Tv className="w-3 h-3" /> Transmitindo Tela
                    </span>
                  )}
                </div>

                {/* State Icons (Mute/Deafen) */}
                <div className="absolute top-3 right-3 flex items-center gap-1 z-10">
                  {user.isMuted && (
                    <div className="p-1 rounded-lg bg-black/70 text-rose-400 border border-white/[0.06]">
                      <MicOff className="w-3.5 h-3.5" />
                    </div>
                  )}
                  {user.isDeafened && (
                    <div className="p-1 rounded-lg bg-black/70 text-rose-400 border border-white/[0.06]">
                      <VolumeX className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
