import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import {
  User as UserIcon,
  Mic,
  Lock,
  HardDrive,
  Bell,
  Check,
  Copy,
  Download,
  LogOut,
  Volume2,
  VolumeX,
  Headphones,
  Play,
  Square,
  Sparkles,
  AlertCircle,
  Radio,
  Sliders,
  CheckCircle2,
  Mail,
  KeyRound,
  Image as ImageIcon,
  RefreshCw,
  Keyboard,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { e2eeService } from '../../services/e2eeService';
import { soundEngine } from '../../services/soundEngine';
import { 
  auth, 
  sendPasswordResetEmail, 
  updateEmail, 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider,
  updateProfile 
} from '../../services/firebase';

interface UserSettingsModalProps {
  currentUser: User;
  onClose: () => void;
  onUpdateUser: (updated: Partial<User>) => void;
  onOpenInstaller: () => void;
  onSignOut?: () => void;
}

const PRESET_AVATARS = [
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_cyber1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_cyber2',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_fire1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_neon1',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_phoenix',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_vortex',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_quantum',
  'https://api.dicebear.com/7.x/bottts/svg?seed=braza_galaxy',
];

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  currentUser,
  onClose,
  onUpdateUser,
  onOpenInstaller,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'voice' | 'e2ee' | 'notifications' | 'storage'>('profile');
  
  // Profile State
  const [name, setName] = useState(currentUser.name);
  const [email, setEmail] = useState(currentUser.email || '');
  const [avatar, setAvatar] = useState(currentUser.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`);
  const [customStatus, setCustomStatus] = useState(currentUser.customStatus || '');
  const [bio, setBio] = useState(currentUser.bio || '');
  const [userStatus, setUserStatus] = useState(currentUser.status);

  // Security / Password & Email Update States
  const [showPasswordChangeModal, setShowPasswordChangeModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityActionLoading, setSecurityActionLoading] = useState(false);
  const [securitySuccess, setSecuritySuccess] = useState<string | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);

  // Voice Mode & Push to Talk (PTT)
  const [voiceInputMode, setVoiceInputMode] = useState<'open' | 'ptt'>(currentUser.voiceInputMode || 'open');
  const [pttKey, setPttKey] = useState<string>(currentUser.pttKey || 'Space');
  const [pttReleaseDelay, setPttReleaseDelay] = useState<number>(currentUser.pttReleaseDelay ?? 200);
  const [isRecordingKey, setIsRecordingKey] = useState(false);

  // Audio testing & Devices
  const [audioInputDevices, setAudioInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('default');
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string>('default');

  const [micTesting, setMicTesting] = useState(false);
  const [micVolumeLevel, setMicVolumeLevel] = useState<number>(0);
  const [micLoopback, setMicLoopback] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);

  const [isTestingAudioOutput, setIsTestingAudioOutput] = useState(false);
  const [echoCancellation, setEchoCancellation] = useState(true);
  const [noiseSuppression, setNoiseSuppression] = useState(true);
  const [autoGainControl, setAutoGainControl] = useState(true);

  const [copiedFingerprint, setCopiedFingerprint] = useState(false);

  // Audio Context and Stream References
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const loopbackGainRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const fingerprint = currentUser.e2eeFingerprint || e2eeService.getFingerprint();

  // Enumerate real audio devices on mount or when tab changes to 'voice'
  useEffect(() => {
    const loadDevices = async () => {
      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) return;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const inputs = devices.filter((d) => d.kind === 'audioinput');
        const outputs = devices.filter((d) => d.kind === 'audiooutput');
        setAudioInputDevices(inputs);
        setAudioOutputDevices(outputs);
      } catch (err) {
        console.warn('Error enumerating devices:', err);
      }
    };

    loadDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', loadDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
      };
    }
  }, [activeTab]);

  // Key recording listener for Push-to-Talk shortcut
  useEffect(() => {
    if (!isRecordingKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setPttKey(e.code || e.key);
      setIsRecordingKey(false);
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [isRecordingKey]);

  // Clean up media streams and audio contexts when unmounting or switching tabs
  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const stopMicTest = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    loopbackGainRef.current = null;
    setMicTesting(false);
    setMicVolumeLevel(0);
    setMicError(null);
  };

  const startMicTest = async () => {
    stopMicTest();
    setMicError(null);

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setMicError('Seu navegador não suporta captura de microfone.');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedMicId !== 'default' ? { exact: selectedMicId } : undefined,
          echoCancellation,
          noiseSuppression,
          autoGainControl,
        },
        video: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      source.connect(analyser);

      // Loopback gain for hearing own voice
      const loopbackGain = audioCtx.createGain();
      loopbackGain.gain.value = micLoopback ? 1.0 : 0.0;
      loopbackGainRef.current = loopbackGain;
      source.connect(loopbackGain);
      loopbackGain.connect(audioCtx.destination);

      setMicTesting(true);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateMeter = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const level = Math.min(100, Math.round((average / 128) * 100 * 1.5));
        setMicVolumeLevel(level);

        animFrameRef.current = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err: any) {
      console.error('Microphone access error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Permissão do microfone negada. Conceda permissão no navegador para testar.');
      } else if (err.name === 'NotFoundError') {
        setMicError('Nenhum dispositivo de microfone foi encontrado.');
      } else {
        setMicError(`Erro ao acessar microfone: ${err.message || 'Verifique as permissões'}`);
      }
      setMicTesting(false);
    }
  };

  const toggleMicLoopback = () => {
    const nextState = !micLoopback;
    setMicLoopback(nextState);
    if (loopbackGainRef.current) {
      loopbackGainRef.current.gain.value = nextState ? 1.0 : 0.0;
    }
  };

  const handleTestAudioOutput = () => {
    setIsTestingAudioOutput(true);
    soundEngine.playMessage();
    setTimeout(() => {
      soundEngine.playStreamViewer();
      setTimeout(() => {
        setIsTestingAudioOutput(false);
      }, 700);
    }, 400);
  };

  const handleCopyFingerprint = () => {
    navigator.clipboard.writeText(fingerprint);
    setCopiedFingerprint(true);
    setTimeout(() => setCopiedFingerprint(false), 2000);
  };

  const handleSendPasswordReset = async () => {
    const targetEmail = email || currentUser.email || auth.currentUser?.email;
    if (!targetEmail) {
      setSecurityError('Não há um e-mail vinculado a esta conta para redefinição.');
      return;
    }

    try {
      setSecurityActionLoading(true);
      setSecurityError(null);
      setSecuritySuccess(null);
      await sendPasswordResetEmail(auth, targetEmail);
      setSecuritySuccess(`Link de recuperação enviado com sucesso para ${targetEmail}. Verifique sua caixa de entrada e spam.`);
    } catch (err: any) {
      console.error('Error sending reset email:', err);
      setSecurityError(err.message || 'Falha ao enviar e-mail de recuperação.');
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser) return;
    if (newPassword.length < 6) {
      setSecurityError('A nova senha deve possuir pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setSecurityError('A confirmação de senha não coincide com a nova senha.');
      return;
    }

    try {
      setSecurityActionLoading(true);
      setSecurityError(null);
      setSecuritySuccess(null);

      // If user signed in with password, re-authenticate if currentPassword provided
      if (currentPassword && auth.currentUser.email) {
        const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, credential);
      }

      await updatePassword(auth.currentUser, newPassword);
      setSecuritySuccess('Senha alterada com sucesso!');
      setShowPasswordChangeModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setSecurityError('Senha atual incorreta.');
      } else if (err.code === 'auth/requires-recent-login') {
        setSecurityError('Por motivos de segurança, você precisa ter feito login recentemente para alterar a senha.');
      } else {
        setSecurityError(err.message || 'Falha ao alterar senha.');
      }
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const handleUpdateEmailInAuth = async () => {
    if (!auth.currentUser || !email.trim() || email.trim() === currentUser.email) return;
    try {
      setSecurityActionLoading(true);
      setSecurityError(null);
      setSecuritySuccess(null);
      await updateEmail(auth.currentUser, email.trim());
      setSecuritySuccess('E-mail atualizado com sucesso no Firebase Auth!');
    } catch (err: any) {
      console.error('Update email error:', err);
      if (err.code === 'auth/requires-recent-login') {
        setSecurityError('Reautenticação necessária para alterar o e-mail no login.');
      } else {
        setSecurityError(err.message || 'Erro ao atualizar e-mail no Auth.');
      }
    } finally {
      setSecurityActionLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    // Sync Firebase Auth displayName & photoURL if authenticated
    if (auth.currentUser) {
      try {
        await updateProfile(auth.currentUser, {
          displayName: name.trim(),
          photoURL: avatar,
        });
      } catch (err) {
        console.warn('Could not sync auth profile:', err);
      }
    }

    onUpdateUser({
      name: name.trim(),
      email: email.trim(),
      avatar,
      customStatus,
      bio,
      status: userStatus,
      voiceInputMode,
      pttKey,
      pttReleaseDelay,
    });
    stopMicTest();
    onClose();
  };

  const handleRandomizeAvatar = () => {
    const randomSeed = `braza_${Math.random().toString(36).substring(2, 9)}`;
    setAvatar(`https://api.dicebear.com/7.x/bottts/svg?seed=${randomSeed}`);
  };

  return (
    <div
      id="modal-user-settings"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 select-none"
      onClick={() => {
        stopMicTest();
        onClose();
      }}
    >
      <div
        className="bg-[#0b0d14] w-full max-w-4xl h-[90vh] max-h-[760px] rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col md:flex-row animate-in fade-in zoom-in-95 duration-150 relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar Nav */}
        <div className="w-full md:w-64 bg-[#0e1018] p-4 sm:p-6 border-b md:border-b-0 md:border-r border-white/5 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-black shadow-md shadow-indigo-600/30">
                B
              </div>
              <div>
                <h2 className="text-sm font-black text-white tracking-tight">Configurações</h2>
                <p className="text-[11px] text-slate-400 font-medium">Braza Talk v1.2</p>
              </div>
            </div>

            <nav className="space-y-1">
              <button
                id="tab-btn-profile"
                onClick={() => {
                  stopMicTest();
                  setActiveTab('profile');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'profile'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <UserIcon className="w-4 h-4" />
                <span>Meu Perfil & Conta</span>
              </button>

              <button
                id="tab-btn-voice"
                onClick={() => setActiveTab('voice')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'voice'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Voz, Push-to-Talk & Som</span>
              </button>

              <button
                id="tab-btn-e2ee"
                onClick={() => {
                  stopMicTest();
                  setActiveTab('e2ee');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'e2ee'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>Segurança E2EE</span>
              </button>

              <button
                id="tab-btn-notifications"
                onClick={() => {
                  stopMicTest();
                  setActiveTab('notifications');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'notifications'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Notificações Push</span>
              </button>

              <button
                id="tab-btn-storage"
                onClick={() => {
                  stopMicTest();
                  setActiveTab('storage');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  activeTab === 'storage'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
              >
                <HardDrive className="w-4 h-4" />
                <span>Armazenamento & Cache</span>
              </button>
            </nav>
          </div>

          <div className="pt-4 border-t border-white/5 space-y-2">
            <button
              id="btn-settings-install-app"
              onClick={onOpenInstaller}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Instalar Aplicativo PWA</span>
            </button>

            {onSignOut && (
              <button
                id="btn-settings-sign-out"
                onClick={() => {
                  stopMicTest();
                  onSignOut();
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Encerrar Sessão</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto relative bg-[#0b0d14]">
          {/* Close button in top right */}
          <button
            id="btn-close-settings-modal"
            onClick={() => {
              stopMicTest();
              onClose();
            }}
            className="absolute top-4 sm:top-6 right-4 sm:right-6 p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer z-10"
          >
            ✕
          </button>

          {/* Feedback alerts */}
          {securitySuccess && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center justify-between gap-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{securitySuccess}</span>
              </div>
              <button onClick={() => setSecuritySuccess(null)} className="text-emerald-400 hover:text-white text-xs">✕</button>
            </div>
          )}

          {securityError && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-2 max-w-2xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{securityError}</span>
              </div>
              <button onClick={() => setSecurityError(null)} className="text-rose-400 hover:text-white text-xs">✕</button>
            </div>
          )}

          {/* ===================== PROFILE TAB ===================== */}
          {activeTab === 'profile' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Meu Perfil de Usuário & Conta</h3>
                <p className="text-xs text-slate-400 mt-0.5">Edite seu nome, avatar, bio, status, e-mail e credenciais de segurança.</p>
              </div>

              {/* Main Profile Box */}
              <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-5 shadow-md">
                {/* Avatar section */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 pb-3 border-b border-white/[0.06]">
                  <div className="relative group">
                    <img
                      src={avatar}
                      alt={name}
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-indigo-500 shadow-lg bg-[#161a27]"
                    />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#121520]" />
                  </div>

                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        id="btn-randomize-avatar"
                        type="button"
                        onClick={handleRandomizeAvatar}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Gerar Avatar Aleatório</span>
                      </button>

                      <span className="text-[11px] text-slate-500 font-mono">ou selecione um preset abaixo</span>
                    </div>

                    {/* Presets row */}
                    <div className="flex items-center gap-2 overflow-x-auto py-1">
                      {PRESET_AVATARS.map((presetUrl, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setAvatar(presetUrl)}
                          className={`w-9 h-9 rounded-xl overflow-hidden border-2 transition-all cursor-pointer shrink-0 ${
                            avatar === presetUrl ? 'border-indigo-500 scale-105 shadow-md' : 'border-transparent opacity-70 hover:opacity-100'
                          }`}
                        >
                          <img src={presetUrl} alt={`Preset ${idx + 1}`} className="w-full h-full object-cover bg-[#161a27]" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Custom Avatar URL Field */}
                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span>URL Personalizada da Imagem do Avatar</span>
                  </label>
                  <input
                    id="input-settings-avatar-url"
                    type="url"
                    value={avatar}
                    onChange={(e) => setAvatar(e.target.value)}
                    placeholder="https://exemplo.com/minha-foto.png"
                    className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                {/* Form Fields: Name, Email & Status */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Nome de Exibição
                    </label>
                    <input
                      id="input-settings-username"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5 flex items-center justify-between">
                      <span>Endereço de E-mail</span>
                      {email !== currentUser.email && (
                        <button
                          type="button"
                          onClick={handleUpdateEmailInAuth}
                          className="text-[10px] text-indigo-400 hover:underline cursor-pointer lowercase"
                        >
                          Atualizar no Auth
                        </button>
                      )}
                    </label>
                    <div className="relative">
                      <Mail className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="input-settings-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu.email@exemplo.com"
                        className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl pl-9 pr-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Status de Presença
                    </label>
                    <select
                      id="select-settings-status"
                      value={userStatus}
                      onChange={(e) => setUserStatus(e.target.value as any)}
                      className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="online">🟢 Online (Disponível)</option>
                      <option value="idle">🟡 Ausente (Idle)</option>
                      <option value="dnd">🔴 Não Perturbe (DND)</option>
                      <option value="offline">⚪ Invisível / Offline</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                      Mensagem de Status Customizada
                    </label>
                    <input
                      id="input-settings-custom-status"
                      type="text"
                      placeholder="Ex: Codando, Jogando, Na chamada..."
                      value={customStatus}
                      onChange={(e) => setCustomStatus(e.target.value)}
                      className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    Biografia / Sobre Mim
                  </label>
                  <textarea
                    id="textarea-settings-bio"
                    rows={3}
                    placeholder="Conte um pouco sobre você para a comunidade Braza..."
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl p-3 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    id="btn-save-user-profile"
                    onClick={handleSaveProfile}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer"
                  >
                    Salvar Perfil Completo
                  </button>
                </div>
              </div>

              {/* Security & Password Card */}
              <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4 shadow-md">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                      <KeyRound className="w-4 h-4 text-indigo-400" />
                      <span>Segurança da Senha & Recuperação</span>
                    </h4>
                    <p className="text-[11px] text-slate-400 font-normal mt-0.5">
                      Altere sua senha de acesso ou solicite um link de recuperação por e-mail.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    id="btn-send-password-reset-email"
                    type="button"
                    disabled={securityActionLoading}
                    onClick={handleSendPasswordReset}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>{securityActionLoading ? 'Enviando...' : 'Enviar Link de Redefinição de Senha'}</span>
                  </button>

                  <button
                    id="btn-open-change-password"
                    type="button"
                    onClick={() => setShowPasswordChangeModal(!showPasswordChangeModal)}
                    className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-semibold border border-white/10 transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Lock className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{showPasswordChangeModal ? 'Ocultar Formulário' : 'Alterar Senha Diretamente'}</span>
                  </button>
                </div>

                {/* Direct Password Change Form */}
                {showPasswordChangeModal && (
                  <form onSubmit={handleChangePassword} className="mt-3 pt-3 border-t border-white/[0.06] space-y-3 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">Nova Senha (Mínimo 6 dígitos)</label>
                        <input
                          id="input-new-password"
                          type="password"
                          required
                          minLength={6}
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold text-slate-400 block mb-1">Confirmar Nova Senha</label>
                        <input
                          id="input-confirm-password"
                          type="password"
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPasswordChangeModal(false)}
                        className="px-3 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        id="btn-confirm-password-update"
                        type="submit"
                        disabled={securityActionLoading}
                        className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                      >
                        {securityActionLoading ? 'Atualizando...' : 'Salvar Nova Senha'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* ===================== VOICE & AUDIO TAB (WITH PUSH-TO-TALK) ===================== */}
          {activeTab === 'voice' && (
            <div className="space-y-5 max-w-2xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>Configurações de Áudio & Microfone</span>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Tempo Real
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Configure modo Push-to-Talk ou Voz Aberta, selecione dispositivos de áudio e faça testes com retorno.
                </p>
              </div>

              {/* Push-to-Talk vs Open Mic Selection */}
              <div className="bg-[#121520] p-4 sm:p-5 rounded-2xl border border-white/[0.06] space-y-4 shadow-md">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Radio className="w-4 h-4 text-indigo-400" />
                  <span>Modo de Entrada de Voz (Voz Aberta vs Push-to-Talk)</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Open Mic Option */}
                  <label
                    id="radio-mode-open"
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      voiceInputMode === 'open'
                        ? 'bg-indigo-600/15 border-indigo-500 shadow-md'
                        : 'bg-[#161a27] border-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceInputMode"
                      value="open"
                      checked={voiceInputMode === 'open'}
                      onChange={() => setVoiceInputMode('open')}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Voz Aberta (Detecção Automática)</span>
                      <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                        Seu microfone transmite som continuamente ou quando você fala no volume de corte.
                      </span>
                    </div>
                  </label>

                  {/* Push to Talk Option */}
                  <label
                    id="radio-mode-ptt"
                    className={`flex items-start gap-3 p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      voiceInputMode === 'ptt'
                        ? 'bg-indigo-600/15 border-indigo-500 shadow-md'
                        : 'bg-[#161a27] border-white/[0.06] hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="voiceInputMode"
                      value="ptt"
                      checked={voiceInputMode === 'ptt'}
                      onChange={() => setVoiceInputMode('ptt')}
                      className="mt-0.5 accent-indigo-600"
                    />
                    <div>
                      <span className="text-xs font-bold text-white block">Push-to-Talk (Pressione para Falar)</span>
                      <span className="text-[11px] text-slate-400 leading-relaxed block mt-0.5">
                        O microfone permanece em silêncio absoluto até você segurar a tecla configurada.
                      </span>
                    </div>
                  </label>
                </div>

                {/* Push to talk keybinding configurator */}
                {voiceInputMode === 'ptt' && (
                  <div className="p-4 rounded-xl bg-[#0e1018] border border-indigo-500/30 space-y-3 animate-in fade-in duration-150">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <span className="text-xs font-bold text-indigo-300 block flex items-center gap-1.5">
                          <Keyboard className="w-4 h-4" />
                          <span>Atalho de Teclado (Tecla de Transmissão)</span>
                        </span>
                        <span className="text-[11px] text-slate-400">
                          Pressione o botão abaixo e depois aperte qualquer tecla (Ex: Espaço, V, Ctrl, Alt).
                        </span>
                      </div>

                      <button
                        id="btn-record-ptt-key"
                        type="button"
                        onClick={() => setIsRecordingKey(true)}
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider transition-all shadow-md cursor-pointer shrink-0 border ${
                          isRecordingKey
                            ? 'bg-rose-500 text-white border-rose-400 animate-pulse'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-400 shadow-indigo-600/30'
                        }`}
                      >
                        {isRecordingKey ? 'Pressione a tecla...' : `Tecla: [ ${pttKey} ]`}
                      </button>
                    </div>

                    <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs text-slate-400">
                      <span>Atraso de liberação PTT (evita cortes no final das frases):</span>
                      <span className="font-mono text-indigo-300 font-semibold">{pttReleaseDelay}ms</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Hardware Device Selectors */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3.5 shadow-md">
                <span className="text-xs font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>Dispositivos de Entrada e Saída</span>
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Mic input select */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Dispositivo de Entrada (Microfone)
                    </label>
                    <select
                      id="select-mic-device"
                      value={selectedMicId}
                      onChange={(e) => {
                        setSelectedMicId(e.target.value);
                        if (micTesting) {
                          stopMicTest();
                        }
                      }}
                      className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="default">Microfone Padrão do Sistema</option>
                      {audioInputDevices.map((device, idx) => (
                        <option key={device.deviceId || idx} value={device.deviceId}>
                          {device.label || `Microfone ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Speaker output select */}
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                      Dispositivo de Saída (Fone / Alto-falante)
                    </label>
                    <select
                      id="select-speaker-device"
                      value={selectedSpeakerId}
                      onChange={(e) => setSelectedSpeakerId(e.target.value)}
                      className="w-full bg-[#161a27] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="default">Alto-falante Padrão do Sistema</option>
                      {audioOutputDevices.map((device, idx) => (
                        <option key={device.deviceId || idx} value={device.deviceId}>
                          {device.label || `Saída de Áudio ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* REAL LIVE MIC TEST */}
              <div className="bg-gradient-to-br from-[#121520] to-[#171a2a] p-4 sm:p-5 rounded-2xl border border-indigo-500/20 space-y-4 shadow-md">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Mic className={`w-4 h-4 ${micTesting ? 'text-emerald-400 animate-pulse' : 'text-indigo-400'}`} />
                      <span className="text-xs font-bold text-white">Teste de Microfone em Tempo Real</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Fale no microfone para ver a barra de volume reagir instantaneamente à sua voz.
                    </p>
                  </div>

                  <button
                    id="btn-toggle-mic-test"
                    onClick={() => {
                      if (micTesting) {
                        stopMicTest();
                      } else {
                        startMicTest();
                      }
                    }}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer shrink-0 ${
                      micTesting
                        ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-500/20'
                        : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-emerald-500/20'
                    }`}
                  >
                    {micTesting ? <Square className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                    <span>{micTesting ? 'Parar Teste' : 'Testar Microfone'}</span>
                  </button>
                </div>

                {/* Error Banner if mic blocked */}
                {micError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{micError}</span>
                  </div>
                )}

                {/* Reactive VU Volume Meter */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                    <span>Nível de Entrada de Voz (VU Meter)</span>
                    <span className={`font-mono ${micVolumeLevel > 70 ? 'text-amber-400' : micVolumeLevel > 20 ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {micTesting ? `${micVolumeLevel}%` : 'Inativo'}
                    </span>
                  </div>

                  <div className="w-full h-3.5 bg-[#090b10] rounded-full overflow-hidden p-0.5 border border-white/[0.08] relative">
                    <div className="absolute inset-0 flex justify-between px-2 items-center pointer-events-none opacity-20">
                      <div className="w-0.5 h-2 bg-white" />
                      <div className="w-0.5 h-2 bg-white" />
                      <div className="w-0.5 h-2 bg-white" />
                      <div className="w-0.5 h-2 bg-white" />
                    </div>

                    <div
                      className="h-full rounded-full transition-all duration-75 ease-out"
                      style={{
                        width: `${micVolumeLevel}%`,
                        background:
                          micVolumeLevel > 80
                            ? 'linear-gradient(to right, #10b981, #f59e0b, #ef4444)'
                            : micVolumeLevel > 50
                            ? 'linear-gradient(to right, #10b981, #f59e0b)'
                            : 'linear-gradient(to right, #6366f1, #10b981)',
                      }}
                    />
                  </div>
                </div>

                {/* Mic Monitoring / Return voice Toggle */}
                <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-indigo-400" />
                    <div>
                      <span className="text-xs font-bold text-white block">Ouvir Retorno da Minha Voz (Mic Monitoring)</span>
                      <span className="text-[11px] text-slate-400 block">
                        Reproduz o som capturado no seu fone para verificar a clareza e o tom.
                      </span>
                    </div>
                  </div>

                  <button
                    id="btn-toggle-mic-loopback"
                    onClick={toggleMicLoopback}
                    disabled={!micTesting}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                      micLoopback
                        ? 'bg-indigo-600 text-white shadow-md'
                        : 'bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10'
                    }`}
                  >
                    {micLoopback ? '✓ Retorno Ativo' : 'Ativar Retorno'}
                  </button>
                </div>
              </div>

              {/* REAL LIVE AUDIO OUTPUT TEST */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                    <Volume2 className={`w-5 h-5 ${isTestingAudioOutput ? 'animate-bounce text-emerald-400' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">Teste de Saída de Áudio (Fones/Caixas)</h4>
                    <p className="text-[11px] text-slate-400 font-normal">
                      Toca um acorde estéreo em alta fidelidade para verificar o volume dos seus fones.
                    </p>
                  </div>
                </div>

                <button
                  id="btn-test-sound-output"
                  onClick={handleTestAudioOutput}
                  disabled={isTestingAudioOutput}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{isTestingAudioOutput ? 'Tocando Som...' : 'Testar Saída'}</span>
                </button>
              </div>

              {/* Advanced DSP Processing Toggles */}
              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3 shadow-md">
                <span className="text-xs font-bold text-white block">Processamento de Áudio WebRTC & IA</span>

                <div className="space-y-2 text-xs">
                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-xl hover:bg-white/[0.02]">
                    <div>
                      <span className="text-slate-200 font-medium block">Cancelamento de Eco Acústico</span>
                      <span className="text-[11px] text-slate-400">Evita que o áudio das caixas de som retorne ao microfone.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={echoCancellation}
                      onChange={(e) => setEchoCancellation(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-xl hover:bg-white/[0.02]">
                    <div>
                      <span className="text-slate-200 font-medium block">Supressão de Ruído de Fundo (RNNoise)</span>
                      <span className="text-[11px] text-slate-400">Filtra sons de digitação, ventiladores e ruídos contínuos.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={noiseSuppression}
                      onChange={(e) => setNoiseSuppression(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between cursor-pointer p-1.5 rounded-xl hover:bg-white/[0.02]">
                    <div>
                      <span className="text-slate-200 font-medium block">Controle Automático de Ganho (AGC)</span>
                      <span className="text-[11px] text-slate-400">Normaliza automaticamente o volume da sua voz.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoGainControl}
                      onChange={(e) => setAutoGainControl(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Save Voice Configuration Button */}
              <div className="pt-2 flex justify-end">
                <button
                  id="btn-save-voice-settings"
                  onClick={handleSaveProfile}
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-lg shadow-emerald-500/20 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Salvar Preferências de Áudio & PTT</span>
                </button>
              </div>
            </div>
          )}

          {/* ===================== E2EE TAB ===================== */}
          {activeTab === 'e2ee' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Criptografia de Ponta a Ponta (E2EE)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Chaves de segurança criptográficas locais derivadas no seu navegador.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-emerald-500/20 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                    <Lock className="w-4 h-4" />
                    <span>Sua Impressão Digital de Segurança (Fingerprint)</span>
                  </span>

                  <button
                    onClick={handleCopyFingerprint}
                    className="flex items-center gap-1.5 text-xs text-slate-300 bg-[#141722] hover:bg-white/[0.08] px-3 py-1.5 rounded-xl transition-colors border border-white/[0.06] cursor-pointer"
                  >
                    {copiedFingerprint ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedFingerprint ? 'Copiado!' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="font-mono text-xs tracking-widest text-emerald-300 bg-[#090b10] p-3 rounded-xl border border-emerald-500/30 text-center select-all">
                  {fingerprint}
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed font-normal">
                  Compare estes números com seus amigos em conversas seguras para verificar a integridade da chave E2EE contra ataques de interceptação.
                </p>
              </div>
            </div>
          )}

          {/* ===================== NOTIFICATIONS TAB ===================== */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Notificações Push em Tempo Real</h3>
                <p className="text-xs text-slate-400 mt-0.5">Receba alertas no desktop e dispositivos móveis mesmo com o app em segundo plano.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">Notificações no Navegador</h4>
                    <p className="text-[11px] text-slate-400 font-normal">Permita notificações nativas do sistema operacional.</p>
                  </div>

                  <button
                    onClick={() => {
                      if (typeof Notification !== 'undefined') {
                        Notification.requestPermission();
                      }
                      soundEngine.playMention();
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                  >
                    Ativar Push
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ===================== STORAGE & OFFLINE TAB ===================== */}
          {activeTab === 'storage' && (
            <div className="space-y-6 max-w-xl">
              <div>
                <h3 className="text-lg font-black text-white tracking-tight">Armazenamento & Suporte Offline</h3>
                <p className="text-xs text-slate-400 mt-0.5">Gerenciamento do banco de dados local IndexedDB para leitura offline contínua.</p>
              </div>

              <div className="bg-[#121520] p-4 rounded-2xl border border-white/[0.06] space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white tracking-tight">Banco Local BrazaTalkDB</h4>
                    <p className="text-[11px] text-slate-400 font-normal">Mensagens, canais e arquivos em cache para acesso instantâneo.</p>
                  </div>
                  <span className="text-xs font-mono text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    Ativo & Sincronizado
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
