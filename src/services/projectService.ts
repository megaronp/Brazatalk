import JSZip from 'jszip';
import { db, doc, getDoc, setDoc, getDocs, deleteDoc, collection, onSnapshot, auth, runTransaction } from './firebase';
import {
  ProjectRoomState,
  ProjectFile,
  ProjectAgent,
  ProjectRagDoc,
  ProjectLLMProvider,
  ProjectActionPlan,
  InterAgentMessage,
  ProjectAgentActivity,
  ProjectPendingQuestion,
  ProjectProfile,
  ProjectProfileId,
  FileSaveResult,
  FilePresenceUser,
} from '../types';

async function getAuthHeader(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch {}
  return headers;
}

const LOCAL_STORAGE_KEY_PREFIX = 'braza_project_room_';
const API_KEYS_STORAGE_KEY = 'braza_llm_api_keys';

export interface LLMKeyConfig {
  geminiKey?: string;
  openaiKey?: string;
  claudeKey?: string;
  groqKey?: string;
  deepseekKey?: string;
  customBaseUrl?: string;
}

// -------------------------------------------------------------
// Catalog of Project Profiles (Data-driven profiles)
// -------------------------------------------------------------
export const projectProfiles: Record<ProjectProfileId, ProjectProfile> = {
  web: {
    id: 'web',
    name: 'Web App / Full-stack',
    engine: 'Web / React & TypeScript',
    description: 'Aplicações web modernas com interface reativa, componentes e lógica client/server.',
    previewType: 'web',
    contextInstructions: 'Foco em desenvolvimento web moderno, componentes limpos, boas práticas de acessibilidade e performance.',
    agents: [
      {
        id: 'agent-frontend',
        name: 'Engenheiro Frontend',
        handle: '@frontend',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=frontend-expert',
        role: 'Líder de Interface, Design System e Componentes',
        color: '#38bdf8',
        skills: ['HTML5 Semântico', 'CSS / Tailwind Moderno', 'Componentização Reativa', 'UI/UX Responsivo'],
        systemPrompt: 'Você é o engenheiro frontend líder. Seu código é moderno, modular, acessível e otimizado para navegadores desktop e mobile.',
      },
      {
        id: 'agent-backend',
        name: 'Engenheiro Backend & Dados',
        handle: '@backend',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=backend-architect',
        role: 'Arquiteto de APIs, Lógica de Negócio e Dados',
        color: '#f59e0b',
        skills: ['APIs REST & JSON', 'Validação de Dados', 'Estruturas Assíncronas', 'Tratamento de Exceções'],
        systemPrompt: 'Você é responsável pela lógica de negócio e manipulação de dados. Você estrutura respostas claras, valida entradas e assegura segurança de ponta a ponta.',
      },
      {
        id: 'agent-qa',
        name: 'Analista de QA & Segurança',
        handle: '@qa',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=qa-specialist',
        role: 'Auditor de Código, Testes e Qualidade',
        color: '#ec4899',
        skills: ['Revisão de Código', 'Auditoria de Segurança Web', 'Testes de Borda', 'Performance de Renderização'],
        systemPrompt: 'Você é o auditor de qualidade e testes. Você revisa scripts e arquivos procurando por vazamentos de memória, erros de runtime e conformidade.',
      },
    ],
    ragDocs: [
      {
        id: 'doc-web-standards',
        title: 'Padrões de Desenvolvimento Web Responsivo',
        gameEngine: 'Web / React & TypeScript',
        tags: ['html', 'css', 'javascript', 'responsive'],
        content: `// Boas práticas Web:
- Estruture marcação semântica (header, main, section, footer).
- Estilize com variáveis e classes fluidas.
- Trate sempre estados de carregamento e erro em chamadas assíncronas.
- Mantenha funções pequenas e com responsabilidade única.`,
        uploadedAt: Date.now() - 60000,
      },
    ],
    seedFiles: [
      {
        id: 'file-web-index',
        name: 'index.html',
        path: 'index.html',
        language: 'html',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Engenheiro Frontend',
        content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Aplicação Web - Braza Talk</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <div class="app-container">
    <header class="app-header">
      <h1>🚀 Aplicação Web Colaborativa</h1>
      <p>Desenvolvida na Sala de Projeto do Braza Talk</p>
    </header>

    <main class="app-card">
      <h2>Painel de Controle</h2>
      <p class="description">Esta interface interativa é executada em tempo real no Sandbox Web.</p>
      
      <div class="interactive-box">
        <button id="btnAction" class="btn-primary">Executar Ação</button>
        <div id="outputLog" class="log-output">Pronto para interagir.</div>
      </div>
    </main>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        id: 'file-web-style',
        name: 'style.css',
        path: 'style.css',
        language: 'css',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Engenheiro Frontend',
        content: `* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #f8fafc;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.app-container {
  width: 100%;
  max-width: 540px;
}

.app-header {
  margin-bottom: 24px;
  text-align: center;
}

.app-header h1 {
  font-size: 22px;
  color: #38bdf8;
  margin-bottom: 6px;
}

.app-header p {
  font-size: 14px;
  color: #94a3b8;
}

.app-card {
  background: #1e293b;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
}

.app-card h2 {
  font-size: 18px;
  margin-bottom: 8px;
  color: #f1f5f9;
}

.description {
  font-size: 13px;
  color: #94a3b8;
  margin-bottom: 20px;
}

.btn-primary {
  background: #0284c7;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 10px 18px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.2s;
}

.btn-primary:hover {
  background: #0369a1;
}

.log-output {
  margin-top: 16px;
  background: #090d16;
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 12px;
  font-family: monospace;
  font-size: 12px;
  color: #34d399;
  min-height: 48px;
}`,
      },
      {
        id: 'file-web-js',
        name: 'app.js',
        path: 'app.js',
        language: 'javascript',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Engenheiro Backend & Dados',
        content: `// Lógica principal da aplicação web
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnAction');
  const log = document.getElementById('outputLog');

  let clickCount = 0;

  if (btn && log) {
    btn.addEventListener('click', () => {
      clickCount++;
      const now = new Date().toLocaleTimeString();
      log.textContent = \`[\${now}] Ação disparada com sucesso! Total de execuções: \${clickCount}\`;
    });
  }
});`,
      },
      {
        id: 'file-web-readme',
        name: 'README.md',
        path: 'README.md',
        language: 'markdown',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Analista de QA & Segurança',
        content: `# Projeto Web Colaborativo

Aplicação desenvolvida de forma colaborativa com inteligência artificial no **Braza Talk**.

## Estrutura de Arquivos
- \`index.html\`: Interface principal do usuário (renderizada na aba Preview Web).
- \`style.css\`: Folha de estilos e regras visuais responsivas.
- \`app.js\`: Lógica reativa da aplicação.

## Pré-visualização
Abra a aba **Preview Web** na Sala de Projeto para visualizar a interface interativa em tempo real.`,
      },
    ],
  },

  python: {
    id: 'python',
    name: 'Python & Análise de Dados',
    engine: 'Python 3 / Data Science & Scripts',
    description: 'Processamento de dados, automação, scripts analíticos e algoritmos em Python.',
    previewType: 'console',
    contextInstructions: 'Foco em Python 3 limpo, tipagem (type hints), tratamento de exceções e modularidade.',
    agents: [
      {
        id: 'agent-dataeng',
        name: 'Engenheiro de Dados Python',
        handle: '@dataeng',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=python-engineer',
        role: 'Especialista em Pipelines, Scripts e Estrutura de Dados',
        color: '#38bdf8',
        skills: ['Python 3 Idiomático', 'Manipulação de CSV/JSON', 'Estruturação de Classes', 'Automação'],
        systemPrompt: 'Você é um engenheiro de software sênior focado em Python 3. Seu código é limpo, utiliza type hints e segue PEP 8 rigorosamente.',
      },
      {
        id: 'agent-analyst',
        name: 'Cientista de Dados',
        handle: '@analyst',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=data-scientist',
        role: 'Modelagem Estatística, Agregação e Métricas',
        color: '#f59e0b',
        skills: ['Cálculo Estatístico', 'Transformação de Dados', 'Métricas de Performance', 'Estruturação de Resultados'],
        systemPrompt: 'Você é responsável pela lógica analítica e regras de negócio de dados. Você estrutura saídas concisas, métricas legíveis e relatórios estruturados.',
      },
      {
        id: 'agent-auditor-py',
        name: 'Revisor de Código & Testes',
        handle: '@auditor',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=py-auditor',
        role: 'Auditoria PEP8, Segurança e Otimização',
        color: '#ec4899',
        skills: ['Validação PEP 8', 'Otimização de Memória', 'Tratamento de Falhas', 'Casos de Teste'],
        systemPrompt: 'Você é o auditor de qualidade e testes. Você analisa o código Python em busca de gargalos, erros de índice ou falta de tratamento de exceções.',
      },
    ],
    ragDocs: [
      {
        id: 'doc-py-best-practices',
        title: 'Guia de Boas Práticas Python 3 & PEP 8',
        gameEngine: 'Python 3 / Data Science & Scripts',
        tags: ['python', 'pep8', 'typehints', 'clean-code'],
        content: `// Boas práticas Python:
- Use type hints nas assinaturas de funções: def process(data: dict) -> list[str]:
- Use blocos try/except específicos, nunca except genérico puro sem log.
- Utilize context managers com with open(...) as f: para manipulação de arquivos.
- Mantenha o main.py organizado com if __name__ == '__main__':`,
        uploadedAt: Date.now() - 80000,
      },
    ],
    seedFiles: [
      {
        id: 'file-py-main',
        name: 'main.py',
        path: 'main.py',
        language: 'python',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Engenheiro de Dados Python',
        content: `"""
Projeto de Processamento e Análise de Dados
Desenvolvido colaborativamente no Braza Talk
"""
from typing import List, Dict, Any
import json
import time

def process_data_records(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Processa e consolida métricas a partir dos registros informados."""
    if not records:
        return {"total": 0, "status": "sem registros"}

    total_value = sum(item.get("valor", 0) for item in records)
    average_value = total_value / len(records)

    return {
        "total_registros": len(records),
        "valor_acumulado": round(total_value, 2),
        "media_valor": round(average_value, 2),
        "processado_em": time.strftime("%Y-%m-%d %H:%M:%S")
    }

def main() -> None:
    sample_dataset = [
        {"id": 1, "nome": "Registro Alfa", "valor": 150.50},
        {"id": 2, "nome": "Registro Beta", "valor": 320.00},
        {"id": 3, "nome": "Registro Gama", "valor": 89.90},
    ]

    print("=" * 50)
    print("Iniciando pipeline de processamento de dados...")
    print(f"Total de registros de entrada: {len(sample_dataset)}")
    
    results = process_data_records(sample_dataset)
    print("Resultados consolidados:")
    print(json.dumps(results, indent=2, ensure_ascii=False))
    print("Pipeline finalizado com sucesso.")
    print("=" * 50)

if __name__ == "__main__":
    main()
`,
      },
      {
        id: 'file-py-requirements',
        name: 'requirements.txt',
        path: 'requirements.txt',
        language: 'text',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Engenheiro de Dados Python',
        content: `# Dependências do projeto Python
# Adicione bibliotecas conforme o avanço do projeto
requests>=2.31.0
pytest>=8.0.0
`,
      },
      {
        id: 'file-py-readme',
        name: 'README.md',
        path: 'README.md',
        language: 'markdown',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Revisor de Código & Testes',
        content: `# Projeto Python & Análise de Dados

Módulo de análise e automação desenvolvido de forma colaborativa no **Braza Talk**.

## Como Executar
\`\`\`bash
python3 -m venv venv
source venv/bin/activate # ou venv\\Scripts\\activate no Windows
pip install -r requirements.txt
python3 main.py
\`\`\`

## Saída & Validação
Utilize o **Terminal de Execução** na Sala de Projeto para simular execuções e testar funções.`,
      },
    ],
  },

  fivem: {
    id: 'fivem',
    name: 'GTA FiveM Mod',
    engine: 'GTA FiveM / Lua',
    description: 'Recursos multiplayer, scripts client/server, economia e NUI para servidores FiveM.',
    previewType: 'none',
    contextInstructions: 'Foco em FiveM FXv2, scripts client/server seguros, validação de source e economia balanceada.',
    agents: [
      {
        id: 'agent-scriptmaster',
        name: 'ScriptMaster Lua',
        handle: '@scriptmaster',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=scriptmaster',
        role: 'Desenvolvedor Líder de Scripts e Lógica de Rede',
        color: '#38bdf8',
        skills: ['Sintaxe Lua / FiveM Natives', 'Eventos Net/Client/Server', 'Otimização de Tick/Resmon'],
        systemPrompt: 'Você é um engenheiro sênior especializado em criar scripts FiveM e mods multiplayer. Seu código é seguro contra cheaters, utiliza boas práticas de ticks e eventos registrados corretamente.',
      },
      {
        id: 'agent-balanceador',
        name: 'Balanceador de Config',
        handle: '@balanceador',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=balanceador',
        role: 'Especialista em Tabelas, JSON, Preços e Itens',
        color: '#f59e0b',
        skills: ['Estruturação de JSON/Lua Config', 'Balanceamento de Economia', 'Tabelas de Itens e Veículos'],
        systemPrompt: 'Você é responsável pelos arquivos de configuração. Você estrutura variáveis claras, comentários didáticos e tabelas organizadas.',
      },
      {
        id: 'agent-auditor',
        name: 'Auditor de Segurança',
        handle: '@auditor',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=auditor',
        role: 'Auditor de Código, Anti-Exploit e Resmon',
        color: '#ec4899',
        skills: ['Auditoria Anti-Cheat', 'Validação de Argumentos Server-Side', 'Análise de Desempenho e Bugs'],
        systemPrompt: 'Você é o auditor de qualidade e segurança FiveM. Você analisa códigos em busca de loops infinitos e vulnerabilidades onde jogadores mal-intencionados poderiam disparar ServerEvents com valores forjados.',
      },
    ],
    ragDocs: [
      {
        id: 'doc-fivem-guide',
        title: 'Guia de Eventos e Manifest FiveM (FXv2)',
        gameEngine: 'GTA FiveM / Lua',
        tags: ['fivem', 'lua', 'fxmanifest', 'events'],
        content: `// Estrutura padrão fxmanifest.lua
fx_version 'cerulean'
game 'gta5'

author 'Braza Talk ModDev'
description 'Mod Colaborativo desenvolvido na Sala de Projeto Braza Talk'
version '1.0.0'

client_scripts {
    'config.lua',
    'client.lua'
}

server_scripts {
    'config.lua',
    'server.lua'
}

// Boas práticas de eventos no FiveM:
- Nunca confie em dados enviados pelo cliente para dar dinheiro ou itens.
- Valide source no server: local src = source
- Use RegisterNetEvent('meumod:evento', function(...) end)`,
        uploadedAt: Date.now() - 100000,
      },
    ],
    seedFiles: [
      {
        id: 'file-manifest',
        name: 'fxmanifest.lua',
        path: 'fxmanifest.lua',
        language: 'lua',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'ScriptMaster Lua',
        content: `fx_version 'cerulean'
game 'gta5'

author 'Equipe Braza Talk'
description 'Recurso FiveM Criado na Sala de Projeto'
version '1.0.0'

client_scripts {
    'client.lua'
}

server_scripts {
    'server.lua'
}
`,
      },
      {
        id: 'file-client',
        name: 'client.lua',
        path: 'client.lua',
        language: 'lua',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'ScriptMaster Lua',
        content: `--[[
    Recurso FiveM - Client-side
--]]
RegisterCommand('meumod', function()
    local ped = PlayerPedId()
    local coords = GetEntityCoords(ped)
    print(('[Braza Talk Mod] Comando executado nas coordenadas: %s'):format(coords))
end, false)
`,
      },
      {
        id: 'file-server',
        name: 'server.lua',
        path: 'server.lua',
        language: 'lua',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'ScriptMaster Lua',
        content: `--[[
    Recurso FiveM - Server-side com verificação de source
--]]
RegisterNetEvent('braza:server:verificarAcao', function(dados)
    local src = source
    if not src or src <= 0 then return end
    print(('[Segurança] Ação verificada para player ID %s'):format(src))
end)
`,
      },
      {
        id: 'file-config',
        name: 'config.json',
        path: 'config.json',
        language: 'json',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Balanceador de Config',
        content: `{
  "recurso": "braza_mod",
  "versao": "1.0.0",
  "habilitado": true,
  "taxas": {
    "padrao": 100
  }
}`,
      },
    ],
  },

  generic: {
    id: 'generic',
    name: 'Projeto Geral / Software',
    engine: 'Geral / Multi-linguagem',
    description: 'Projetos de software geral, ferramentas CLI, algoritmos ou documentação.',
    previewType: 'console',
    contextInstructions: 'Foco em arquitetura limpa, código legível e documentação objetiva.',
    agents: [
      {
        id: 'agent-architect',
        name: 'Arquiteto de Software',
        handle: '@arquiteto',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=architect',
        role: 'Líder Técnico e Estrutura de Soluções',
        color: '#38bdf8',
        skills: ['Arquitetura de Software', 'Clean Architecture', 'Modelagem de Domínio', 'Definição de Interfaces'],
        systemPrompt: 'Você é o arquiteto de software líder. Você estrutura pastas, contratos, separação de camadas e boas práticas de engenharia.',
      },
      {
        id: 'agent-developer',
        name: 'Desenvolvedor Full-Stack',
        handle: '@desenvolvedor',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=developer',
        role: 'Implementação de Funcionalidades e Algoritmos',
        color: '#f59e0b',
        skills: ['Implementação Técnica', 'Algoritmos & Lógica', 'Estruturação de Dados', 'Refatoração'],
        systemPrompt: 'Você é responsável por implementar código funcional, conciso e bem testado.',
      },
      {
        id: 'agent-reviewer',
        name: 'Revisor de Código & Testes',
        handle: '@revisor',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=reviewer',
        role: 'Garantia de Qualidade e Boas Práticas',
        color: '#ec4899',
        skills: ['Code Review', 'Identificação de Bugs', 'Testes de Unidade', 'Documentação'],
        systemPrompt: 'Você é o revisor de qualidade. Você analisa o código em busca de clareza, manutenibilidade e segurança.',
      },
    ],
    ragDocs: [
      {
        id: 'doc-clean-code',
        title: 'Princípios de Clean Code e Arquitetura Limpa',
        gameEngine: 'Geral / Multi-linguagem',
        tags: ['architecture', 'cleancode', 'patterns'],
        content: `// Princípios de desenvolvimento:
1. Nomes claros e autoexplicativos para funções e variáveis.
2. Funções pequenas com objetivo único.
3. Não repita a si mesmo (DRY).
4. Separação clara de responsabilidades (SOLID).`,
        uploadedAt: Date.now() - 50000,
      },
    ],
    seedFiles: [
      {
        id: 'file-gen-readme',
        name: 'README.md',
        path: 'README.md',
        language: 'markdown',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Arquiteto de Software',
        content: `# Projeto de Software Colaborativo

Projeto criado na Sala de Projeto com IA do **Braza Talk**.

## Visão Geral
Utilize este workspace para conceber, desenvolver e testar soluções em equipe.
`,
      },
      {
        id: 'file-gen-config',
        name: 'config.json',
        path: 'config.json',
        language: 'json',
        version: 1,
        updatedAt: Date.now(),
        updatedBy: 'Desenvolvedor Full-Stack',
        content: `{
  "projectName": "Projeto Colaborativo",
  "version": "1.0.0",
  "environment": "development"
}`,
      },
    ],
  },
};

