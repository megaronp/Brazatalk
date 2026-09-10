import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Bot,
  Play,
  Pause,
  Plus,
  CheckCircle2,
  Clock,
  HelpCircle,
  Shield,
  Layers,
  ArrowRight,
  Send,
  RefreshCw,
  MessageSquare,
  FileCode,
  Check,
  AlertTriangle,
  Cpu,
  Zap,
  Activity
} from 'lucide-react';
import {
  ProjectRoomState,
  ProjectActionPlan,
  ProjectPlanStep,
  InterAgentMessage,
  ProjectAgent,
  ProjectPendingQuestion
} from '../../types';
import { projectService } from '../../services/projectService';

interface ProjectAgenticScreenProps {
  projectState: ProjectRoomState;
  onUpdateState: (partial: Partial<ProjectRoomState>) => void;
  onSelectFile?: (fileId: string) => void;
}

export const ProjectAgenticScreen: React.FC<ProjectAgenticScreenProps> = ({
  projectState,
  onUpdateState,
  onSelectFile,
}) => {
  const plan = projectState.actionPlan;
  const isRunning = plan?.status === 'running';
  const isWaitingUser = plan?.status === 'waiting_user' || !!projectState.pendingUserQuestion;
  const isCompleted = plan?.status === 'completed';
  const isPaused = plan?.status === 'paused';

  const [customAnswer, setCustomAnswer] = useState('');
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [newPlanGoal, setNewPlanGoal] = useState('');
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const dialogueEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [projectState.interAgentDialogues?.length]);

  // Calculate progress
  const totalSteps = plan?.steps.length || 0;
  const completedSteps = plan?.steps.filter((s) => s.status === 'completed').length || 0;
  const progressPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;

  // Handlers for Plan Execution
  const handleStartOrResumePlan = async () => {
    if (!plan) return;
    setActionError(null);
    try {
      const updatedPlan: ProjectActionPlan = {
        ...plan,
        status: 'running',
        updatedAt: Date.now(),
      };
      onUpdateState({ actionPlan: updatedPlan });
      await projectService.startPlan(projectState.channelId, updatedPlan, projectState);
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao iniciar plano.');
    }
  };

  const handlePausePlan = async () => {
    setActionError(null);
    try {
      if (plan) {
        onUpdateState({ actionPlan: { ...plan, status: 'paused' } });
      }
      await projectService.pausePlan(projectState.channelId);
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao pausar plano.');
    }
  };

  const handleAnswerQuestion = async (answerText: string) => {
    if (!answerText.trim() || isSubmittingAnswer) return;
    setIsSubmittingAnswer(true);
    setActionError(null);
    try {
      const stepId = projectState.pendingUserQuestion?.stepId || plan?.steps[plan?.currentStepIndex || 0]?.id || '';
      await projectService.answerPlanQuestion(projectState.channelId, stepId, answerText);
      setCustomAnswer('');
      onUpdateState({ pendingUserQuestion: null });
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao responder dúvida.');
    } finally {
      setIsSubmittingAnswer(false);
    }
  };

  const handleGenerateNewPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanGoal.trim() || isGeneratingPlan) return;
    setIsGeneratingPlan(true);
    setActionError(null);
    try {
      const generated = await projectService.generatePlan(
        projectState.channelId,
        newPlanGoal.trim(),
        projectState
      );
      onUpdateState({ actionPlan: generated, pendingUserQuestion: null });
      setShowNewPlanModal(false);
      setNewPlanGoal('');
    } catch (err: any) {
      setActionError(err?.message || 'Erro ao gerar novo plano.');
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const agentsList: ProjectAgent[] = projectState.agents || [];
  const dialogues = projectState.interAgentDialogues || [];

  return (
    <div id="project-agentic-screen" className="h-full flex flex-col bg-[#0b0d14] overflow-y-auto text-slate-200 select-none">
      {/* 1. TOP LIVE STATUS HERO BANNER */}
      <div className="p-4 sm:p-5 border-b border-white/[0.08] bg-gradient-to-r from-[#0d101d] via-[#101426] to-[#0c0f1c] shrink-0">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0 shadow-lg shadow-indigo-600/20 mt-0.5">
              <Cpu className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Tela Agêntica & Swarm de Desenvolvimento
                </h2>
                {isRunning && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-sm animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Executando em 2º Plano (Continua mesmo fora da sala)
                  </span>
                )}
                {isWaitingUser && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-400 shadow-sm">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Aguardando Decisão da Equipe
                  </span>
                )}
                {isPaused && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-500/15 border border-slate-500/30 text-slate-400">
                    <Clock className="w-3.5 h-3.5" />
                    Pausado
                  </span>
                )}
                {isCompleted && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Plano Concluído
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Os agentes trabalham de forma autônoma e colaborativa. Se você trocar de aba ou sair da sala, o processo continua ativo no servidor. Caso surja alguma dúvida crítica, o agente pausa e aguarda sua orientação.
              </p>
            </div>
          </div>

          {/* Quick Execution Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {isRunning ? (
              <button
                type="button"
                onClick={handlePausePlan}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>Pausar</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartOrResumePlan}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md shadow-emerald-600/30 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{completedSteps > 0 && !isCompleted ? 'Continuar Execução' : 'Executar Plano em 2º Plano'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowNewPlanModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-300 hover:text-white text-xs font-bold border border-white/[0.08] transition-all cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gerar Novo Plano com IA</span>
            </button>
          </div>
        </div>

        {/* Action Error alert if any */}
        {actionError && (
          <div className="mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}

        {/* Progress bar */}
        {plan && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center gap-3">
            <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
              Progresso do Mod: {completedSteps}/{totalSteps} passos ({progressPercent}%)
            </span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 2. PENDING USER QUESTION CALLOUT (CRITICAL SAFEGUARD) */}
      {isWaitingUser && projectState.pendingUserQuestion && (
        <div className="m-4 p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/40 shadow-xl shadow-amber-500/10 animate-in fade-in">
          <div className="flex items-start gap-3.5">
            <img
              src={projectState.pendingUserQuestion.agentAvatar}
              alt={projectState.pendingUserQuestion.agentName}
              className="w-10 h-10 rounded-xl object-cover ring-2 ring-amber-400/50 shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-xs font-black text-amber-300">
                  {projectState.pendingUserQuestion.agentName}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {projectState.pendingUserQuestion.agentHandle}
                </span>
                <span className="text-[10px] text-amber-400/80 font-bold uppercase tracking-wider">
                  Dúvida Técnica do Agente
                </span>
              </div>

              <p className="text-sm font-semibold text-white leading-relaxed mb-3">
                "{projectState.pendingUserQuestion.question}"
              </p>

              {/* Quick option buttons if available */}
              {projectState.pendingUserQuestion.suggestedOptions && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {projectState.pendingUserQuestion.suggestedOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={isSubmittingAnswer}
                      onClick={() => handleAnswerQuestion(opt)}
                      className="text-xs bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 hover:text-white px-3 py-1.5 rounded-xl border border-amber-500/30 transition-all font-semibold cursor-pointer active:scale-95"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Free text custom answer input */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={customAnswer}
                  onChange={(e) => setCustomAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAnswerQuestion(customAnswer);
                    }
                  }}
                  placeholder="Ou digite sua instrução personalizada para o agente..."
                  className="flex-1 bg-[#090b10] border border-amber-500/30 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={!customAnswer.trim() || isSubmittingAnswer}
                  onClick={() => handleAnswerQuestion(customAnswer)}
                  className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs transition-all shadow-md cursor-pointer shrink-0"
                >
                  {isSubmittingAnswer ? 'Retomando...' : 'Responder & Continuar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. AGENT SWARM CARDS (Visual state of each specialist) */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Equipe de Agentes Especialistas ({agentsList.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500">
            Trabalho coordenado com guardrails e consulta RAG
          </span>
        </div>

        {agentsList.length === 0 ? (
          <div className="p-4 rounded-2xl bg-[#121522] border border-white/[0.06] text-center">
            <p className="text-xs text-slate-300 font-medium mb-1">Nenhum agente configurado nesta sala ainda.</p>
            <p className="text-[11px] text-slate-500">
              Você pode adicionar agentes personalizados na aba "Agentes" do Workspace ou aplicar uma equipe sugerida nas configurações.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {agentsList.map((agent) => {
            const activity = projectState.agenticActivities?.[agent.handle];
            const status = activity?.status || 'idle';

            let statusColor = 'text-slate-400 bg-white/[0.04] border-white/[0.08]';
            let statusText = 'Aguardando';

            if (status === 'thinking') {
              statusColor = 'text-indigo-400 bg-indigo-500/10 border-indigo-500/30';
              statusText = 'Pensando...';
            } else if (status === 'coding') {
              statusColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 animate-pulse';
              statusText = 'Codificando';
            } else if (status === 'reviewing') {
              statusColor = 'text-pink-400 bg-pink-500/10 border-pink-500/30';
              statusText = 'Auditando Resmon';
            } else if (status === 'waiting_user') {
              statusColor = 'text-amber-400 bg-amber-500/10 border-amber-500/30';
              statusText = 'Aguardando Resposta';
            }

            return (
              <div
                key={agent.id}
                className="p-3.5 rounded-2xl bg-[#121522] border border-white/[0.08] hover:border-indigo-500/40 transition-all flex flex-col justify-between relative group"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={agent.avatar}
                        alt={agent.name}
                        className="w-8 h-8 rounded-xl object-cover ring-2 ring-white/10 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-black text-white truncate">{agent.name}</div>
                        <div className="text-[10px] font-mono" style={{ color: agent.color }}>
                          {agent.handle}
                        </div>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-400 line-clamp-2 mb-2.5">
                    {agent.role}
                  </p>
                </div>

                {/* Thought bubble or current task */}
                <div className="p-2 rounded-xl bg-[#090b10] border border-white/[0.04] text-[11px]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5 flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-400" />
                    <span>Status Atual:</span>
                  </div>
                  <p className="text-slate-300 italic truncate">
                    {activity?.thought || 'Pronto para colaborar no desenvolvimento.'}
                  </p>
                </div>
              </div>
            );
          })}
          </div>
        )}
      </div>

      {/* 4. MAIN SPLIT: INTERACTIVE ACTION PLAN & INTER-AGENT DIALOGUE */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden">
        {/* Left Column: Action Plan Steps */}
        <div className="flex-1 p-4 overflow-y-auto border-b lg:border-b-0 lg:border-r border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Plano de Ação Sequencial
              </h3>
            </div>
            {plan?.goal && (
              <span className="text-[11px] text-slate-400 truncate max-w-xs" title={plan.goal}>
                Alvo: <span className="text-white font-semibold">{plan.goal}</span>
              </span>
            )}
          </div>

          {!plan || plan.steps.length === 0 ? (
            <div className="p-8 text-center bg-[#10131e] rounded-2xl border border-white/[0.06]">
              <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-2 opacity-60" />
              <p className="text-xs text-slate-400 mb-3">Nenhum plano de ação definido ainda.</p>
              <button
                type="button"
                onClick={() => setShowNewPlanModal(true)}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
              >
                Criar Plano com IA
              </button>
            </div>
          ) : (
            plan.steps.map((step, idx) => {
              const isCurrent = plan.currentStepIndex === idx && plan.status === 'running';
              const isStepWaiting = step.status === 'waiting_user_input';
              const isStepDone = step.status === 'completed';

              const assignedAgent = agentsList.find(
                (a) => a.handle.toLowerCase() === step.assignedAgentHandle.toLowerCase()
              ) || agentsList[0];

              return (
                <div
                  key={step.id}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    isStepWaiting
                      ? 'bg-amber-500/10 border-amber-500/40 shadow-md shadow-amber-500/10'
                      : isCurrent
                      ? 'bg-indigo-600/10 border-indigo-500/40 shadow-md shadow-indigo-600/10'
                      : isStepDone
                      ? 'bg-[#10131e] border-white/[0.06] opacity-90'
                      : 'bg-[#0f111a] border-white/[0.04]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      {/* Step index badge */}
                      <div
                        className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 mt-0.5 ${
                          isStepDone
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isStepWaiting
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                            : isCurrent
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 animate-pulse'
                            : 'bg-white/[0.06] text-slate-400'
                        }`}
                      >
                        {isStepDone ? <Check className="w-4 h-4" /> : step.order}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs font-bold text-white tracking-tight">
                            {step.title}
                          </h4>
                          {assignedAgent && (
                            <span
                              className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border"
                              style={{
                                backgroundColor: `${assignedAgent.color}15`,
                                borderColor: `${assignedAgent.color}30`,
                                color: assignedAgent.color,
                              }}
                            >
                              {assignedAgent.handle}
                            </span>
                          )}
                        </div>

                        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                          {step.description}
                        </p>

                        {/* Files touched by step */}
                        {step.filesTouched && step.filesTouched.length > 0 && (
                          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold text-slate-500">Arquivos:</span>
                            {step.filesTouched.map((fn, fIdx) => (
                              <button
                                key={fIdx}
                                type="button"
                                onClick={() => {
                                  const match = projectState.files.find((f) => f.name === fn);
                                  if (match && onSelectFile) onSelectFile(match.id);
                                }}
                                className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.04] hover:bg-indigo-500/20 text-indigo-300 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
                              >
                                <FileCode className="w-3 h-3" />
                                <span>{fn}</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Recorded user decision */}
                        {step.userAnswer && (
                          <div className="mt-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300">
                            <span className="font-bold">Decisão da equipe aplicada:</span> "{step.userAnswer}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isStepDone && (
                        <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          Concluído
                        </span>
                      )}
                      {isCurrent && (
                        <span className="text-[10px] font-bold text-indigo-400 px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 animate-pulse">
                          Desenvolvendo...
                        </span>
                      )}
                      {isStepWaiting && (
                        <span className="text-[10px] font-bold text-amber-400 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                          Aguardando
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Live Inter-Agent Dialogue Feed */}
        <div className="w-full lg:w-[48%] flex flex-col bg-[#080a0f] overflow-hidden">
          <div className="p-3 border-b border-white/[0.06] bg-[#0c0e17] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-pink-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Diálogo Inter-Agentes em Tempo Real
              </h3>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              {dialogues.length} interações registradas
            </span>
          </div>

          <div className="flex-1 p-3.5 overflow-y-auto space-y-3 font-sans">
            {dialogues.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                Nenhum diálogo registrado ainda. Inicie o plano de ação para ver os agentes debatendo e coordenando tarefas.
              </div>
            ) : (
              dialogues.map((dlg) => (
                <div
                  key={dlg.id}
                  className="p-3 rounded-2xl bg-[#111420] border border-white/[0.06] text-xs leading-relaxed animate-in fade-in"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={dlg.senderAvatar}
                        alt={dlg.senderName}
                        className="w-6 h-6 rounded-lg object-cover ring-1 ring-white/10 shrink-0"
                      />
                      <span className="font-bold text-white text-xs truncate">{dlg.senderName}</span>
                      <span
                        className="font-mono text-[10px] px-1.5 py-0.2 rounded"
                        style={{ backgroundColor: `${dlg.senderColor}20`, color: dlg.senderColor }}
                      >
                        {dlg.senderHandle}
                      </span>
                    </div>

                    <span className="text-[10px] text-slate-500 shrink-0 font-mono">
                      {new Date(dlg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <p className="text-slate-200 whitespace-pre-wrap">{dlg.content}</p>
                </div>
              ))
            )}
            <div ref={dialogueEndRef} />
          </div>
        </div>
      </div>

      {/* 5. MODAL: GENERATE NEW ACTION PLAN WITH AI */}
      {showNewPlanModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#121524] border border-white/10 rounded-2xl w-full max-w-lg p-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">Gerar Plano de Ação Inteligente</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewPlanModal(false)}
                className="text-slate-400 hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleGenerateNewPlan} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Qual funcionalidade ou sistema você deseja desenvolver no mod?
                </label>
                <textarea
                  rows={3}
                  value={newPlanGoal}
                  onChange={(e) => setNewPlanGoal(e.target.value)}
                  placeholder="Ex: Criar sistema de concessionária completa com NUI, compra parcelada, salvamento no banco de dados e spawn com prevenção de roubo..."
                  className="w-full bg-[#090b10] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  required
                />
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300 space-y-1">
                <p className="font-bold">O que acontecerá ao gerar:</p>
                <p>• O agente @arquiteto dividirá a meta em 3 a 5 passos executáveis.</p>
                <p>• @scriptmaster, @balanceador e @auditor assumirão as tarefas correspondentes.</p>
                <p>• Você poderá iniciar a execução autônoma em segundo plano com 1 clique.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewPlanModal(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newPlanGoal.trim() || isGeneratingPlan}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-1.5"
                >
                  {isGeneratingPlan ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isGeneratingPlan ? 'Criando Plano...' : 'Gerar Plano com IA'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
