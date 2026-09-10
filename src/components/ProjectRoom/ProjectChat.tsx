import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Bot,
  FileCode,
  Download,
  Eye,
  Play,
  CheckCircle2,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  Paperclip,
  Code2,
  AlertTriangle,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { ProjectRoomState, ProjectAgent, ProjectFile, User } from '../../types';
import { projectService } from '../../services/projectService';

interface ProjectMessage {
  id: string;
  senderType: 'user' | 'agent';
  authorName: string;
  authorAvatar?: string;
  authorHandle?: string;
  authorColor?: string;
  authorRole?: string;
  content: string;
  timestamp: number;
  files?: ProjectFile[];
  testRecommendation?: string;
}

interface ProjectChatProps {
  projectState: ProjectRoomState;
  currentUser: User;
  onSelectFile: (fileId: string) => void;
  onRunTestForFile?: (file: ProjectFile) => void;
  onDownloadFile: (file: ProjectFile) => void;
  onSendMessage: (text: string, mentionedAgentHandle?: string) => Promise<void>;
  isLoading: boolean;
}

export const ProjectChat: React.FC<ProjectChatProps> = ({
  projectState,
  currentUser,
  onSelectFile,
  onRunTestForFile,
  onDownloadFile,
  onSendMessage,
  isLoading,
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<ProjectMessage[]>([]);

  const [expandedSnippets, setExpandedSnippets] = useState<Record<string, boolean>>({});
  const [answeringQuestion, setAnsweringQuestion] = useState(false);
  const [chatQuestionAnswer, setChatQuestionAnswer] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const handleAnswerPlanQuestion = async (answerText: string) => {
    if (!answerText.trim() || answeringQuestion) return;
    setAnsweringQuestion(true);
    try {
      const stepId =
        projectState.pendingUserQuestion?.stepId ||
        projectState.actionPlan?.steps[projectState.actionPlan?.currentStepIndex || 0]?.id ||
        '';
      await projectService.answerPlanQuestion(projectState.channelId, stepId, answerText);
      setChatQuestionAnswer('');
    } catch (err) {
      console.error('Failed to answer plan question:', err);
    } finally {
      setAnsweringQuestion(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || isLoading) return;

    // Detect mentioned agent
    const mentionedAgent = projectState.agents.find((a) =>
      trimmed.toLowerCase().includes(a.handle.toLowerCase())
    );

    const userMsg: ProjectMessage = {
      id: `user-msg-${Date.now()}`,
      senderType: 'user',
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');

    try {
      await onSendMessage(trimmed, mentionedAgent?.handle);
    } catch (err: any) {
      const errorMsg: ProjectMessage = {
        id: `err-msg-${Date.now()}`,
        senderType: 'agent',
        authorName: 'Braza Sentinel',
        authorHandle: '@sentinel',
        authorAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=sentinel',
        authorColor: '#ef4444',
        authorRole: 'Sistema de Proteção e Monitoramento',
        content: `⚠️ Não foi possível processar a solicitação com o provedor ${projectState.selectedProvider}: ${err?.message || 'Erro de conexão'}. Verifique suas chaves de API.`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    }
  };

  // Called when agent responds from parent
  const addAgentResponse = (
    replyText: string,
    agent: ProjectAgent,
    createdFiles?: ProjectFile[],
    testRecommendation?: string
  ) => {
    const agentMsg: ProjectMessage = {
      id: `agent-msg-${Date.now()}`,
      senderType: 'agent',
      authorName: agent.name,
      authorHandle: agent.handle,
      authorAvatar: agent.avatar,
      authorColor: agent.color,
      authorRole: agent.role,
      content: replyText,
      timestamp: Date.now(),
      files: createdFiles,
      testRecommendation,
    };
    setMessages((prev) => [...prev, agentMsg]);
  };

  // Expose addAgentResponse via window or ref if needed
  (window as any).__brazaAddProjectAgentMsg = addAgentResponse;

  const toggleSnippet = (id: string) => {
    setExpandedSnippets((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleMentionAgent = (handle: string) => {
    if (inputText.includes(handle)) return;
    setInputText((prev) => `${handle} ${prev}`.trim());
  };

  return (
    <div id="project-chat-panel" className="h-full flex flex-col bg-[#0b0d14] border-r border-white/[0.06]">
      {/* Top Agents Mention Bar */}
      <div className="p-3 border-b border-white/[0.06] bg-[#0d1017] flex items-center justify-between gap-2 overflow-x-auto">
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
            Mencionar Agente:
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {projectState.agents.map((agent) => (
            <button
              type="button"
              key={agent.id}
              onClick={() => handleMentionAgent(agent.handle)}
              title={`${agent.name} - ${agent.role}`}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer hover:scale-105 shrink-0"
              style={{
                backgroundColor: `${agent.color}15`,
                borderColor: `${agent.color}40`,
                color: agent.color,
              }}
            >
              <img src={agent.avatar} alt={agent.name} className="w-3.5 h-3.5 rounded-full" />
              <span>{agent.handle}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 flex flex-col">
        {messages.length === 0 ? (
          <div className="m-auto flex flex-col items-center justify-center text-center p-6 select-none max-w-md">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-600/10">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">
              Sala de Projeto em Branco
            </h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              Esta sala foi iniciada limpa para você poder configurar livremente.
              Envie instruções ou dúvidas pelo chat abaixo para iniciar o trabalho colaborativo.
            </p>
            {projectState.agents && projectState.agents.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {projectState.agents.map((ag) => (
                  <button
                    key={ag.id}
                    type="button"
                    onClick={() => setInputText(`${ag.handle} `)}
                    className="px-2.5 py-1 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 hover:text-white text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="font-mono text-indigo-400 font-bold">{ag.handle}</span>
                    <span className="text-[11px] text-slate-400">{ag.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => {
            const isUser = msg.senderType === 'user';
            return (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} animate-in fade-in duration-150`}
              >
              {/* Avatar */}
              <div className="shrink-0 mt-0.5">
                <img
                  src={msg.authorAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${msg.authorName}`}
                  alt={msg.authorName}
                  className={`w-8 h-8 rounded-xl object-cover ring-1 ${
                    isUser ? 'ring-indigo-500/30' : 'ring-white/10'
                  }`}
                />
              </div>

              {/* Message Content Bubble */}
              <div className={`flex flex-col max-w-[85%] ${isUser ? 'items-end' : 'items-start'}`}>
                {/* Author Info */}
                <div className="flex items-center gap-2 mb-1 text-xs">
                  <span className="font-bold text-white tracking-tight">{msg.authorName}</span>
                  {msg.authorHandle && (
                    <span
                      className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded"
                      style={{
                        backgroundColor: `${msg.authorColor || '#6366f1'}20`,
                        color: msg.authorColor || '#a5b4fc',
                      }}
                    >
                      {msg.authorHandle}
                    </span>
                  )}
                  {msg.authorRole && (
                    <span className="text-[10px] text-slate-500 truncate max-w-[150px]">
                      {msg.authorRole}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600">
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Text body */}
                <div
                  className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                    isUser
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-[#141724] border border-white/[0.08] text-slate-200 rounded-tl-none'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {/* Artifacts / Files created cards */}
                {msg.files && msg.files.length > 0 && (
                  <div className="mt-2.5 w-full space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Arquivos Gerados / Atualizados no Workspace:</span>
                    </div>

                    {msg.files.map((file) => {
                      const isExpanded = expandedSnippets[file.id];
                      return (
                        <div
                          key={file.id}
                          className="bg-[#10131e] border border-white/[0.08] rounded-xl p-2.5 transition-all hover:border-indigo-500/40"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shrink-0">
                                <FileCode className="w-4 h-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate">{file.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {file.language.toUpperCase()} • {file.content.split('\n').length} linhas
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => onSelectFile(file.id)}
                                title="Abrir e editar no Workspace"
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-semibold transition-colors cursor-pointer"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Ver</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => onDownloadFile(file)}
                                title="Baixar arquivo individual"
                                className="p-1 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={() => toggleSnippet(file.id)}
                                title="Alternar preview de código"
                                className="p-1 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                              >
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </div>

                          {/* Collapsible snippet preview */}
                          {isExpanded && (
                            <div className="mt-2.5 pt-2 border-t border-white/[0.06]">
                              <pre className="bg-[#090b10] p-2.5 rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-48 border border-white/[0.04]">
                                <code>{file.content}</code>
                              </pre>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {msg.testRecommendation && (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] flex items-start gap-2">
                        <Play className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-400" />
                        <span>{msg.testRecommendation}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        }))}

        {isLoading && (
          <div className="flex gap-3.5 items-center animate-pulse">
            <div className="w-8 h-8 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="bg-[#141724] border border-white/[0.08] px-4 py-2.5 rounded-2xl text-xs text-slate-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-ping" />
              <span>Agentes trabalhando no código do mod e consultando RAG...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Interactive Agent Question Banner (If background runner paused waiting for input) */}
      {projectState.pendingUserQuestion && (
        <div className="p-3 bg-amber-500/10 border-t-2 border-b border-amber-500/30 flex flex-col gap-2 shrink-0 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <img
              src={projectState.pendingUserQuestion.agentAvatar}
              alt={projectState.pendingUserQuestion.agentName}
              className="w-7 h-7 rounded-lg object-cover ring-1 ring-amber-400 shrink-0 mt-0.5"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-black text-amber-300">
                  {projectState.pendingUserQuestion.agentName}
                </span>
                <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {projectState.pendingUserQuestion.agentHandle}
                </span>
                <span className="text-[10px] text-amber-400 font-bold uppercase">
                  Aguardando resposta para continuar:
                </span>
              </div>
              <p className="text-xs text-white font-medium mt-1">
                "{projectState.pendingUserQuestion.question}"
              </p>

              {/* Quick option buttons */}
              {projectState.pendingUserQuestion.suggestedOptions && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {projectState.pendingUserQuestion.suggestedOptions.map((opt, i) => (
                    <button
                      key={i}
                      type="button"
                      disabled={answeringQuestion}
                      onClick={() => handleAnswerPlanQuestion(opt)}
                      className="text-[11px] bg-amber-500/20 hover:bg-amber-500/40 text-amber-200 hover:text-white px-2.5 py-1 rounded-lg border border-amber-500/30 transition-all font-semibold cursor-pointer active:scale-95"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}

              {/* Custom response */}
              <div className="flex items-center gap-1.5 mt-2">
                <input
                  type="text"
                  value={chatQuestionAnswer}
                  onChange={(e) => setChatQuestionAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAnswerPlanQuestion(chatQuestionAnswer);
                    }
                  }}
                  placeholder="Instrução direta para o agente..."
                  className="flex-1 bg-[#090b10] border border-amber-500/30 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
                <button
                  type="button"
                  disabled={!chatQuestionAnswer.trim() || answeringQuestion}
                  onClick={() => handleAnswerPlanQuestion(chatQuestionAnswer)}
                  className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-xs cursor-pointer shrink-0"
                >
                  {answeringQuestion ? 'Enviando...' : 'Retomar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Suggested Quick Action Chips */}
      <div className="px-4 py-2 border-t border-white/[0.06] bg-[#0c0e16] flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] text-slate-500 uppercase font-bold shrink-0">Sugestões:</span>
        {[
          'Criar comando /spawncar com verificação',
          'Configurar preços em config.json',
          'Auditar segurança e otimizar resmon',
          'Gerar README com instruções de instalação',
        ].map((promptText, i) => (
          <button
            type="button"
            key={i}
            onClick={() => setInputText(promptText)}
            className="text-[11px] bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-white/[0.06] transition-colors shrink-0 cursor-pointer"
          >
            {promptText}
          </button>
        ))}
      </div>

      {/* Chat Input Form */}
      <form onSubmit={handleSubmit} className="p-3 border-t border-white/[0.06] bg-[#090b10]">
        <div className="flex items-end gap-2 bg-[#131622] border border-white/[0.08] rounded-2xl p-2 focus-within:border-indigo-500 transition-colors">
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={`Converse com os agentes sobre o mod ${projectState.projectName} (ex: @scriptmaster crie uma função de garagem)...`}
            rows={2}
            className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 resize-none focus:outline-none px-2 py-1 leading-relaxed"
          />

          <button
            type="submit"
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors cursor-pointer shrink-0 shadow-md shadow-indigo-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-1.5 px-1 flex items-center justify-between text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            Guardrails ativos: restrito ao desenvolvimento do mod
          </span>
          <span>Shift + Enter para nova linha</span>
        </div>
      </form>
    </div>
  );
};