// Default agents export for backward compatibility
export const defaultAgents: ProjectAgent[] = projectProfiles.web.agents;
export const defaultRagDocs: ProjectRagDoc[] = projectProfiles.web.ragDocs;
export const defaultFiles: ProjectFile[] = projectProfiles.web.seedFiles;

export const projectService = {
  getAllProjectProfiles(): ProjectProfile[] {
    return Object.values(projectProfiles);
  },

  getProfile(profileId?: ProjectProfileId): ProjectProfile {
    if (profileId && projectProfiles[profileId]) {
      return projectProfiles[profileId];
    }
    return projectProfiles.web;
  },

  getProjectProfile(profileId?: ProjectProfileId): ProjectProfile {
    return this.getProfile(profileId);
  },

  getBlankProjectState(
    channelId: string,
    channelName?: string,
    options?: {
      description?: string;
      gameEngine?: string;
      profileId?: ProjectProfileId;
      previewType?: 'web' | 'console' | 'none';
      serverId?: string;
    }
  ): ProjectRoomState {
    const defaultSavedKeys = this.getStoredApiKeys();
    const profileId = options?.profileId || 'generic';
    const profile = this.getProfile(profileId);

    return {
      channelId,
      serverId: options?.serverId,
      projectName: channelName ? channelName.replace(/[_-]/g, ' ') : 'Novo Projeto',
      projectProfile: profileId,
      gameEngine: options?.gameEngine || profile.engine || 'Geral / Código',
      previewType: options?.previewType || profile.previewType || 'web',
      targetDescription: options?.description || '',
      guardrails: '',
      selectedProvider: 'gemini',
      selectedModel: 'gemini-flash-latest',
      customApiKey: defaultSavedKeys.geminiKey || '',
      customBaseUrl: defaultSavedKeys.customBaseUrl || '',
      agents: [],
      ragDocs: [],
      files: [],
      activeFileId: '',
      testConsoleLogs: [],
      actionPlan: undefined,
      agenticActivities: {},
      interAgentDialogues: [],
      pendingUserQuestion: null,
      updatedAt: Date.now(),
    };
  },

  getDefaultProjectState(channelId: string, channelName?: string, profileId: ProjectProfileId = 'generic'): ProjectRoomState {
    return this.getBlankProjectState(channelId, channelName, { profileId });
  },

  // Helper method if user explicitly requests to load profile presets
  applyProfileTemplate(state: ProjectRoomState, profileId: ProjectProfileId): ProjectRoomState {
    const profile = this.getProfile(profileId);
    return {
      ...state,
      projectProfile: profile.id,
      gameEngine: profile.engine,
      previewType: profile.previewType,
      targetDescription: state.targetDescription || profile.description,
      agents: profile.agents,
      ragDocs: profile.ragDocs,
      files: profile.seedFiles,
      activeFileId: profile.seedFiles[0]?.id || '',
      updatedAt: Date.now(),
    };
  },

  getStoredApiKeys(): LLMKeyConfig {
    try {
      const raw = localStorage.getItem(API_KEYS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  },

  saveStoredApiKeys(keys: LLMKeyConfig) {
    try {
      localStorage.setItem(API_KEYS_STORAGE_KEY, JSON.stringify(keys));
    } catch {}
  },

  sanitizeState(state: ProjectRoomState): ProjectRoomState {
    if (state && (state.selectedProvider === 'gemini' || !state.selectedProvider)) {
      if (
        !state.selectedModel ||
        state.selectedModel === 'gemini-2.5-flash' ||
        state.selectedModel === 'gemini-2.5-pro' ||
        state.selectedModel === 'gemini-2.0-flash' ||
        state.selectedModel === 'gemini-2.0-pro' ||
        state.selectedModel === 'gemini-1.5-flash' ||
        state.selectedModel === 'gemini-1.5-pro' ||
        state.selectedModel === 'gemini-3.6-flash'
      ) {
        state.selectedModel = 'gemini-flash-latest';
      }
    }
    return state;
  },

  // -----------------------------------------------------------------
  // Granular Subcollection File Management & Real-time Collaboration
  // -----------------------------------------------------------------
  subscribeToProjectFiles(channelId: string, onFiles: (files: ProjectFile[]) => void): () => void {
    try {
      const colRef = collection(db, 'projectRooms', channelId, 'files');
      return onSnapshot(
        colRef,
        (snap) => {
          const files: ProjectFile[] = [];
          snap.forEach((d) => {
            files.push({ id: d.id, ...d.data() } as ProjectFile);
          });
          files.sort((a, b) => a.name.localeCompare(b.name));
          onFiles(files);
        },
        (err) => {
          console.warn('subscribeToProjectFiles Firestore warning:', err);
        }
      );
    } catch (e) {
      console.warn('subscribeToProjectFiles setup error:', e);
      return () => {};
    }
  },

  async saveProjectFile(
    channelId: string,
    file: ProjectFile,
    baseVersion?: number,
    user?: { name?: string; userName?: string }
  ): Promise<FileSaveResult> {
    try {
      const fileRef = doc(db, 'projectRooms', channelId, 'files', file.id);

      let conflictResult: FileSaveResult | null = null;
      let savedFile: ProjectFile | null = null;

      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(fileRef);

        // Optimistic concurrency check inside atomic transaction
        if (snap.exists()) {
          const current = snap.data() as ProjectFile;
          const currentVersion = current.version || 1;
          if (baseVersion !== undefined && baseVersion < currentVersion) {
            conflictResult = {
              success: false,
              conflict: true,
              serverVersion: currentVersion,
              currentContent: current.content,
              message: `Conflito de edição: Este arquivo foi modificado por ${current.updatedBy || 'outro membro'} (Versão no servidor: V${currentVersion}, sua versão base: V${baseVersion}).`,
              file: current,
            };
            return;
          }
        }

        const nextVersion = snap.exists() ? (snap.data().version || 1) + 1 : (file.version || 1);
        const updatedFile: ProjectFile = {
          ...file,
          version: nextVersion,
          updatedAt: Date.now(),
          updatedBy: user?.name || user?.userName || 'Membro',
        };

        transaction.set(fileRef, updatedFile);
        savedFile = updatedFile;
      });

      if (conflictResult) {
        return conflictResult;
      }

      if (savedFile) {
        // Mirror to local cache for resilience
        try {
          const cachedStr = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + channelId);
          if (cachedStr) {
            const cached = JSON.parse(cachedStr);
            const currentFiles = Array.isArray(cached.files) ? cached.files : [];
            const idx = currentFiles.findIndex((f: any) => f.id === file.id);
            if (idx >= 0) {
              currentFiles[idx] = savedFile;
            } else {
              currentFiles.push(savedFile);
            }
            cached.files = currentFiles;
            localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + channelId, JSON.stringify(cached));
          }
        } catch {}

        return {
          success: true,
          file: savedFile,
        };
      }

      return {
        success: false,
        message: 'Falha ao salvar arquivo.',
      };
    } catch (e: any) {
      console.warn('saveProjectFile error:', e);
      return {
        success: false,
        message: e?.message || 'Erro ao salvar arquivo.',
      };
    }
  },

  async forceSaveProjectFile(
    channelId: string,
    file: ProjectFile,
    user?: { name?: string; userName?: string }
  ): Promise<FileSaveResult> {
    try {
      const fileRef = doc(db, 'projectRooms', channelId, 'files', file.id);
      const snap = await getDoc(fileRef);
      const currentVersion = snap.exists() ? (snap.data().version || 1) : 1;
      const nextVersion = currentVersion + 1;

      const updatedFile: ProjectFile = {
        ...file,
        version: nextVersion,
        updatedAt: Date.now(),
        updatedBy: user?.name || user?.userName || 'Membro',
      };

      await setDoc(fileRef, updatedFile);
      return {
        success: true,
        file: updatedFile,
      };
    } catch (e: any) {
      return {
        success: false,
        message: e?.message || 'Erro ao sobrescrever arquivo.',
      };
    }
  },

  async deleteProjectFile(channelId: string, fileId: string): Promise<void> {
    try {
      const fileRef = doc(db, 'projectRooms', channelId, 'files', fileId);
      await deleteDoc(fileRef);
    } catch (e) {
      console.warn('deleteProjectFile error:', e);
    }
  },

  async deleteProjectRoom(channelId: string): Promise<void> {
    // 1. Delete all files in subcollection
    try {
      const filesColRef = collection(db, 'projectRooms', channelId, 'files');
      const filesSnap = await getDocs(filesColRef);
      const deleteFilePromises = filesSnap.docs.map((d) => deleteDoc(d.ref));
      await Promise.all(deleteFilePromises);
    } catch (e) {
      console.warn('Failed to delete project room subcollection files:', e);
    }

    // 2. Delete root doc in Firestore
    try {
      const docRef = doc(db, 'projectRooms', channelId);
      await deleteDoc(docRef);
    } catch (e) {
      console.warn('Failed to delete project room doc:', e);
    }

    // 3. Clear localStorage cache
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY_PREFIX + channelId);
      localStorage.removeItem(`project_presence_${channelId}`);
    } catch {}

    // 4. Terminate autonomous runner and delete disk runner on server
    try {
      const headers = await getAuthHeader();
      await fetch(`/api/project/runner/${channelId}`, {
        method: 'DELETE',
        headers,
      });
    } catch (e) {
      console.warn('Failed to delete backend runner:', e);
    }
  },

  // -----------------------------------------------------------------
  // Room State Loading & Metadata Saving
  // -----------------------------------------------------------------
  async loadProjectState(channelId: string, channelName?: string, serverId?: string): Promise<ProjectRoomState> {
    let state: ProjectRoomState | null = null;

    // 1. Try Firestore root doc
    try {
      const docRef = doc(db, 'projectRooms', channelId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        state = snap.data() as ProjectRoomState;
      }
    } catch (e) {
      console.warn('Firestore loadProjectState doc warning:', e);
    }

    // 2. Try localStorage fallback
    if (!state) {
      try {
        const cached = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + channelId);
        if (cached) {
          state = JSON.parse(cached);
        }
      } catch {}
    }

    // 3. Fall back to default blank state
    if (!state) {
      state = this.getBlankProjectState(channelId, channelName, { serverId });
      this.saveProjectState(channelId, state).catch(() => {});
    } else if (serverId && !state.serverId) {
      state.serverId = serverId;
      this.saveProjectState(channelId, state).catch(() => {});
    }

    // 4. Load granular files from subcollection /projectRooms/{channelId}/files
    try {
      const colRef = collection(db, 'projectRooms', channelId, 'files');
      const filesSnap = await getDocs(colRef);
      const subcollectionFiles: ProjectFile[] = [];
      filesSnap.forEach((d) => {
        subcollectionFiles.push({ id: d.id, ...d.data() } as ProjectFile);
      });

      if (subcollectionFiles.length > 0) {
        state.files = subcollectionFiles;
      } else if (Array.isArray(state.files) && state.files.length > 0) {
        // Migration: migrate legacy embedded files array to granular subcollection
        for (const f of state.files) {
          const fileDoc = doc(db, 'projectRooms', channelId, 'files', f.id);
          await setDoc(fileDoc, f);
        }
      } else {
        // Keep files empty for blank project rooms
        state.files = [];
      }
    } catch (e) {
      console.warn('Error loading subcollection files:', e);
    }

    if (Array.isArray(state.files)) {
      state.files.sort((a, b) => a.name.localeCompare(b.name));
    }

    // Merge stored user API keys if not present in doc
    const storedKeys = this.getStoredApiKeys();
    if (!state.customApiKey && storedKeys.geminiKey) {
      state.customApiKey = storedKeys.geminiKey;
    }

    return this.sanitizeState(state);
  },

  async saveProjectState(channelId: string, state: ProjectRoomState): Promise<void> {
    const updatedState = { ...state, updatedAt: Date.now() };

    // Save to localStorage immediately for instant offline persistence
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + channelId, JSON.stringify(updatedState));
    } catch {}

    // Save room metadata to Firestore (STRIP files array to eliminate clobbering)
    try {
      const docRef = doc(db, 'projectRooms', channelId);
      const { customApiKey, files, ...safeCloudState } = updatedState;
      // Store without files array so files are strictly owned by subcollection /files
      await setDoc(docRef, safeCloudState, { merge: true });
    } catch (e) {
      console.warn('Firestore saveProjectState error:', e);
    }
  },

  async generateResponse(params: {
    prompt: string;
    mentionedAgentHandle?: string;
    projectState: ProjectRoomState;
    conversationHistory?: any[];
  }) {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/project/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha na chamada da IA (${res.status}): ${err}`);
    }

    return await res.json();
  },

  // Export all workspace files into a .ZIP archive
  async downloadProjectAsZip(projectState: ProjectRoomState) {
    const zip = new JSZip();

    projectState.files.forEach((file) => {
      zip.file(file.path || file.name, file.content);
    });

    if (!projectState.files.some((f) => f.name.toLowerCase().startsWith('readme'))) {
      const readmeContent = `# ${projectState.projectName}
**Contexto:** ${projectState.gameEngine || 'Projeto de Software'}
**Objetivo:** ${projectState.targetDescription}

Criado colaborativamente na Sala de Projeto com IA do **Braza Talk**.

## Arquivos incluídos:
${projectState.files.map((f) => `- \`${f.path || f.name}\` (${f.language})`).join('\n')}
`;
      zip.file('README.md', readmeContent);
    }

    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const safeName = (projectState.projectName || 'braza-project')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');

    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // Download a single file directly
  downloadSingleFile(file: ProjectFile) {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  },

  // 1. Generate autonomous action plan with AI
  async generatePlan(channelId: string, goal: string, projectState: ProjectRoomState): Promise<ProjectActionPlan> {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/project/plan/generate', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ channelId, goal, projectState }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao gerar plano de ação (${res.status}): ${err}`);
    }
    const data = await res.json();
    return data.plan;
  },

  // 2. Start / resume autonomous plan execution in background
  async startPlan(channelId: string, plan: ProjectActionPlan, projectState: ProjectRoomState) {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/project/plan/start', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ channelId, plan, projectState }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao iniciar execução do plano (${res.status}): ${err}`);
    }
    return await res.json();
  },

  // 3. Pause autonomous execution
  async pausePlan(channelId: string) {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/project/plan/pause', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ channelId }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao pausar plano (${res.status}): ${err}`);
    }
    return await res.json();
  },

  // 4. Answer pending agent doubt/question to resume execution
  async answerPlanQuestion(channelId: string, stepId: string, answer: string) {
    const authHeaders = await getAuthHeader();
    const res = await fetch('/api/project/plan/answer-question', {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ channelId, stepId, answer }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Falha ao enviar resposta da dúvida (${res.status}): ${err}`);
    }
    return await res.json();
  },

  // 5. Query active runner status from server
  async getPlanStatus(channelId: string) {
    try {
      const authHeaders = await getAuthHeader();
      const res = await fetch(`/api/project/plan/status/${channelId}`, {
        headers: authHeaders,
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  },
};
