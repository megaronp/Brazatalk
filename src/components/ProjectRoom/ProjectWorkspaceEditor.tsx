import React, { useState, useMemo, useRef, useEffect } from 'react';
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
  Cpu,
  Users,
  Clock,
  CloudCheck,
  CloudOff
} from 'lucide-react';
import {
  ProjectRoomState,
  ProjectFile,
  ProjectAgent,
  ProjectRagDoc,
  FilePresenceUser,
  User
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
  channelId?: string;
  currentUser?: User | { id?: string; name?: string; userName?: string; avatar?: string };
  filePresence?: Record<string, FilePresenceUser[]>;
  hideHeader?: boolean;
}

export const ProjectWorkspaceEditor: React.FC<ProjectWorkspaceEditorProps> = ({
  projectState,
  onUpdateState,
  activeFileId,
  onSelectFile,
  currentTab,
  onTabChange,
  channelId,
  currentUser,
  filePresence,
  hideHeader = false,
}) => {
  const [internalTab, setInternalTab] = useState<'files' | 'sandbox' | 'rag' | 'agents' | 'agentic'>('files');
  const activeTab = currentTab !== undefined ? currentTab : internalTab;
  const setActiveTab = (tab: 'files' | 'sandbox' | 'rag' | 'agents' | 'agentic') => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [sandboxSubTab, setSandboxSubTab] = useState<'preview' | 'terminal'>(() =>
    projectState.previewType === 'console' ? 'terminal' : 'preview'
  );

  // File management
  const [newFileName, setNewFileName] = useState('');
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Auto-Save & Concurrency State
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'conflict' | 'error'>('saved');
  const [conflictData, setConflictData] = useState<{
    file: ProjectFile;
    serverVersion: number;
    serverContent: string;
    message: string;
  } | null>(null);
  const saveTimeoutRef = useRef<any>(null);

  // Terminal Runner State
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalLogs, setTerminalLogs] = useState<string[]>(() => {
    if (projectState.testConsoleLogs && projectState.testConsoleLogs.length > 0) {
      return projectState.testConsoleLogs;
    }
    const profile = projectState.projectProfile || 'generic';
    if (profile === 'python') {
      return [
        '[Sistema] Terminal Python 3.11 inicializado.',
        '[Sandbox] Ambiente virtual pronto. Digite comandos ou use /help.',
      ];
    }
    if (profile === 'web') {
      return [
        '[Sistema] Dev Server Vite & Web Runtime pronto.',
        '[Sandbox] Sandboxed DOM montado.',
      ];
    }
    if (profile === 'fivem') {
      return [
        '[Sistema] Terminal do Mod inicializado.',
        '[Sandbox] CFX Engine Mock pronto.',
      ];
    }
    return [
      '[Sistema] Terminal de Execução do Projeto inicializado.',
      '[Sandbox] Workspace isolado pronto para compilação e testes.',
    ];
  });

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

  // Active file presence (other users viewing or editing this file)
  const activeFilePresence = useMemo(() => {
    if (!filePresence || !activeFile) return [];
    const users = filePresence[activeFile.id] || [];
    return users.filter((u) => u.userId !== currentUser?.id);
  }, [filePresence, activeFile, currentUser?.id]);

  const handleContentChange = (newContent: string) => {
    if (!activeFile) return;
    setSaveStatus('saving');

    const updatedFile: ProjectFile = {
      ...activeFile,
      content: newContent,
      updatedAt: Date.now(),
      version: activeFile.version + 1,
      updatedBy: currentUser?.name || 'Você',
    };

    const updatedFiles = projectState.files.map((f) =>
      f.id === activeFile.id ? updatedFile : f
    );
    onUpdateState({ files: updatedFiles });

    // Notify presence: editing
    if (channelId) {
      window.dispatchEvent(
        new CustomEvent('braza-send-ws', {
          detail: {
            type: 'file-presence',
            channelId,
            fileId: activeFile.id,
            status: 'editing',
            userId: currentUser?.id,
            userName: currentUser?.name,
            userAvatar: currentUser?.avatar,
          },
        })
      );
    }

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!channelId) {
        setSaveStatus('saved');
        return;
      }
      const res = await projectService.saveProjectFile(
        channelId,
        updatedFile,
        activeFile.version,
        currentUser
      );

      if (res.conflict) {
        setSaveStatus('conflict');
        setConflictData({
          file: updatedFile,
          serverVersion: res.serverVersion || activeFile.version + 1,
          serverContent: res.serverContent || '',
          message: res.message || 'Conflito de concorrência detectado!',
        });
      } else if (res.success) {
        setSaveStatus('saved');
        setConflictData(null);
      } else {
        setSaveStatus('error');
      }
    }, 1000);
  };

  const handleAcceptServerVersion = () => {
    if (!conflictData || !activeFile) return;
    const resolvedFile: ProjectFile = {
      ...activeFile,
      content: conflictData.serverContent,
      version: conflictData.serverVersion,
      updatedAt: Date.now(),
    };
    const updatedFiles = projectState.files.map((f) =>
      f.id === activeFile.id ? resolvedFile : f
    );
    onUpdateState({ files: updatedFiles });
    setConflictData(null);
    setSaveStatus('saved');
  };

  const handleForceMyVersion = async () => {
    if (!conflictData || !activeFile || !channelId) return;
    setSaveStatus('saving');
    const res = await projectService.forceSaveProjectFile(channelId, conflictData.file, currentUser);
    if (res.success) {
      setConflictData(null);
      setSaveStatus('saved');
    } else {
      setSaveStatus('error');
    }
  };

  const handleCopyCode = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1500);
  };

  const handleCreateFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFileName.trim();
    if (!name) return;

    let language: ProjectFile['language'] = 'text';
    if (name.endsWith('.json')) language = 'json';
    else if (name.endsWith('.html')) language = 'html';
    else if (name.endsWith('.css')) language = 'css';
    else if (name.endsWith('.js')) language = 'javascript';
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) language = 'typescript';
    else if (name.endsWith('.py')) language = 'python';
    else if (name.endsWith('.lua')) language = 'lua';
    else if (name.endsWith('.md')) language = 'markdown';
    else if (projectState.projectProfile === 'python') language = 'python';
    else if (projectState.projectProfile === 'web') language = 'javascript';
    else if (projectState.projectProfile === 'fivem') language = 'lua';

    let initialContent = `-- Arquivo ${name}\n`;
    if (language === 'python') {
      initialContent = `# ${name}\n\ndef main():\n    print("Hello from ${name}")\n\nif __name__ == '__main__':\n    main()\n`;
    } else if (language === 'json') {
      initialContent = '{\n  "name": "project",\n  "version": "1.0.0"\n}\n';
    } else if (language === 'html') {
      initialContent = `<!DOCTYPE html>\n<html lang="pt-BR">\n<head>\n  <meta charset="UTF-8">\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`;
    } else if (language === 'javascript' || language === 'typescript') {
      initialContent = `// ${name}\nconsole.log("Arquivo ${name} inicializado");\n`;
    } else if (language === 'markdown') {
      initialContent = `# ${name}\n\nDocumentação do módulo.\n`;
    }

    const newFile: ProjectFile = {
      id: `file-${Date.now()}`,
      name,
      path: name,
      language,
      version: 1,
      updatedAt: Date.now(),
      updatedBy: currentUser?.name || 'Usuário',
      content: initialContent,
    };

    const updatedFiles = [...projectState.files, newFile];
    onUpdateState({ files: updatedFiles });
    onSelectFile(newFile.id);
    setNewFileName('');
    setShowNewFileModal(false);

    if (channelId) {
      await projectService.saveProjectFile(channelId, newFile, 0, currentUser);
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (projectState.files.length <= 1) return;
    const updatedFiles = projectState.files.filter((f) => f.id !== fileId);
    onUpdateState({ files: updatedFiles });
    if (activeFileId === fileId) {
      onSelectFile(updatedFiles[0].id);
    }
    if (channelId) {
      await projectService.deleteProjectFile(channelId, fileId);
    }
  };

  // Run verification & syntax tests (profile-aware)
  const handleRunVerification = () => {
    const profile = projectState.projectProfile || 'generic';
    const logs: string[] = [
      `[Validação Estática] Analisando ${projectState.files.length} arquivo(s) em '${projectState.projectName}' (Perfil: ${profile.toUpperCase()})...`,
    ];

    let hasErrors = false;
    let totalLines = 0;

    projectState.files.forEach((f) => {
      const lines = f.content.split('\n');
      totalLines += lines.length;

      // Real JSON check
      if (f.language === 'json' || f.name.endsWith('.json')) {
        try {
          JSON.parse(f.content);
          logs.push(`[JSON] ✅ ${f.name}: Sintaxe válida (${lines.length} linhas).`);
        } catch (e: any) {
          hasErrors = true;
          logs.push(`[JSON] ❌ ${f.name}: Erro de sintaxe! ${e.message}`);
        }
      }

      // Real HTML check
      if (f.language === 'html' || f.name.endsWith('.html')) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(f.content, 'text/html');
        const parserErrors = doc.querySelectorAll('parsererror');
        if (parserErrors.length > 0) {
          hasErrors = true;
          logs.push(`[HTML] ❌ ${f.name}: Erro de estrutura HTML.`);
        } else {
          logs.push(`[HTML] ✅ ${f.name}: DOM válido (${lines.length} linhas).`);
        }
      }

      // Real JS/TS/Lua bracket balancing check
      if (['javascript', 'typescript', 'lua'].includes(f.language) || /\.(js|ts|tsx|jsx|lua)$/i.test(f.name)) {
        let openBraces = 0;
        let openParens = 0;
        lines.forEach((l) => {
          openBraces += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
          openParens += (l.match(/\(/g) || []).length - (l.match(/\)/g) || []).length;
        });

        if (openBraces !== 0 || openParens !== 0) {
          hasErrors = true;
          logs.push(`[Sintaxe] ⚠️ ${f.name}: Possível desbalanceamento (${openBraces !== 0 ? 'chaves { }' : ''} ${openParens !== 0 ? 'parênteses ( )' : ''}).`);
        } else {
          logs.push(`[Sintaxe] ✅ ${f.name}: Delimitadores balanceados (${lines.length} linhas).`);
        }
      }

      // Real Python paren check
      if (f.language === 'python' || f.name.endsWith('.py')) {
        let openParens = 0;
        lines.forEach((l) => {
          openParens += (l.match(/\(/g) || []).length - (l.match(/\)/g) || []).length;
        });
        if (openParens !== 0) {
          hasErrors = true;
          logs.push(`[Python] ❌ ${f.name}: Parênteses não balanceados.`);
        } else {
          logs.push(`[Python] ✅ ${f.name}: Estrutura verificada (${lines.length} linhas).`);
        }
      }
    });

    logs.push(`[Resumo] Total de ${projectState.files.length} arquivo(s), ${totalLines} linha(s) de código.`);
    logs.push(
      hasErrors
        ? '[Status] ⚠️ Foram detectados avisos de sintaxe ou delimitadores abertos nos arquivos.'
        : '[Status] ✅ Todos os arquivos foram validados com sucesso! Nenhum erro crítico detectado.'
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

    if (cmd === '/clear') {
      setTerminalLogs([]);
      setTerminalInput('');
      return;
    }

    if (cmd === '/help') {
      newLogs.push('[Console de Diagnóstico & Análise Estática - Comandos Reais]:');
      newLogs.push('  /check       - Executa verificação sintática em todos os arquivos');
      newLogs.push('  /files       - Lista todos os arquivos do projeto e tamanhos reais');
      newLogs.push('  /stats       - Métricas de código (linhas totais, contagem de arquivos)');
      newLogs.push('  /view [nome] - Inspeciona o conteúdo inicial de um arquivo específico');
      newLogs.push('  /clear       - Limpa o histórico deste console');
    } else if (cmd === '/check') {
      handleRunVerification();
      setTerminalInput('');
      return;
    } else if (cmd === '/files') {
      newLogs.push(`[Arquivos do Projeto] (${projectState.files.length} arquivos):`);
      projectState.files.forEach((f) => {
        const sizeBytes = new Blob([f.content]).size;
        const lineCount = f.content.split('\n').length;
        newLogs.push(`  • ${f.name} [${f.language}] - ${lineCount} linhas, ${sizeBytes} bytes`);
      });
    } else if (cmd === '/stats') {
      let totalLines = 0;
      let totalBytes = 0;
      const languages: Record<string, number> = {};
      projectState.files.forEach((f) => {
        totalLines += f.content.split('\n').length;
        totalBytes += new Blob([f.content]).size;
        languages[f.language] = (languages[f.language] || 0) + 1;
      });
      newLogs.push(`[Estatísticas de Código de '${projectState.projectName}']:`);
      newLogs.push(`  • Arquivos totais: ${projectState.files.length}`);
      newLogs.push(`  • Total de linhas: ${totalLines}`);
      newLogs.push(`  • Tamanho total: ${(totalBytes / 1024).toFixed(2)} KB`);
      newLogs.push(`  • Linguagens: ${Object.entries(languages).map(([lang, cnt]) => `${lang} (${cnt})`).join(', ')}`);
    } else if (cmd.startsWith('/view')) {
      const parts = cmd.split(' ');
      const targetName = parts[1]?.trim();
      if (!targetName) {
        newLogs.push('[Console] Uso correto: /view <nome_do_arquivo>');
      } else {
        const found = projectState.files.find(
          (f) => f.name.toLowerCase() === targetName.toLowerCase() || f.name.toLowerCase().includes(targetName.toLowerCase())
        );
        if (found) {
          const previewLines = found.content.split('\n').slice(0, 8);
          newLogs.push(`[Preview de ${found.name}] (${found.content.split('\n').length} linhas no total):`);
          previewLines.forEach((l, idx) => {
            newLogs.push(`  ${idx + 1}: ${l}`);
          });
          if (found.content.split('\n').length > 8) {
            newLogs.push('  ... (abra o arquivo no editor para ver o conteúdo completo)');
          }
        } else {
          newLogs.push(`[Console] Arquivo '${targetName}' não encontrado no projeto.`);
        }
      }
    } else {
      newLogs.push(`[Console] Comando '${cmd}' não reconhecido. Digite /help para listar comandos disponíveis.`);
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
      {/* Top Workspace Tab Selector (Desktop only, hidden if controlled by parent) */}
      {!hideHeader && (
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
            <span>
              {projectState.projectProfile === 'python'
                ? 'Testar Script'
                : projectState.projectProfile === 'web'
                ? 'Validar Web'
                : projectState.projectProfile === 'fivem'
                ? 'Testar Mod'
                : 'Verificar Projeto'}
            </span>
          </button>
        </div>
      )}

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
                            : file.language === 'python'
                            ? 'text-emerald-400'
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
                    placeholder="ex: main.py, server.lua, config.json"
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    className="w-full bg-[#141724] border border-white/[0.08] rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNewFileModal(false)}
                      className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-white cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="px-2 py-0.5 text-[10px] bg-indigo-600 hover:bg-indigo-500 text-white rounded font-bold cursor-pointer"
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
              {/* Concurrency Conflict Alert Banner */}
              {conflictData && (
                <div className="bg-amber-950/90 border-b border-amber-500/40 p-2.5 sm:p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-amber-200 text-xs shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="truncate">
                      <span className="font-bold text-white">Conflito de Versão: </span>
                      <span>Outro membro salvou uma versão mais recente (v{conflictData.serverVersion}).</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleAcceptServerVersion}
                      className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                    >
                      Carregar do Servidor
                    </button>
                    <button
                      type="button"
                      onClick={handleForceMyVersion}
                      className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm cursor-pointer"
                    >
                      Forçar Minha Versão
                    </button>
                  </div>
                </div>
              )}

              {/* File Header */}
              <div className="h-10 border-b border-white/[0.06] bg-[#0c0e16] px-3 sm:px-4 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 text-slate-300 min-w-0">
                  <span className="font-bold text-white truncate max-w-[120px] sm:max-w-none">{activeFile.name}</span>
                  <span className="text-[10px] font-mono uppercase bg-white/[0.06] px-1.5 py-0.5 rounded text-slate-400 shrink-0">
                    {activeFile.language}
                  </span>
                  <span className="text-[10px] text-slate-500 hidden sm:inline">v{activeFile.version}</span>

                  {/* Save Status Indicator */}
                  <div className="hidden sm:flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-white/[0.04]">
                    {saveStatus === 'saving' && (
                      <span className="flex items-center gap-1 text-sky-400">
                        <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        <span>Salvando...</span>
                      </span>
                    )}
                    {saveStatus === 'saved' && (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span>Salvo</span>
                      </span>
                    )}
                    {saveStatus === 'conflict' && (
                      <span className="flex items-center gap-1 text-amber-400 font-bold">
                        <AlertCircle className="w-2.5 h-2.5" />
                        <span>Conflito</span>
                      </span>
                    )}
                    {saveStatus === 'error' && (
                      <span className="flex items-center gap-1 text-rose-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                        <span>Erro</span>
                      </span>
                    )}
                  </div>

                  {/* Presence Chips for Active File */}
                  {activeFilePresence.length > 0 && (
                    <div className="flex items-center gap-1 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.06]">
                      <div className="flex items-center -space-x-1.5">
                        {activeFilePresence.map((p) => (
                          <img
                            key={p.userId}
                            src={p.userAvatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${p.userId}`}
                            alt={p.userName}
                            title={`${p.userName} (${p.status === 'editing' ? 'Editando agora...' : 'Visualizando'})`}
                            className={`w-4 h-4 rounded-full border border-[#0c0e16] ${
                              p.status === 'editing' ? 'ring-1 ring-amber-400 animate-pulse' : ''
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400 font-medium hidden md:inline">
                        {activeFilePresence[0].userName}
                        {activeFilePresence.length > 1 ? ` +${activeFilePresence.length - 1}` : ''}
                        {activeFilePresence.some((p) => p.status === 'editing') ? ' (editando)' : ''}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleRunVerification}
                    title="Testar e Executar Código no Sandbox"
                    className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 hover:text-white px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600 border border-emerald-500/30 transition-all cursor-pointer shadow-sm"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Testar</span>
                  </button>

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
                  onFocus={() => {
                    if (channelId) {
                      window.dispatchEvent(
                        new CustomEvent('braza-send-ws', {
                          detail: {
                            type: 'file-presence',
                            channelId,
                            fileId: activeFile.id,
                            status: 'editing',
                            userId: currentUser?.id,
                            userName: currentUser?.name,
                            userAvatar: currentUser?.avatar,
                          },
                        })
                      );
                    }
                  }}
                  onBlur={() => {
                    if (channelId) {
                      window.dispatchEvent(
                        new CustomEvent('braza-send-ws', {
                          detail: {
                            type: 'file-presence',
                            channelId,
                            fileId: activeFile.id,
                            status: 'viewing',
                            userId: currentUser?.id,
                            userName: currentUser?.name,
                            userAvatar: currentUser?.avatar,
                          },
                        })
                      );
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 bg-transparent text-emerald-300 font-mono text-xs leading-5 p-3 resize-none focus:outline-none overflow-auto whitespace-pre selection:bg-indigo-600/40 min-w-0"
                />
              </div>
            </div>
          ) : projectState.files.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-[#07080d] select-none">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-lg shadow-indigo-600/10">
                <FileCode className="w-7 h-7" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Workspace em Branco</h3>
              <p className="text-xs text-slate-400 max-w-md mb-6 leading-relaxed">
                Esta sala de projeto foi iniciada em branco para você configurar livremente.
                Crie seus arquivos de código, monte sua equipe de agentes ou use a Tela Agêntica para planejar.
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowNewFileModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Primeiro Arquivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('agentic')}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-slate-300 hover:text-white text-xs font-bold transition-all cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span>Gerar Plano com IA</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500 text-xs bg-[#07080d]">
              Selecione um arquivo na barra lateral para começar a editar.
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
                <span>
                  {projectState.projectProfile === 'web'
                    ? 'Preview Web'
                    : projectState.projectProfile === 'python'
                    ? 'Visualização / UI'
                    : projectState.projectProfile === 'fivem'
                    ? 'Preview NUI'
                    : 'Preview de Interface'}
                </span>
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
                <span>
                  {projectState.projectProfile === 'python'
                    ? 'Terminal Python'
                    : projectState.projectProfile === 'web'
                    ? 'Terminal / Build'
                    : projectState.projectProfile === 'fivem'
                    ? 'Console FiveM'
                    : 'Terminal de Execução'}
                </span>
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
                        Sandboxed Preview ({htmlFile.name})
                      </span>
                    </div>
                  </div>
                  <iframe
                    title="Sandbox Preview"
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
                  <h3 className="text-sm font-bold text-white mb-1">
                    {projectState.previewType === 'console'
                      ? 'Projeto focado em Terminal / CLI'
                      : 'Nenhum arquivo HTML encontrado'}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-sm mb-4">
                    {projectState.previewType === 'console'
                      ? 'Este projeto executa via scripts ou terminal. Utilize o console interativo para testar os módulos e visualizar saídas.'
                      : 'Crie um arquivo como index.html para visualizar a interface web ou NUI em tempo real.'}
                  </p>
                  {projectState.previewType === 'console' ? (
                    <button
                      type="button"
                      onClick={() => setSandboxSubTab('terminal')}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer hover:bg-emerald-500 transition-colors shadow-sm"
                    >
                      Abrir Terminal de Execução
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setNewFileName('index.html');
                        setShowNewFileModal(true);
                        setActiveTab('files');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold cursor-pointer hover:bg-indigo-500 transition-colors shadow-sm"
                    >
                      + Criar index.html
                    </button>
                  )}
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

              {/* Quick diagnostic command pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto py-2 shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-500 shrink-0">Comandos:</span>
                {['/check', '/files', '/stats', '/help', '/clear'].map((cmd) => (
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
                    placeholder="Digite um comando (ou use /help)..."
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
            {filteredRagDocs.length === 0 ? (
              <div className="p-8 text-center bg-[#0e111a] rounded-2xl border border-white/[0.06] select-none">
                <FileText className="w-10 h-10 text-amber-400 mx-auto mb-2 opacity-60" />
                <h4 className="text-sm font-bold text-white mb-1">Nenhum Documento Indexado</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Esta sala não possui documentos RAG pré-carregados. Indexe documentações técnicas, APIs ou manuais para orientar a IA.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNewDocModal(true)}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Indexar Primeiro Documento</span>
                </button>
              </div>
            ) : (
              filteredRagDocs.map((doc) => (
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
              ))
            )}
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

            {projectState.agents.length === 0 ? (
              <div className="p-8 text-center bg-[#0e111a] rounded-2xl border border-white/[0.06] select-none">
                <Bot className="w-10 h-10 text-indigo-400 mx-auto mb-2 opacity-60" />
                <h4 className="text-sm font-bold text-white mb-1">Nenhum Agente Configurado</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Esta sala foi iniciada em branco. Você pode carregar uma equipe sugerida baseada no perfil da sala ou adicionar agentes conforme sua preferência.
                </p>
                <div className="flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const suggested = projectService.getProfile(projectState.projectProfile || 'web').agents;
                      onUpdateState({ agents: suggested });
                    }}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/30 cursor-pointer inline-flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Carregar Equipe Sugerida</span>
                  </button>
                </div>
              </div>
            ) : (
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
            )}
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
