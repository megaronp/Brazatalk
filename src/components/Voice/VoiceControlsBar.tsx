import React from 'react';
import { Channel, VoiceParticipant } from '../../types';
import {
  PhoneOff,
  Tv,
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Headphones,
  SignalHigh,
  VolumeX,
} from 'lucide-react';

interface VoiceControlsBarProps {
  currentChannel: Channel;
  participants: VoiceParticipant[];
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  isCameraOn: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleScreenShare: () => void;
  onToggleCamera: () => void;
  onLeaveVoice: () => void;
  pingMs?: number;
}

export const VoiceControlsBar: React.FC<VoiceControlsBarProps> = ({
  currentChannel,
  participants,
  isMuted,
  isDeafened,
  isScreenSharing,
  isCameraOn,
  onToggleMute,
  onToggleDeafen,
  onToggleScreenShare,
  onToggleCamera,
  onLeaveVoice,
  pingMs = 18,
}) => {
  return (
    <div
      id="voice-connection-status-bar"
      className="bg-[#090a10]/95 backdrop-blur-xl border-t border-white/[0.08] px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between z-30 select-none shadow-2xl"
    >
      {/* Voice Status & Ping */}
      <div className="flex flex-col min-w-0 pr-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
          <SignalHigh className="w-3.5 h-3.5 sm:w-4 sm:h-4 animate-pulse shrink-0" />
          <span className="truncate">Voz Conectada</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 truncate">
          <span className="truncate text-slate-300 font-medium">{currentChannel.name}</span>
          <span>•</span>
          <span className="text-emerald-400 font-mono font-semibold">{pingMs}ms</span>
          <span className="hidden xs:inline">•</span>
          <span className="hidden xs:inline">{participants.length} online</span>
        </div>
      </div>

      {/* Media Action Buttons */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        <button
          id="btn-toggle-screenshare"
          onClick={onToggleScreenShare}
          title={isScreenSharing ? 'Parar Compartilhamento de Tela' : 'Compartilhar Tela'}
          className={`px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-semibold transition-all ${
            isScreenSharing
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400/40'
              : 'bg-[#141722] text-slate-300 hover:bg-white/[0.08] hover:text-white border border-white/[0.06]'
          }`}
        >
          <Tv className="w-4 h-4" />
          <span className="hidden sm:inline">{isScreenSharing ? 'Transmitindo' : 'Compartilhar Tela'}</span>
        </button>

        <button
          id="btn-toggle-camera"
          onClick={onToggleCamera}
          title={isCameraOn ? 'Desligar Câmera' : 'Ligar Câmera'}
          className={`p-2 rounded-xl transition-all border ${
            isCameraOn
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
              : 'bg-[#141722] text-slate-300 hover:bg-white/[0.08] border-white/[0.06]'
          }`}
        >
          {isCameraOn ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
        </button>

        <button
          id="btn-voice-bar-mute"
          onClick={onToggleMute}
          title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
          className={`p-2 rounded-xl transition-all border ${
            isMuted
              ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
              : 'bg-[#141722] text-slate-300 hover:bg-white/[0.08] border-white/[0.06]'
          }`}
        >
          {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>

        <button
          id="btn-voice-bar-deafen"
          onClick={onToggleDeafen}
          title={isDeafened ? 'Desativar Silêncio' : 'Ensardecer'}
          className={`p-2 rounded-xl transition-all border ${
            isDeafened
              ? 'bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-500/20'
              : 'bg-[#141722] text-slate-300 hover:bg-white/[0.08] border-white/[0.06]'
          }`}
        >
          {isDeafened ? <VolumeX className="w-4 h-4" /> : <Headphones className="w-4 h-4" />}
        </button>

        {/* Disconnect Red Button */}
        <button
          id="btn-disconnect-voice"
          onClick={onLeaveVoice}
          title="Desconectar da Sala de Voz"
          className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl transition-all shadow-md shadow-rose-600/30 flex items-center justify-center cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
