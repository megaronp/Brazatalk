import React, { useState, useMemo } from 'react';
import {
  FileCode,
  FolderOpen,
  Play,
  Copy,
  Check,
  Download,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  Terminal,
  BookOpen,
  Bot,
  Shield,
  Layers,
  AlertCircle,
  FileText,
  Search,
  Sparkles,
  Cpu
} from 'lucide-react';
import {
  ProjectRoomState,
  ProjectFile,
  ProjectAgent,
  ProjectRagDoc
} from '../../types';
import { projectService } from '../../services/projectService';
import { ProjectAgenticScreen } from './ProjectAgenticScreen';

interface ProjectWorkspaceEditorProps {
  projectState: ProjectRoomState;
  onUpdateState: (partial: Partial<ProjectRoomState>) => void;
  activeFileId: string;
  onSelectFile: (fileId: string) => void;
  currentTab?: 'files' | 'sandbox' | 'rag' | 'agents' | 'agentic';
  onTabChange?: (tab: 'files' | 'sandbox' | 'rag' | 'agents' | 'agentic') => void;
}

export const ProjectWorkspaceEditor: React.FC<ProjectWorkspaceEditorProps> = ({
  projectState,
  onUpdateState,
  activeFileId,
  onSelectFile,
  currentTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<'files' | 'sandbox' | 'rag' | 'agents' | 'agentic'>('files');
  const activeTab = currentTab !== undefined ? currentTab : internalTab;
  const setActiveTab = (tab: 'files' | 'sandbox' | 'rag' | 'agents' | 'agentic') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [sandboxSubTab, setSandboxSubTab] = useState<'preview' | 'terminal'>('preview');

  // File management
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Terminal Runner State
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>(() => projectState.testConsoleLogs || [
    '[Sistema] Terminal do Mod inicializado.',
    '[Sandbox] FiveM Mock Engine pronto.',
  ]);

  // RAG management
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocContent, setNewDocContent] = useState('');
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [ragSearchQuery, setRagSearchQuery] = useState('');

  // Active File
  const activeFile = useMemo(() => {
    return (
      projectState.files.find((f) => f.id === activeFileId) ||
      projectState.files[0] ||
      null
    );
  }, [projectState.files, activeFileId]);

  // Find HTML file for web preview
  const htmlFile = useMemo(() => {
    return projectState.files.find(
      (f) => f.name.endsWith('.html') || f.path?.endsWith('.html')
    );
  }, [projectState.files]);

  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    const updatedFiles = projectState.files.map((f) =>
      f.id === activeFile.id
        ? { ...f, content: newContent, updatedAt: Date.now(), version: f.version + 1 }
        : f
    );
    onUpdateState({ files: updatedFiles });
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  const handleCreateFile = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFileName.trim();
    if (!name) return;

    let language: ProjectFile['language'] = 'lua';
    if (name.endsWith('.json')) language = 'json';
    else if (name.endsWith('.html')) language = 'html';
    else if (name.endsWith('.css')) language = 'css';
    else if (name.endsWith('.js')) language = 'javascript';
    else if (name.endsWith('.ts')) language = 'typescript';
    else if (name.endsWith('.md')) language = 'markdown';

    const newFile: ProjectFile = {
      id: `file-${Date.now()}`,
      name,
      path: name,
      language,
      version: 1,
      updatedAt: Date.now(),
      updatedBy: 'Usuário',
      content: language === 'json' ? '{\n  "version": "1.0.0"\n}' : `-- Arquivo ${name}\n`,
    };

    const updatedFiles = [...projectState.files, newFile];
    onUpdateState({ files: updatedFiles });
    onSelectFile(newFile.id);
    setNewFileName('');
    setShowNewFileModal(false);
  };

  const handleDeleteFile = (fileId: string) => {
    if (projectState.files.length <= 1) return;
    const updatedFiles = projectState.files.filter((f) => f.id !== fileId);
    onUpdateState({ files: updatedFiles });
    if (activeFileId === fileId) {
      onSelectFile(updatedFiles[0].id);
    }
  };

  // Run mock simulator & syntax validation
  const handleRunVerification = () => {
    const logs: string[] = [
      `[Validação] Iniciando análise de integridade para ${projectState.projectName}...`,
    ];

    let hasErrors = false;

    // Check JSON syntax
    projectState.files
      .filter((f) => f.language === 'json')
      .forEach((f) => {
        try {
          JSON.parse(f.content);
          logs.push(`[JSON] ✅ ${f.name}: Sintaxe válida.`);
        } catch (e: any) {
          hasErrors = true;
          logs.push(`[JSON] ❌ ${f.name}: Erro de sintaxe! ${e.message}`);
        }
      });

    // Check Lua basic structure
    projectState.files
      .filter((f) => f.language === 'lua')
      .forEach((f) => {
        const lines = f.content.split('\n');
        let functionCount = 0;
        let endCount = 0;
        lines.forEach((line) => {
          const l = line.trim();
          if (/\bfunction\b/.test(l) && !/\bend\b/.test(l)) functionCount++;
          if (/\b(if|while|for)\b/.test(l) && /\bthen\b|\bdo\b/.test(l)) functionCount++;
          if (l === 'end' || l.endsWith(' end')) endCount++;
        });

        logs.push(
          `[Lua] ℹ️ ${f.name}: ${lines.length} linhas analisadas. Registro de eventos FiveM verificado.`
        );
      });

    logs.push('[Engine Mock] ⚡ Disparando teste de montagem de ambiente...');
    logs.push('[Console] Command Registered: /spawncar [modelo]');
    logs.push('[Console] NetEvent Registered: braza:notify');
    logs.push(
      hasErrors
        ? '[Status] ⚠️ Foram detectados avisos de sintaxe nos arquivos.'
        : '[Status] ✅ Todos os scripts e arquivos passaram nos testes com sucesso! 0 erros.'
    );

    setTerminalLogs((prev) => [...prev, ...logs]);
    setActiveTab('sandbox');
    setSandboxSubTab('terminal');
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;

    const newLogs = [`> ${cmd}`];

    if (cmd.startsWith('/spawncar')) {
      const parts = cmd.split(' ');
      const car = parts[1] || 'adder';
      newLogs.push(`[Mock FiveM] 🚗 Executando RegisterCommand('spawncar')...`);
      newLogs.push(`[Mock FiveM] RequestModel(${car}) -> Carregado.`);
      newLogs.push(`[Mock FiveM] CreateVehicle(${car}, coords) -> ID da Entidade: 1045`);
      newLogs.push(`[Mock FiveM] ✅ Veículo '${car}' gerado com sucesso!`);
    } else if (cmd.startsWith('/help')) {
      newLogs.push(`[Comandos de Teste]:`);
      newLogs.push(`  /spawncar [nome] - Testa spawn do veículo`);
      newLogs.push(`  /resmon - Exibe consumo simulado de CPU/ms`);
      newLogs.push(`  /clear - Limpa o terminal de teste`);
    } else if (cmd === '/resmon') {
      newLogs.push(`[Resmon Mock] ${projectState.projectName}: 0.01 ms (Excelente otimização)`);
    } else if (cmd === '/clear') {
      setTerminalLogs([]);
      setTerminalInput('');
      return;
    } else {
      newLogs.push(`[Mock Console] Comando '${cmd}' executado no sandbox de simulação.`);
    }

    setTerminalLogs((prev) => [...prev, ...newLogs]);
    setTerminalInput('');
  };

  const handleAddRagDoc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocContent.trim()) return;

    const doc: ProjectRagDoc = {
      id: `doc-${Date.now()}`,
      title: newDocTitle.trim(),
      gameEngine: projectState.gameEngine,
      tags: [projectState.gameEngine.toLowerCase().replace(/\s+/g, '-')],
      content: newDocContent.trim(),
      uploadedAt: Date.now(),
    };

    onUpdateState({ ragDocs: [doc, ...projectState.ragDocs] });
    setNewDocTitle('');
    setNewDocContent('');
    setShowNewDocModal(false);
  };

  const filteredRagDocs = useMemo(() => {
    if (!ragSearchQuery.trim()) return projectState.ragDocs;
    const q = ragSearchQuery.toLowerCase();
    return projectState.ragDocs.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.content.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q))
    );
  }, [projectState.ragDocs, ragSearchQuery]);

  return (
    <div id="project-workspace-editor" className="h-full flex flex-col bg-[#0d1017]">
      {/* Top Workspace Tab Selector (Desktop only) */}
      <div className="hidden lg:flex h-12 border-b border-white/[0.06] bg-[#090b10] items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('files')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'files'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>Arquivos ({projectState.files.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('sandbox')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'sandbox'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Play className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sandbox & Testes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('rag')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'rag'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>RAG & Docs ({projectState.ragDocs.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agents')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'agents'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Bot className="w-3.5 h-3.5 text-pink-400" />
            <span>Agentes & Guardrails</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('agentic')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer relative ${
              activeTab === 'agentic'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm ring-1 ring-white/20'
                : 'text-slate-300 hover:text-white hover:bg-white/[0.06] bg-indigo-500/10 border border-indigo-500/20'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tela Agêntica (Swarm)</span>
            {projectState.actionPlan?.status === 'running' && (
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
            )}
            {projectState.pendingUserQuestion && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse absolute -top-0.5 -right-0.5" />
            )}
          </button>
        </div>

        {/* Global Quick Action */}
        <button
          type="button"
          onClick={handleRunVerification}
          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white text-xs font-bold border border-emerald-500/30 transition-all cursor-pointer shadow-sm"
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Testar Mod</span>
        </button>
      </div>

      {/* TAB 1: FILES & CODE EDITOR */}
      {activeTab === 'files' && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          {/* Mobile Horizontal File Tabs Bar (md:hidden) */}
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto p-2 bg-[#090b10] border-b border-white/[0.06] shrink-0">
            {projectState.files.map((file) => {
              const isActive = activeFile?.id === file.id;
              return (
                <button
                  key={file.id}
                  type="button"
                  onClick={() => onSelectFile(file.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-600 text-white font-bold shadow-sm'
                      : 'bg-white/[0.04] text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate max-w-[120px]">{file.name}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowNewFileModal(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white text-xs shrink-0 cursor-pointer"
              title="Novo Arquivo"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo</span>
            </button>
          </div>

          {/* Desktop Files Sidebar Tree */}
          <div className="hidden md:flex w-48 lg:w-56 bg-[#0a0c13] border-r border-white/[0.06] flex-col justify-between shrink-0 select-none">
            <div className="p-2.5 border-b border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Workspace
              </span>
              <button
                type="button"
                onClick={() => setShowNewFileModal(true)}
                title="Criar novo arquivo"
                className="p-1 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              {projectState.files.map((file) => {
                const isActive = activeFile?.id === file.id;
                return (
                  <div
                    key={file.id}
                    className={`group/file flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
                      isActive
                        ? 'bg-indigo-600/20 text-white border border-indigo-500/30 font-semibold'
                        : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                    }`}
                    onClick={() => onSelectFile(file.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileCode
                        className={`w-3.5 h-3.5 shrink-0 ${
                          file.language === 'lua'
                            ? 'text-sky-400'
                            : file.language === 'json'
                            ? 'text-amber-400'
                            : file.language === 'html'
                            ? 'text-rose-400'
                            : 'text-indigo-400'
                        }`}
                      />
                      <span className="truncate">{file.name}</span>
                    </div>

                    {projectState.files.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFile(file.id);
                        }}
                        title="Excluir arquivo"
                        className="opacity-0 group-hover/file:opacity-100 hover:text-rose-400 text-slate-500 p-0.5 rounded transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* New File Modal Popover */}
            {showNewFileModal && (
              <div className="p-2 border-t border-white/[0.06] bg-[#0e111a]">
                <form onSubmit={handleCreateFile} className="space-y-1.5">
                  <input
                    type="text"
                    autoFocus
                    required
                    placeholder="ex: server.lua, config.json"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="w-full bg-[#141724] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNewFileModal(false)}
                      className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-0.5 text-[10px] bg-indigo-600 text-white rounded font-bold"
                    >
                      Criar
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>

          {/* Active Code Editor */}
          {activeFile ? (
            <div className="flex-1 flex flex-col bg-[#07080d] overflow-hidden min-h-0">
              {/* File Header */}
              <div className="h-10 border-b border-white/[0.06] bg-[#0c0e16] px-3 sm:px-4 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 text-slate-300 min-w-0">
                  <span className="font-bold text-white truncate max-w-[130px] sm:max-w-none">{activeFile.name}</span>
                  <span className="text-[10px] font-mono uppercase bg-white/[0.06] px-1.5 py-0.5 rounded text-slate-400 shrink-0">
                    {activeFile.language}
                  </span>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">v{activeFile.version}</span>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span className="hidden xs:inline">{copiedCode ? 'Copiado' : 'Copiar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => projectService.downloadSingleFile(activeFile)}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded hover:bg-white/[0.06] transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span className="hidden xs:inline">Baixar</span>
                  </button>
                </div>
              </div>

              {/* Code Editor Body */}
              <div className="flex-1 relative flex overflow-hidden min-h-0">
                {/* Line numbers gutter */}
                <div className="w-9 sm:w-10 bg-[#090b11] border-r border-white/[0.04] py-3 text-right pr-1.5 sm:pr-2 select-none text-[11px] font-mono text-slate-600 shrink-0 overflow-hidden">
                  {activeFile.content.split('\n').map((_, i) => (
                    <div key={i} className="leading-5">
                      {i + 1}
                    </div>
                  ))}
                </div>

                {/* Editable Code Area */}
                <textarea
                  value={activeFile.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  spellCheck={false}
                  className="flex-1 bg-transparent text-emerald-300 font-mono text-xs leading-5 p-3 resize-none focus:outline-none overflow-auto whitespace-pre selection:bg-indigo-600/40 min-w-0"
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs">
              Nenhum arquivo selecionado no workspace.
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SANDBOX DE TESTES & PREVIEW (Estilo Google AI Studio) */}
      {activeTab === 'sandbox' && (
        <div className="flex-1 flex flex-col bg-[#07080d] overflow-hidden min-h-0">
          {/* Sub tabs: Web / NUI Preview vs Terminal / Mock Runner */}
          <div className="h-11 border-b border-white/[0.06] bg-[#0c0e16] px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto min-w-0">
              <button
                type="button"
                onClick={() => setSandboxSubTab('preview')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  sandboxSubTab === 'preview'
                    ? 'bg-indigo-600/30 text-white border border-indigo-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>Preview NUI</span>
              </button>

              <button
                type="button"
                onClick={() => setSandboxSubTab('terminal')}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shrink-0 ${
                  sandboxSubTab === 'terminal'
                    ? 'bg-indigo-600/30 text-white border border-indigo-500/40'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Console FiveM</span>
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs shrink-0">
              <span className="text-slate-500 text-[11px] font-mono hidden sm:inline">Status: Sandbox Ativo</span>
              <button
                type="button"
                onClick={handleRunVerification}
                className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors cursor-pointer"
                title="Recarregar testes"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* SubTab 1: Web / NUI Preview */}
          {sandboxSubTab === 'preview' && (
            <div className="flex-1 relative bg-[#090b10] flex flex-col p-2 sm:p-4 min-h-0">
              {htmlFile ? (
                <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-2xl bg-[#030712] flex flex-col min-h-0">
                  <div className="bg-[#111422] px-3 py-2 border-b border-white/[0.06] flex items-center justify-between text-xs text-slate-400 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
                      <span className="ml-2 font-mono text-[10px] text-slate-400 truncate max-w-[200px]">
                        Sandboxed NUI Preview ({htmlFile.name})
                      </span>
                    </div>
                  </div>
                  <iframe
                    title="NUI Preview"
                    sandbox="allow-scripts allow-modals"
                    srcDoc={
                      htmlFile.content.includes('<head>')
                        ? htmlFile.content.replace(
                            '<head>',
                            `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'unsafe-inline' https:; font-src https: data:; img-src https: data: blob:; media-src https: data: blob:; connect-src 'none';">`
                          )
                        : `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https: blob:; style-src 'unsafe-inline' https:; font-src https: data:; img-src https: data: blob:; media-src https: data: blob:; connect-src 'none';">${htmlFile.content}`
                    }
                    className="w-full flex-1 border-none bg-black min-h-0"
                  />
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Layers className="w-10 h-10 text-slate-600 mb-3" />
                  <h3 className="text-sm font-bold text-white mb-1">Nenhum arquivo HTML encontrado</h3>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    Crie um arquivo como `index.html` ou `html/index.html` para visualizar a interface NUI do mod em tempo real.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewFileName('index.html');
                      setShowNewFileModal(true);
                      setActiveTab('files');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                  >
                    + Criar index.html
                  </button>
                </div>
              )}
            </div>
          )}

          {/* SubTab 2: Terminal / Console Runner */}
          {sandboxSubTab === 'terminal' && (
            <div className="flex-1 flex flex-col bg-[#05060a] p-2 sm:p-4 min-h-0">
              <div className="flex-1 bg-[#090b10] border border-white/[0.08] rounded-2xl p-3 sm:p-4 overflow-y-auto font-mono text-xs text-slate-300 space-y-1 shadow-inner min-h-0">
                {terminalLogs.map((log, idx) => (
                  <div
                    key={idx}
                    className={`leading-relaxed break-words ${
                      log.startsWith('>')
                        ? 'text-indigo-400 font-bold'
                        : log.includes('❌') || log.includes('Erro')
                        ? 'text-rose-400'
                        : log.includes('✅')
                        ? 'text-emerald-400'
                        : log.includes('⚠️')
                        ? 'text-amber-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </div>

              {/* Quick test command pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-2 shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">Atalhos:</span>
                {['/spawncar adder', '/resmon', '/help', '/clear'].map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    onClick={() => setTerminalInput(cmd)}
                    className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white font-mono text-[11px] border border-white/[0.06] shrink-0 cursor-pointer"
                  >
                    {cmd}
                  </button>
                ))}
              </div>

              {/* Terminal command line */}
              <form onSubmit={handleTerminalSubmit} className="flex gap-2 shrink-0">
                <div className="flex-1 bg-[#0f111a] border border-white/[0.08] rounded-xl px-3 py-2 flex items-center gap-2 focus-within:border-emerald-500 min-w-0">
                  <span className="text-emerald-400 font-mono font-bold">&gt;</span>
                  <input
                    type="text"
                    placeholder="Digite um comando (ex: /spawncar adder, /resmon)..."
                    value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    className="flex-1 bg-transparent text-xs text-white font-mono focus:outline-none min-w-0"
                  />
                </div>
                <button
                  type="submit"
                  className="px-3 sm:px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-md shadow-emerald-600/20 shrink-0"
                >
                  Executar
                </button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: RAG & DOCS DO JOGO */}
      {activeTab === 'rag' && (
        <div className="flex-1 flex flex-col bg-[#07080d] p-3 sm:p-4 overflow-y-auto">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 shrink-0">
            <div>
              <h3 className="text-sm font-bold text-white">Base de Conhecimento RAG do Mod</h3>
              <p className="text-xs text-slate-400">
                Documentos que a IA consulta para escrever o código com precisão para a engine {projectState.gameEngine}.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowNewDocModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors cursor-pointer shadow-sm shrink-0 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Adicionar Documento RAG</span>
            </button>
          </div>

          {/* Search bar */}
          <div className="mb-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Pesquisar nos documentos indexados..."
              value={ragSearchQuery}
              onChange={(e) => setRagSearchQuery(e.target.value)}
              className="w-full bg-[#0e111a] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Docs list */}
          <div className="space-y-3">
            {filteredRagDocs.map((doc) => (
              <div
                key={doc.id}
                className="bg-[#0e111a] border border-white/[0.08] rounded-2xl p-4 transition-all hover:border-indigo-500/30"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                    <h4 className="text-xs font-bold text-white">{doc.title}</h4>
                    {doc.gameEngine && (
                      <span className="text-[10px] bg-white/[0.06] text-slate-300 px-2 py-0.5 rounded-md font-mono">
                        {doc.gameEngine}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {new Date(doc.uploadedAt).toLocaleDateString()}
                  </span>
                </div>

                <div className="flex gap-1.5 mb-2">
                  {doc.tags.map((t) => (
                    <span key={t} className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                      #{t}
                    </span>
                  ))}
                </div>

                <pre className="bg-[#07090f] p-3 rounded-xl text-[11px] font-mono text-slate-300 max-h-36 overflow-y-auto border border-white/[0.04]">
                  {doc.content}
                </pre>
              </div>
            ))}
          </div>

          {/* New Doc Modal */}
          {showNewDocModal && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-[#0e111a] border border-white/10 rounded-3xl p-6 w-full max-w-lg space-y-4">
                <h3 className="text-base font-black text-white">Novo Documento de RAG / Engine</h3>
                <form onSubmit={handleAddRagDoc} className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Título do Documento</label>
                    <input
                      type="text"
                      required
                      placeholder="ex: FiveM Natives & Veículos"
                      value={newDocTitle}
                      onChange={(e) => setNewDocTitle(e.target.value)}
                      className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 mb-1">Conteúdo Técnico / Referência</label>
                    <textarea
                      required
                      rows={6}
                      placeholder="Cole aqui assinaturas de funções, eventos nativos, tabelas de IDs ou regras da engine..."
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                      className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowNewDocModal(false)}
                      className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-md"
                    >
                      Indexar Documento
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: AGENTES & GUARDRAILS */}
      {activeTab === 'agents' && (
        <div className="flex-1 bg-[#07080d] p-5 overflow-y-auto space-y-6">
          {/* Guardrails Box */}
          <div className="bg-[#0e111a] border border-white/[0.08] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-white">Guardrails & Limites de Escopo do Projeto</h3>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Defina as regras obrigatórias que impedem os agentes de sair do tema do mod ou gerar código fora dos padrões.
            </p>
            <textarea
              value={projectState.guardrails}
              onChange={(e) => onUpdateState({ guardrails: e.target.value })}
              rows={3}
              placeholder="Instruções de limites estritos (ex: Foco exclusivo no mod de veículos, recusar qualquer tarefa fora de GTA FiveM)..."
              className="w-full bg-[#131622] border border-white/[0.08] rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed"
            />
          </div>

          {/* Agents List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Agentes Especialistas da Sala</h3>
                <p className="text-xs text-slate-400">
                  Cada agente possui persona, habilidades e foco específico para colaborar no desenvolvimento.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {projectState.agents.map((agent) => (
                <div
                  key={agent.id}
                  className="bg-[#0e111a] border border-white/[0.08] rounded-2xl p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <img src={agent.avatar} alt={agent.name} className="w-10 h-10 rounded-xl ring-1 ring-white/10" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white truncate">{agent.name}</span>
                        <span
                          className="text-[10px] font-mono px-1.5 py-0.2 rounded font-bold"
                          style={{
                            backgroundColor: `${agent.color}20`,
                            color: agent.color,
                          }}
                        >
                          {agent.handle}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{agent.role}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Habilidades:</div>
                    <div className="flex flex-wrap gap-1">
                      {agent.skills.map((skill, sIdx) => (
                        <span
                          key={sIdx}
                          className="text-[10px] bg-white/[0.05] border border-white/[0.06] text-slate-300 px-2 py-0.5 rounded-md"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-[#07090f] p-2.5 rounded-xl border border-white/[0.04] leading-relaxed">
                    {agent.systemPrompt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: AGENTIC SCREEN & SWARM AUTONOMOUS MONITOR */}
      {activeTab === 'agentic' && (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          <ProjectAgenticScreen
            projectState={projectState}
            onUpdateState={onUpdateState}
            onSelectFile={(fileId) => {
              setActiveTab('files');
              onSelectFile(fileId);
            }}
          />
        </div>
      )}
    </div>
  );
};
