import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  PhoneOff,
  Download,
  Settings,
  Columns,
  Maximize2,
  MessageSquare,
  FileCode,
  Shield,
  Layers,
  ChevronDown,
  Menu,
  Play,
  BookOpen,
  Terminal,
  Bot,
  Cpu,
  AlertTriangle,
  X
} from 'lucide-react';
import {
  Channel,
  User,
  ProjectRoomState,
  ProjectFile,
  ProjectAgent,
  FilePresenceUser
} from '../../types';
import { projectService } from '../../services/projectService';
import { ProjectChat } from './ProjectChat';
import { ProjectWorkspaceEditor } from './ProjectWorkspaceEditor';
import { ProjectLLMSettingsModal } from './ProjectLLMSettingsModal';
import { ProjectAgenticScreen } from './ProjectAgenticScreen';

export type ProjectRoomTab = 'chat' | 'editor' | 'sandbox' | 'docs' | 'agents' | 'agentic';

interface ProjectWorkspaceProps {
  channel: Channel;
  currentUser: User;
  voiceParticipants: any[];
  currentVoiceChannelId: string | null;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  isMuted: boolean;
  isDeafened: boolean;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onToggleMobileNav?: () => void;
  onOpenManageChannel?: () => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  channel,
  currentUser,
  voiceParticipants,
  currentVoiceChannelId,
  onJoinVoice,
  onLeaveVoice,
  isMuted,
  isDeafened,
  onToggleMute,
  onToggleDeafen,
  onToggleMobileNav,
  onOpenManageChannel,
}) => {
  const [projectState, setProjectState] = useState<ProjectRoomState>(() =>
    projectService.sanitizeState(projectService.getDefaultProjectState(channel.id, channel.name))
  );
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<ProjectRoomTab>('chat');
  const [isSideChatOpen, setIsSideChatOpen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [filePresence, setFilePresence] = useState<Record<string, FilePresenceUser[]>>({});

  // Join channel room for presence tracking
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('braza-send-ws', {
        detail: {
          type: 'join-channel',
          channelId: channel.id,
          userId: currentUser?.id,
          userName: currentUser?.name,
        },
      })
    );
  }, [channel.id, currentUser?.id, currentUser?.name]);

  // Real-time file presence sync listener
  useEffect(() => {
    const handlePresenceSync = (e: any) => {
      const detail = e.detail;
      if (!detail || detail.channelId !== channel.id) return;
      setFilePresence(detail.presence || {});
    };

    window.addEventListener('braza-file-presence-sync', handlePresenceSync);
    return () => window.removeEventListener('braza-file-presence-sync', handlePresenceSync);
  }, [channel.id]);

  // Load project state from Firestore / local storage on channel change and poll server runner status
  useEffect(() => {
    projectService.loadProjectState(channel.id, channel.name).then(async (state) => {
      // Pull any background active runner state from server
      const runnerStatus = await projectService.getPlanStatus(channel.id);
      if (runnerStatus && runnerStatus.plan) {
        state = {
          ...state,
          actionPlan: runnerStatus.plan,
          agenticActivities: runnerStatus.activities || state.agenticActivities,
          interAgentDialogues: runnerStatus.dialogues || state.interAgentDialogues,
          pendingUserQuestion: runnerStatus.pendingQuestion !== undefined ? runnerStatus.pendingQuestion : state.pendingUserQuestion,
          files: runnerStatus.projectState?.files || state.files,
        };
      }
      setProjectState(state);
      if (state.files.length > 0) {
        setActiveFileId(state.activeFileId || state.files[0].id);
      }
    });
  }, [channel.id]);

  // Real-time Firestore listener for files inside this project room
  useEffect(() => {
    const unsubscribe = projectService.subscribeToProjectFiles(channel.id, (remoteFiles) => {
      if (Array.isArray(remoteFiles) && remoteFiles.length > 0) {
        setProjectState((prev) => ({
          ...prev,
          files: remoteFiles,
          activeFileId:
            prev.activeFileId && remoteFiles.some((f) => f.id === prev.activeFileId)
              ? prev.activeFileId
              : remoteFiles[0]?.id || '',
        }));
      }
    });

    return () => unsubscribe();
  }, [channel.id]);

  // Real-time broadcast listener from WebSocket for background agent execution
  useEffect(() => {
    const handlePlanUpdate = async (e: any) => {
      const detail = e.detail;
      if (!detail || detail.channelId !== channel.id) return;
      
      const runnerFiles = detail.projectState?.files;
      if (Array.isArray(runnerFiles) && runnerFiles.length > 0) {
        for (const rf of runnerFiles) {
          await projectService.saveProjectFile(channel.id, rf, undefined, { name: 'Swarm IA' }).catch(() => {});
        }
      }

      setProjectState((prev) => ({
        ...prev,
        actionPlan: detail.plan || prev.actionPlan,
        agenticActivities: detail.activities || prev.agenticActivities,
        interAgentDialogues: detail.dialogues || prev.interAgentDialogues,
        pendingUserQuestion: detail.pendingQuestion !== undefined ? detail.pendingQuestion : prev.pendingUserQuestion,
        files: detail.projectState?.files || prev.files,
        testConsoleLogs: detail.projectState?.testConsoleLogs || prev.testConsoleLogs,
      }));
    };

    window.addEventListener('braza-project-plan-updated', handlePlanUpdate);
    return () => window.removeEventListener('braza-project-plan-updated', handlePlanUpdate);
  }, [channel.id]);

  // Voice state
  const isUserInProjectVoice = currentVoiceChannelId === channel.id;
  const projectVoiceParticipants = voiceParticipants.filter((p) => p.channelId === channel.id);

  const handleUpdateState = (partial: Partial<ProjectRoomState>) => {
    setProjectState((prev) => {
      const updated = { ...prev, ...partial };
      projectService.saveProjectState(channel.id, updated).catch(() => {});
      return updated;
    });
  };

  const handleSendMessage = async (text: string, mentionedAgentHandle?: string) => {
    setIsAiLoading(true);

    try {
      const sanitizedState = projectService.sanitizeState(projectState);
      if (sanitizedState.selectedModel !== projectState.selectedModel) {
        handleUpdateState({ selectedModel: sanitizedState.selectedModel });
      }

      const result = await projectService.generateResponse({
        prompt: text,
        mentionedAgentHandle,
        projectState: sanitizedState,
        conversationHistory: [],
      });

      if (result.success) {
        // If files were created or updated, merge them into project files!
        if (Array.isArray(result.files) && result.files.length > 0) {
          const currentFiles = [...projectState.files];
          for (const newFile of result.files) {
            const existingIdx = currentFiles.findIndex(
              (f) => f.name.toLowerCase() === newFile.name.toLowerCase()
            );
            const existingFile = existingIdx >= 0 ? currentFiles[existingIdx] : undefined;
            const fileToSave: ProjectFile = existingFile
              ? {
                  ...existingFile,
                  content: newFile.content,
                  language: newFile.language || existingFile.language,
                  description: newFile.description || existingFile.description,
                  updatedAt: Date.now(),
                  version: (existingFile.version || 1) + 1,
                  updatedBy: result.agent?.name || 'Agente IA',
                }
              : newFile;

            await projectService.saveProjectFile(
              channel.id,
              fileToSave,
              existingFile?.version,
              currentUser || { name: result.agent?.name || 'Agente IA' }
            );

            if (existingIdx >= 0) {
              currentFiles[existingIdx] = fileToSave;
            } else {
              currentFiles.push(fileToSave);
            }
          }

          handleUpdateState({
            files: currentFiles,
            activeFileId: result.files[0].id,
          });
          setActiveFileId(result.files[0].id);
        }

        // Add message to chat via global helper
        if ((window as any).__brazaAddProjectAgentMsg) {
          (window as any).__brazaAddProjectAgentMsg(
            result.reply,
            result.agent,
            result.files,
            result.testRecommendation
          );
        }
      } else {
        throw new Error(result.reply || 'Falha ao processar comando com IA.');
      }
    } catch (err: any) {
      console.error('Project send error:', err);
      throw err;
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleDownloadZip = async () => {
    setIsZipping(true);
    try {
      await projectService.downloadProjectAsZip(projectState);
    } catch (err) {
      console.error('Download zip error:', err);
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div id="braza-project-workspace" className="h-full flex flex-col bg-[#0b0d14] select-none min-w-0 overflow-hidden">
      {/* 1. TOP HEADER & INTEGRATED CONTROLS */}
      <div className="h-14 border-b border-white/[0.08] bg-[#090b10] px-2.5 sm:px-4 flex items-center justify-between shrink-0 shadow-md gap-2">
        {/* Left: Mobile Drawer Hamburger + Project Channel Details */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onToggleMobileNav && (
            <button
              type="button"
              onClick={onToggleMobileNav}
              aria-label="Abrir canais e servidores"
              className="md:hidden p-2 -ml-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors shrink-0 cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20 shrink-0">
            <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-sm font-black text-white tracking-tight truncate max-w-[110px] sm:max-w-[200px]">
                #{channel.name}
              </h1>
              <span className="text-[9px] sm:text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
                {projectState.gameEngine}
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 truncate max-w-[130px] sm:max-w-xs hidden xs:block">
              {projectState.projectName}
            </p>
          </div>
        </div>

        {/* Center: Integrated Project Voice Controls (Desktop) */}
        <div className="hidden lg:flex items-center gap-2 bg-[#121520] border border-white/[0.06] px-3 py-1.5 rounded-2xl">
          <div className="flex items-center gap-1.5 mr-2">
            <div className="relative">
              <Volume2 className="w-4 h-4 text-emerald-400" />
              {projectVoiceParticipants.length > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              )}
            </div>
            <span className="text-xs font-bold text-slate-200">
              Voz do Projeto ({projectVoiceParticipants.length})
            </span>
          </div>

          {/* Participant Avatars */}
          <div className="flex items-center -space-x-2 mr-2">
            {projectVoiceParticipants.map((p) => (
              <img
                key={p.userId}
                src={p.userAvatar}
                alt={p.userName}
                title={`${p.userName} ${p.isSpeaking ? '(Falando)' : ''}`}
                className={`w-6 h-6 rounded-full object-cover ring-2 transition-all ${
                  p.isSpeaking ? 'ring-emerald-400 scale-110 shadow-md' : 'ring-[#121520]'
                }`}
              />
            ))}
          </div>

          {/* Connect / Disconnect Buttons */}
          {isUserInProjectVoice ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onToggleMute}
                title={isMuted ? 'Desmutar Microfone' : 'Mutar Microfone'}
                className={`p-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  isMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/[0.08] text-white hover:bg-white/[0.12]'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
              </button>

              <button
                type="button"
                onClick={onToggleDeafen}
                title={isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
                className={`p-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                  isDeafened ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/[0.08] text-white hover:bg-white/[0.12]'
                }`}
              >
                {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>

              <button
                type="button"
                onClick={onLeaveVoice}
                title="Sair da chamada de voz"
                className="p-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm"
              >
                <PhoneOff className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onJoinVoice(channel.id)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Entrar na Voz</span>
            </button>
          )}
        </div>

        {/* Right: LLM Provider, Zip Download & Mobile Voice Quick Button */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Mobile Voice Quick Join Button */}
          <div className="lg:hidden flex items-center">
            {isUserInProjectVoice ? (
              <button
                type="button"
                onClick={onToggleMute}
                className={`flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  isMuted
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
                title={isMuted ? 'Microfone Mutado' : 'Microfone Ativo'}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span className="text-[11px] hidden xs:inline">{isMuted ? 'Mutado' : 'Voz'}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onJoinVoice(channel.id)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                title="Entrar na sala de voz do projeto"
              >
                <Mic className="w-3.5 h-3.5" />
                <span className="text-[11px] hidden xs:inline">Voz</span>
              </button>
            )}
          </div>

          {/* Active LLM Model Badge & Quick Selector */}
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            title="Configurar LLMs & Chaves de API (BYOK)"
            className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl bg-[#141724] border border-white/[0.08] hover:border-indigo-500/40 text-xs font-bold text-slate-200 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="truncate max-w-[80px] sm:max-w-[110px] capitalize hidden sm:inline">
              {projectState.selectedProvider}
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Swarm & Tela Agêntica Quick Access Button */}
          <button
            type="button"
            onClick={() => setActiveTab('agentic')}
            title="Abrir Tela Agêntica e Swarm de Desenvolvimento Autônomo"
            className={`flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'agentic'
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200 shadow-md shadow-cyan-500/10 ring-1 ring-cyan-500/30'
                : projectState.actionPlan?.status === 'running'
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-md shadow-emerald-500/10'
                : projectState.pendingUserQuestion
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse'
                : 'bg-[#141724] border-white/[0.08] hover:border-cyan-500/40 text-cyan-300'
            }`}
          >
            <Cpu
              className={`w-3.5 h-3.5 ${
                projectState.actionPlan?.status === 'running' ? 'text-emerald-400 animate-spin' : 'text-cyan-400'
              }`}
            />
            <span className="hidden sm:inline">
              {projectState.actionPlan?.status === 'running'
                ? 'Swarm Ativo'
                : projectState.pendingUserQuestion
                ? 'Dúvida Agente!'
                : 'Swarm IA'}
            </span>
            {projectState.actionPlan?.status === 'running' && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            )}
            {projectState.pendingUserQuestion && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
            )}
          </button>

          {/* Download Mod ZIP */}
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={isZipping}
            title="Baixar pacote do mod (.ZIP)"
            className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all cursor-pointer shadow-md shadow-indigo-600/30"
          >
            <Download className={`w-3.5 h-3.5 ${isZipping ? 'animate-bounce' : ''}`} />
            <span className="hidden sm:inline">{isZipping ? 'Compactando...' : 'Baixar ZIP'}</span>
          </button>

          {/* Manage Project Channel Button */}
          {onOpenManageChannel && (
            <button
              id="btn-project-manage-channel"
              type="button"
              onClick={onOpenManageChannel}
              title="Gerenciar Sala (Renomear / Excluir)"
              className="flex items-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-[#141724] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold transition-all cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Gerenciar</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. UNIFIED WORKSPACE TAB NAVIGATION BAR (Responsive & Desktop) */}
      <div className="h-11 border-b border-white/[0.08] bg-[#090b11] px-2 sm:px-4 flex items-center justify-between shrink-0 select-none overflow-x-auto">
        <div className="flex items-center gap-1 sm:gap-1.5 min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'editor'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Código</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'editor' ? 'bg-white/20 text-white' : 'bg-white/[0.08] text-slate-400'
            }`}>
              {projectState.files.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sandbox'
                ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sandbox</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('docs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'docs'
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Docs RAG</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              activeTab === 'docs' ? 'bg-white/20 text-white' : 'bg-white/[0.08] text-slate-400'
            }`}>
              {projectState.ragDocs.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-pink-600 text-white shadow-sm shadow-pink-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-pink-400" />
            <span>Agentes ({projectState.agents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agentic')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
              activeTab === 'agentic'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.05] bg-indigo-500/10 border border-indigo-500/20'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Swarm IA</span>
            {projectState.actionPlan?.status === 'running' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
            )}
            {projectState.pendingUserQuestion && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </div>

        {/* Right Controls in Tab Bar (Desktop: Side Chat Toggle) */}
        <div className="hidden lg:flex items-center gap-2 pl-3 shrink-0">
          {activeTab !== 'chat' && (
            <button
              type="button"
              onClick={() => setIsSideChatOpen(!isSideChatOpen)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isSideChatOpen
                  ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
                  : 'bg-[#141724] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.05]'
              }`}
              title={isSideChatOpen ? 'Fechar Chat Lateral Dividido' : 'Abrir Chat Lateral Dividido ao lado'}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>{isSideChatOpen ? 'Ocultar Chat' : 'Chat Lateral'}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. MOBILE VOICE STATUS RIBBON (Only on mobile when connected in voice) */}
      {isUserInProjectVoice && (
        <div className="lg:hidden bg-emerald-950/50 border-b border-emerald-500/20 px-3 py-1.5 flex items-center justify-between text-xs shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-emerald-300 font-semibold truncate text-[11px]">
              Voz do Projeto ({projectVoiceParticipants.length})
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onToggleMute}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                isMuted ? 'bg-rose-500/30 text-rose-300' : 'bg-emerald-500/30 text-emerald-200'
              }`}
            >
              {isMuted ? 'Mutado' : 'Microfone'}
            </button>

            <button
              type="button"
              onClick={onToggleDeafen}
              className={`p-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                isDeafened ? 'bg-amber-500/30 text-amber-300' : 'bg-white/[0.08] text-slate-300'
              }`}
              title={isDeafened ? 'Ativar Áudio' : 'Desativar Áudio'}
            >
              {isDeafened ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>

            <button
              type="button"
              onClick={onLeaveVoice}
              className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold transition-colors cursor-pointer"
            >
              Sair
            </button>
          </div>
        </div>
      )}

      {/* 4. MAIN WORKSPACE CONTENT: UNIFIED TAB CANVAS (100% spacious, no squished panels) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Main Tab View */}
        <div className="flex-1 h-full overflow-hidden flex flex-col min-w-0">
          {activeTab === 'chat' && (
            <ProjectChat
              projectState={projectState}
              currentUser={currentUser}
              onSelectFile={(fileId) => {
                setActiveFileId(fileId);
                setActiveTab('editor');
              }}
              onDownloadFile={(file) => projectService.downloadSingleFile(file)}
              onSendMessage={handleSendMessage}
              isLoading={isAiLoading}
            />
          )}

          {activeTab === 'editor' && (
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="files"
              hideHeader={true}
              channelId={channel.id}
              currentUser={currentUser}
              filePresence={filePresence}
            />
          )}

          {activeTab === 'sandbox' && (
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="sandbox"
              hideHeader={true}
              channelId={channel.id}
              currentUser={currentUser}
              filePresence={filePresence}
            />
          )}

          {activeTab === 'docs' && (
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="rag"
              hideHeader={true}
              channelId={channel.id}
              currentUser={currentUser}
              filePresence={filePresence}
            />
          )}

          {activeTab === 'agents' && (
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="agents"
              hideHeader={true}
              channelId={channel.id}
              currentUser={currentUser}
              filePresence={filePresence}
            />
          )}

          {activeTab === 'agentic' && (
            <ProjectAgenticScreen
              projectState={projectState}
              onUpdateState={handleUpdateState}
              onSelectFile={(fileId) => {
                setActiveFileId(fileId);
                setActiveTab('editor');
              }}
            />
          )}
        </div>

        {/* Optional Collapsible Side Chat (Desktop only, when isSideChatOpen is true and activeTab !== 'chat') */}
        {isSideChatOpen && activeTab !== 'chat' && (
          <div className="hidden lg:flex w-[380px] xl:w-[420px] h-full border-l border-white/[0.08] flex-col bg-[#0b0d14] shrink-0 z-10 shadow-2xl">
            <div className="h-10 px-3 bg-[#090b10] border-b border-white/[0.06] flex items-center justify-between shrink-0">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                Chat Lateral dos Agentes
              </span>
              <button
                type="button"
                onClick={() => setIsSideChatOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
                title="Fechar Chat Lateral"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              <ProjectChat
                projectState={projectState}
                currentUser={currentUser}
                onSelectFile={(fileId) => {
                  setActiveFileId(fileId);
                  setActiveTab('editor');
                }}
                onDownloadFile={(file) => projectService.downloadSingleFile(file)}
                onSendMessage={handleSendMessage}
                isLoading={isAiLoading}
              />
            </div>
          </div>
        )}
      </div>

      {/* 5. MOBILE BOTTOM NAVIGATION BAR (< lg) */}
      <div className="lg:hidden border-t border-white/[0.08] bg-[#090b11] px-1 py-1 flex items-center justify-around shrink-0 z-20 shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('chat')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'chat'
              ? 'text-indigo-400 bg-indigo-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[10px]">Chat</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('editor')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'editor'
              ? 'text-indigo-400 bg-indigo-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span className="text-[10px]">Código</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sandbox')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'sandbox'
              ? 'text-emerald-400 bg-emerald-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-4 h-4" />
          <span className="text-[10px]">Sandbox</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('docs')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'docs'
              ? 'text-amber-400 bg-amber-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[10px]">Docs</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agents')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            activeTab === 'agents'
              ? 'text-pink-400 bg-pink-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span className="text-[10px]">Agentes</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('agentic')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer relative ${
            activeTab === 'agentic'
              ? 'text-cyan-400 bg-cyan-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span className="text-[10px]">Swarm</span>
          {projectState.actionPlan?.status === 'running' && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute top-0.5 right-1" />
          )}
          {projectState.pendingUserQuestion && (
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute top-0.5 right-1" />
          )}
        </button>
      </div>

      {/* 6. LLM & API KEYS SETTINGS MODAL */}
      {showSettingsModal && (
        <ProjectLLMSettingsModal
          projectState={projectState}
          onUpdateState={handleUpdateState}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};
