import React, { useState, useEffect } from 'react';
import { Key, Shield, Check, X, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import { ProjectRoomState, ProjectLLMProvider } from '../../types';
import { projectService, LLMKeyConfig } from '../../services/projectService';

interface ProjectLLMSettingsModalProps {
  projectState: ProjectRoomState;
  onUpdateState: (partial: Partial<ProjectRoomState>) => void;
  onClose: () => void;
}

export const ProjectLLMSettingsModal: React.FC<ProjectLLMSettingsModalProps> = ({
  projectState,
  onUpdateState,
  onClose,
}) => {
  const [keys, setKeys] = useState<LLMKeyConfig>(() => projectService.getStoredApiKeys());
  const [selectedProvider, setSelectedProvider] = useState<ProjectLLMProvider>(projectState.selectedProvider || 'gemini');
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    const m = projectState.selectedModel;
    if (!m || m === 'gemini-2.5-flash' || m === 'gemini-2.5-pro' || m === 'gemini-2.0-flash' || m === 'gemini-3.6-flash') {
      return 'gemini-flash-latest';
    }
    return m;
  });
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    // Sync when provider changes to set sensible default model
    if (
      selectedProvider === 'gemini' &&
      (!selectedModel.startsWith('gemini') || selectedModel === 'gemini-2.5-flash' || selectedModel === 'gemini-2.5-pro' || selectedModel === 'gemini-3.6-flash')
    ) {
      setSelectedModel('gemini-flash-latest');
    } else if (selectedProvider === 'openai' && !selectedModel.startsWith('gpt')) {
      setSelectedModel('gpt-4o');
    } else if (selectedProvider === 'claude' && !selectedModel.startsWith('claude')) {
      setSelectedModel('claude-3-5-sonnet-20241022');
    } else if (selectedProvider === 'groq' && !selectedModel.includes('llama')) {
      setSelectedModel('llama-3.3-70b-versatile');
    } else if (selectedProvider === 'deepseek' && !selectedModel.includes('deepseek')) {
      setSelectedModel('deepseek-chat');
    } else if (selectedProvider === 'custom' && (selectedModel === 'gemini-2.5-flash' || selectedModel === 'gemini-3.8-flash' || selectedModel === 'gemini-flash-latest')) {
      setSelectedModel('llama3');
    }
  }, [selectedProvider]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    projectService.saveStoredApiKeys(keys);

    // Determine current key for the selected provider
    let activeKey = '';
    if (selectedProvider === 'gemini') activeKey = keys.geminiKey || '';
    else if (selectedProvider === 'openai') activeKey = keys.openaiKey || '';
    else if (selectedProvider === 'claude') activeKey = keys.claudeKey || '';
    else if (selectedProvider === 'groq') activeKey = keys.groqKey || '';
    else if (selectedProvider === 'deepseek') activeKey = keys.deepseekKey || '';

    onUpdateState({
      selectedProvider,
      selectedModel,
      customApiKey: activeKey,
      customBaseUrl: keys.customBaseUrl,
    });

    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 800);
  };

  return (
    <div
      id="modal-project-llm-settings"
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        className="bg-[#0e111a] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-white/[0.06] bg-[#090b10] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                Configurar Modelos & Chaves de IA
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  BYOK
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Escolha o provedor de IA da Sala de Projeto e gerencie suas chaves privadas.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/[0.06] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Provider Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              Provedor Ativo para a Sala
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'gemini', name: 'Google Gemini', tag: 'Recomendado', color: 'from-blue-600 to-indigo-600' },
                { id: 'openai', name: 'OpenAI (GPT-4o)', tag: 'BYOK', color: 'from-emerald-600 to-teal-600' },
                { id: 'claude', name: 'Anthropic Claude', tag: 'BYOK', color: 'from-amber-600 to-orange-600' },
                { id: 'groq', name: 'Groq (Llama Ultra)', tag: 'Ultra Rápido', color: 'from-rose-600 to-pink-600' },
                { id: 'deepseek', name: 'DeepSeek-V3', tag: 'BYOK', color: 'from-cyan-600 to-blue-600' },
                { id: 'custom', name: 'Ollama / Local', tag: 'Local Host', color: 'from-purple-600 to-indigo-600' },
              ].map((p) => {
                const isSelected = selectedProvider === p.id;
                return (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setSelectedProvider(p.id as ProjectLLMProvider)}
                    className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 shadow-md shadow-indigo-600/10'
                        : 'bg-[#131622] border-white/[0.06] hover:bg-[#181c2b] text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs text-white truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center justify-between">
                      <span className="truncate">{p.tag}</span>
                      {isSelected && <Check className="w-3 h-3 text-indigo-400" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Modelo Selecionado
            </label>
            {selectedProvider === 'gemini' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="gemini-flash-latest">Gemini Flash (Estável e Ultrarrápido - Recomendado)</option>
                <option value="gemini-3.8-flash">Gemini 3.8 Flash (Nova Geração)</option>
                <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Leve e Eficiente)</option>
              </select>
            )}

            {selectedProvider === 'openai' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="gpt-4o">GPT-4o (Mais recente, alta precisão)</option>
                <option value="gpt-4o-mini">GPT-4o Mini (Econômico e rápido)</option>
                <option value="o1-mini">o1-mini (Raciocínio lógico detalhado)</option>
              </select>
            )}

            {selectedProvider === 'claude' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet (Referência em programação e refatoração)</option>
                <option value="claude-3-5-haiku-20241022">Claude 3.5 Haiku (Rápido e responsivo)</option>
              </select>
            )}

            {selectedProvider === 'groq' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Groq LPU - Respostas instantâneas)</option>
                <option value="mixtral-8x7b-32768">Mixtral 8x7B (32k context)</option>
              </select>
            )}

            {selectedProvider === 'deepseek' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="deepseek-chat">DeepSeek-V3 (Ótimo em código e raciocínio)</option>
                <option value="deepseek-reasoner">DeepSeek-R1 (Raciocínio profundo e cadeias de pensamento)</option>
              </select>
            )}

            {selectedProvider === 'custom' && (
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nome do modelo local (ex: llama3:latest, codellama, qwen2.5-coder)"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
                <div>
                  <label className="block text-[11px] text-slate-400 font-semibold mb-1">
                    URL Base da API (Ollama / LocalAI / vLLM):
                  </label>
                  <input
                    type="text"
                    placeholder="http://localhost:11434"
                    value={keys.customBaseUrl || ''}
                    onChange={(e) => setKeys((prev) => ({ ...prev, customBaseUrl: e.target.value }))}
                    className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 font-mono text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* API Keys Configuration (BYOK) */}
          <div className="space-y-3 border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Chaves de API Pessoais (Armazenadas com Segurança no Navegador)
              </span>
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400 font-medium">Google Gemini API Key (Opcional se houver no servidor):</span>
                  <span className="text-slate-500 font-mono">Google AI Studio</span>
                </div>
                <input
                  type="password"
                  placeholder="AIzaSy..."
                  value={keys.geminiKey || ''}
                  onChange={(e) => setKeys((prev) => ({ ...prev, geminiKey: e.target.value }))}
                  className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400 font-medium">OpenAI API Key:</span>
                  <span className="text-slate-500 font-mono">sk-proj-...</span>
                </div>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={keys.openaiKey || ''}
                  onChange={(e) => setKeys((prev) => ({ ...prev, openaiKey: e.target.value }))}
                  className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400 font-medium">Anthropic Claude API Key:</span>
                  <span className="text-slate-500 font-mono">sk-ant-...</span>
                </div>
                <input
                  type="password"
                  placeholder="sk-ant-..."
                  value={keys.claudeKey || ''}
                  onChange={(e) => setKeys((prev) => ({ ...prev, claudeKey: e.target.value }))}
                  className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] mb-1 text-slate-400 font-medium">Groq API Key:</div>
                  <input
                    type="password"
                    placeholder="gsk_..."
                    value={keys.groqKey || ''}
                    onChange={(e) => setKeys((prev) => ({ ...prev, groqKey: e.target.value }))}
                    className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <div className="text-[11px] mb-1 text-slate-400 font-medium">DeepSeek API Key:</div>
                  <input
                    type="password"
                    placeholder="sk-..."
                    value={keys.deepseekKey || ''}
                    onChange={(e) => setKeys((prev) => ({ ...prev, deepseekKey: e.target.value }))}
                    className="w-full bg-[#131622] border border-white/[0.08] rounded-xl px-3.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer buttons */}
          <div className="pt-2 flex items-center justify-between border-t border-white/[0.06]">
            <span className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Chaves salvas localmente no seu navegador
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={`px-5 py-2 rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-lg ${
                  savedSuccess ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-600/30'
                }`}
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Salvo com Sucesso!
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" /> Salvar Configurações
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
