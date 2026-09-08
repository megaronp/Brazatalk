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
  AlertTriangle
} from 'lucide-react';
import {
  Channel,
  User,
  ProjectRoomState,
  ProjectFile,
  ProjectAgent
} from '../../types';
import { projectService } from '../../services/projectService';
import { ProjectChat } from './ProjectChat';
import { ProjectWorkspaceEditor } from './ProjectWorkspaceEditor';
import { ProjectLLMSettingsModal } from './ProjectLLMSettingsModal';
import { ProjectAgenticScreen } from './ProjectAgenticScreen';

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
}) => {
  const [projectState, setProjectState] = useState<ProjectRoomState>(() =>
    projectService.sanitizeState(projectService.getDefaultProjectState(channel.id, channel.name))
  );
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [layoutMode, setLayoutMode] = useState<'split' | 'chat' | 'workspace'>('split');
  const [desktopEditorTab, setDesktopEditorTab] = useState<'files' | 'sandbox' | 'rag' | 'agents' | 'agentic'>('agentic');
  const [mobileTab, setMobileTab] = useState<'chat' | 'editor' | 'sandbox' | 'docs' | 'agents' | 'agentic'>('agentic');
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

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

  // Real-time broadcast listener from WebSocket for background agent execution
  useEffect(() => {
    const handlePlanUpdate = (e: any) => {
      const detail = e.detail;
      if (!detail || detail.channelId !== channel.id) return;
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
          result.files.forEach((newFile: ProjectFile) => {
            const existingIdx = currentFiles.findIndex(
              (f) => f.name.toLowerCase() === newFile.name.toLowerCase()
            );
            if (existingIdx >= 0) {
              currentFiles[existingIdx] = {
                ...currentFiles[existingIdx],
                content: newFile.content,
                updatedAt: Date.now(),
                version: currentFiles[existingIdx].version + 1,
                updatedBy: result.agent?.name || 'Agente IA',
              };
            } else {
              currentFiles.push(newFile);
            }
          });

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
            onClick={() => {
              setLayoutMode('workspace');
              setDesktopEditorTab('agentic');
              setMobileTab('agentic');
            }}
            title="Abrir Tela Agêntica e Swarm de Desenvolvimento Autônomo"
            className={`flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
              projectState.actionPlan?.status === 'running'
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
                ? 'Swarm Ativo (2º Plano)'
                : projectState.pendingUserQuestion
                ? 'Dúvida Agente!'
                : 'Tela Agêntica'}
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

          {/* Desktop Layout Split Toggles (Hidden on Mobile) */}
          <div className="hidden lg:flex items-center bg-[#141724] border border-white/[0.08] p-0.5 rounded-xl">
            <button
              type="button"
              onClick={() => setLayoutMode('split')}
              title="Dividir Tela (Chat + Workspace)"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                layoutMode === 'split' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('chat')}
              title="Apenas Chat dos Agentes"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                layoutMode === 'chat' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('workspace')}
              title="Apenas Workspace & Sandbox"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                layoutMode === 'workspace' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. MOBILE VOICE STATUS RIBBON (Only on mobile when connected in voice) */}
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

      {/* 3. MAIN WORKSPACE CONTENT */}
      {/* MOBILE LAYOUT (< lg): Single Focused View with Fluid Switching */}
      <div className="lg:hidden flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {mobileTab === 'chat' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectChat
              projectState={projectState}
              currentUser={currentUser}
              onSelectFile={(fileId) => {
                setActiveFileId(fileId);
                setMobileTab('editor');
              }}
              onDownloadFile={(file) => projectService.downloadSingleFile(file)}
              onSendMessage={handleSendMessage}
              isLoading={isAiLoading}
            />
          </div>
        )}

        {mobileTab === 'editor' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="files"
            />
          </div>
        )}

        {mobileTab === 'sandbox' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="sandbox"
            />
          </div>
        )}

        {mobileTab === 'docs' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="rag"
            />
          </div>
        )}

        {mobileTab === 'agents' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab="agents"
            />
          </div>
        )}

        {mobileTab === 'agentic' && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectAgenticScreen
              projectState={projectState}
              onUpdateState={handleUpdateState}
              onSelectFile={(fileId) => {
                setActiveFileId(fileId);
                setMobileTab('editor');
              }}
            />
          </div>
        )}
      </div>

      {/* DESKTOP LAYOUT (>= lg): Split or Maximized Panels */}
      <div className="hidden lg:flex flex-1 overflow-hidden">
        {/* Left Side: Collaborative Chat & Agents */}
        {(layoutMode === 'split' || layoutMode === 'chat') && (
          <div
            className={`h-full ${
              layoutMode === 'split' ? 'w-[42%] shrink-0 border-r border-white/[0.08]' : 'w-full'
            }`}
          >
            <ProjectChat
              projectState={projectState}
              currentUser={currentUser}
              onSelectFile={(fileId) => {
                setActiveFileId(fileId);
                if (layoutMode === 'chat') setLayoutMode('split');
              }}
              onDownloadFile={(file) => projectService.downloadSingleFile(file)}
              onSendMessage={handleSendMessage}
              isLoading={isAiLoading}
            />
          </div>
        )}

        {/* Right Side: Virtual Workspace & Sandbox de Testes */}
        {(layoutMode === 'split' || layoutMode === 'workspace') && (
          <div className="flex-1 h-full overflow-hidden">
            <ProjectWorkspaceEditor
              projectState={projectState}
              onUpdateState={handleUpdateState}
              activeFileId={activeFileId}
              onSelectFile={setActiveFileId}
              currentTab={desktopEditorTab}
              onTabChange={setDesktopEditorTab}
            />
          </div>
        )}
      </div>

      {/* 4. MOBILE BOTTOM NAVIGATION BAR (< lg) */}
      <div className="lg:hidden border-t border-white/[0.08] bg-[#090b11] px-1 py-1 flex items-center justify-around shrink-0 z-20 shadow-lg">
        <button
          type="button"
          onClick={() => setMobileTab('chat')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            mobileTab === 'chat'
              ? 'text-indigo-400 bg-indigo-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span className="text-[10px]">Chat</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('editor')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            mobileTab === 'editor'
              ? 'text-indigo-400 bg-indigo-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileCode className="w-4 h-4" />
          <span className="text-[10px]">Código</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('sandbox')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            mobileTab === 'sandbox'
              ? 'text-emerald-400 bg-emerald-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Play className="w-4 h-4" />
          <span className="text-[10px]">Sandbox</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('docs')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            mobileTab === 'docs'
              ? 'text-amber-400 bg-amber-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="text-[10px]">Docs</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('agents')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer ${
            mobileTab === 'agents'
              ? 'text-pink-400 bg-pink-500/15 font-bold scale-105'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Bot className="w-4 h-4" />
          <span className="text-[10px]">Agentes</span>
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('agentic')}
          className={`flex flex-col items-center gap-1 py-1 px-2 rounded-xl transition-all cursor-pointer relative ${
            mobileTab === 'agentic'
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

      {/* 5. LLM & API KEYS SETTINGS MODAL */}
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
