import JSZip from 'jszip';
import { db, doc, getDoc, setDoc, auth } from './firebase';
import { ProjectRoomState, ProjectFile, ProjectAgent, ProjectRagDoc, ProjectLLMProvider, ProjectActionPlan, InterAgentMessage, ProjectAgentActivity, ProjectPendingQuestion } from '../types';

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

export const defaultAgents: ProjectAgent[] = [
  {
    id: 'agent-scriptmaster',
    name: 'ScriptMaster Lua',
    handle: '@scriptmaster',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=scriptmaster',
    role: 'Desenvolvedor Líder de Scripts e Lógica de Rede',
    color: '#38bdf8', // sky-400
    skills: ['Sintaxe Lua / FiveM Natives', 'Eventos Net/Client/Server', 'Otimização de Tick/Resmon'],
    systemPrompt: 'Você é um engenheiro sênior especializado em criar scripts FiveM e mods multiplayer. Seu código é seguro contra cheaters, utiliza boas práticas de ticks (Wait 0 apenas quando estritamente necessário) e eventos registrados corretamente.',
  },
  {
    id: 'agent-balanceador',
    name: 'Balanceador de Config',
    handle: '@balanceador',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=balanceador',
    role: 'Especialista em Tabelas, JSON, Preços e Itens',
    color: '#f59e0b', // amber-500
    skills: ['Estruturação de JSON/Lua Config', 'Balanceamento de Economia', 'Tabelas de Itens e Veículos'],
    systemPrompt: 'Você é responsável pelos arquivos de configuração (config.json, config.lua). Você estrutura variáveis claras, comentários didáticos para outros admins editarem valores e tabelas organizadas.',
  },
  {
    id: 'agent-auditor',
    name: 'Auditor de Segurança',
    handle: '@auditor',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=auditor',
    role: 'Auditor de Código, Anti-Exploit e Resmon',
    color: '#ec4899', // pink-500
    skills: ['Auditoria Anti-Cheat', 'Validação de Argumentos Server-Side', 'Análise de Desempenho e Bugs'],
    systemPrompt: 'Você é o auditor de qualidade e segurança. Você analisa códigos em busca de memory leaks, loops infinitos e vulnerabilidades onde jogadores mal-intencionados poderiam disparar ServerEvents com valores forjados.',
  },
];

export const defaultRagDocs: ProjectRagDoc[] = [
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
    'client.lua'
}

server_scripts {
    'server.lua'
}

shared_scripts {
    'config.lua'
}

// Boas práticas de eventos no FiveM:
- Nunca confie em dados enviados pelo cliente para dar dinheiro ou itens.
- Valide source no server: local src = source
- Use RegisterNetEvent('meumod:evento', function(...) end)`,
    uploadedAt: Date.now() - 100000,
  },
  {
    id: 'doc-native-audio',
    title: 'Integração de Áudio e Notificações',
    gameEngine: 'GTA FiveM / Lua',
    tags: ['audio', 'ui', 'notify'],
    content: `// Notificações e Sons nativos FiveM:
function ShowNotification(text)
    SetNotificationTextEntry("STRING")
    AddTextComponentString(text)
    DrawNotification(false, false)
end

// Tocar som de frontend nativo:
PlaySoundFrontend(-1, "CONFIRM_BEEP", "HUD_MINI_GAME_SOUNDSET", 1)`,
    uploadedAt: Date.now() - 50000,
  },
];

export const defaultFiles: ProjectFile[] = [
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
description 'Mod Colaborativo de Veículos e Garagem'
version '1.0.0'

client_scripts {
    'config.lua',
    'client.lua'
}

server_scripts {
    'config.lua',
    'server.lua'
}

ui_page 'html/index.html'

files {
    'html/index.html',
    'html/style.css',
    'html/script.js'
}`,
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
    Braza Talk - Mod Colaborativo
    Arquivo: client.lua
--]]

local inVehicle = false

-- Comando para spawnar veículo de teste configurado
RegisterCommand('spawncar', function(source, args, rawCommand)
    local vehicleName = args[1] or Config.DefaultVehicle or 'adder'
    local playerPed = PlayerPedId()
    local coords = GetEntityCoords(playerPed)
    local forward = GetEntityForwardVector(playerPed)

    local spawnCoords = coords + (forward * 3.0)

    -- Carregar modelo na memória
    local modelHash = GetHashKey(vehicleName)
    RequestModel(modelHash)
    while not HasModelLoaded(modelHash) do
        Wait(10)
    end

    -- Criar o veículo no mundo
    local vehicle = CreateVehicle(modelHash, spawnCoords.x, spawnCoords.y, spawnCoords.z, GetEntityHeading(playerPed), true, false)
    SetPedIntoVehicle(playerPed, vehicle, -1)
    SetModelAsNoLongerNeeded(modelHash)

    -- Notificar jogador
    print(("[Braza Talk Mod] Veículo '%s' criado com sucesso!"):format(vehicleName))
    TriggerEvent('braza:notify', "Veículo " .. vehicleName .. " entregue com sucesso!", "success")
end, false)

RegisterNetEvent('braza:notify', function(message, type)
    SetNotificationTextEntry("STRING")
    AddTextComponentString("~b~[Braza Talk]~s~ " .. message)
    DrawNotification(false, false)
end)`,
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
  "modName": "Braza Garagem & Spawner",
  "version": "1.0.0",
  "defaultVehicle": "adder",
  "allowedVehicles": [
    { "model": "adder", "displayName": "Truffade Adder", "price": 1000000 },
    { "model": "t20", "displayName": "Progen T20", "price": 1300000 },
    { "model": "sultan", "displayName": "Karin Sultan", "price": 45000 },
    { "model": "bati", "displayName": "Pegassi Bati 801", "price": 30000 }
  ],
  "soundEffects": true,
  "permissionLevel": "user",
  "maxVehiclesPerPlayer": 1
}`,
  },
  {
    id: 'file-preview-html',
    name: 'index.html',
    path: 'html/index.html',
    language: 'html',
    version: 1,
    updatedAt: Date.now(),
    updatedBy: 'Braza ModDev',
    content: `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Braza Mod UI Preview</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: radial-gradient(circle at top, #1e1b4b, #090b10);
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(12px);
      border-radius: 20px;
      padding: 24px;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h2 { font-size: 18px; margin-bottom: 8px; color: #38bdf8; display: flex; align-items: center; gap: 8px; }
    p { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    .vehicle-list { display: flex; flex-direction: column; gap: 10px; }
    .item {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      transition: all 0.2s;
    }
    .item:hover { background: rgba(99, 102, 241, 0.2); border-color: #6366f1; transform: translateY(-2px); }
    .name { font-size: 14px; font-weight: 600; }
    .price { font-size: 12px; color: #34d399; font-weight: 700; }
    .btn-spawn {
      margin-top: 16px;
      width: 100%;
      background: #4f46e5;
      color: white;
      border: none;
      padding: 12px;
      border-radius: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn-spawn:hover { background: #4338ca; }
    .log-box {
      margin-top: 16px;
      background: #020617;
      border-radius: 10px;
      padding: 10px;
      font-family: monospace;
      font-size: 11px;
      color: #cbd5e1;
      height: 60px;
      overflow-y: auto;
    }
  </style>
</head>
<body>
  <div class="card">
    <h2>⚡ Garagem Braza Talk</h2>
    <p>Painel NUI de Teste em tempo real do Mod</p>
    <div class="vehicle-list">
      <div class="item" onclick="selectCar('adder', '$ 1.000.000')">
        <span class="name">🏎️ Truffade Adder</span>
        <span class="price">$ 1.000.000</span>
      </div>
      <div class="item" onclick="selectCar('t20', '$ 1.300.000')">
        <span class="name">🏁 Progen T20</span>
        <span class="price">$ 1.300.000</span>
      </div>
      <div class="item" onclick="selectCar('bati', '$ 30.000')">
        <span class="name">🏍️ Pegassi Bati 801</span>
        <span class="price">$ 30.000</span>
      </div>
    </div>
    <button class="btn-spawn" onclick="spawnSelected()">Spawnar Veículo Selecionado</button>
    <div class="log-box" id="console-logs">> Pronto para testar. Selecione um veículo acima...</div>
  </div>

  <script>
    let currentCar = 'adder';
    function selectCar(model, price) {
      currentCar = model;
      log("Veículo selecionado: " + model + " (" + price + ")");
    }
    function spawnSelected() {
      log("⚡ [NUI -> Client] Disparando evento /spawncar " + currentCar);
      setTimeout(() => {
        log("✅ Veículo gerado na coordenada (0, 3, 0)!");
      }, 500);
    }
    function log(msg) {
      const box = document.getElementById('console-logs');
      if (box) {
        const line = document.createElement('div');
        line.textContent = msg;
        box.appendChild(line);
        box.scrollTop = box.scrollHeight;
      }
    }
  </script>
</body>
</html>`,
  },
];

export const projectService = {
  getDefaultProjectState(channelId: string, channelName?: string): ProjectRoomState {
    const defaultSavedKeys = this.getStoredApiKeys();
    const defaultPlan: ProjectActionPlan = {
      id: `plan-${channelId}`,
      goal: 'Criar sistema de garagem com spawn seguro, NUI e balanceamento de economia',
      status: 'idle',
      currentStepIndex: 0,
      steps: [
        {
          id: `step-${channelId}-1`,
          order: 1,
          title: 'Estruturar fxmanifest e carregar dependências',
          description: 'Criação do manifesto com scripts client/server e registro de versão.',
          assignedAgentHandle: '@scriptmaster',
          status: 'pending',
        },
        {
          id: `step-${channelId}-2`,
          order: 2,
          title: 'Implementar lógica de rede e spawn no client.lua',
          description: 'Eventos de spawn de veículo, verificação de vaga livre e prevenção de duplicatas.',
          assignedAgentHandle: '@scriptmaster',
          status: 'pending',
        },
        {
          id: `step-${channelId}-3`,
          order: 3,
          title: 'Configurar tabela de veículos e taxas em config.json',
          description: 'Definição de modelos permitidos, taxas de seguro e spawn.',
          assignedAgentHandle: '@balanceador',
          status: 'pending',
        },
        {
          id: `step-${channelId}-4`,
          order: 4,
          title: 'Auditoria de segurança anti-exploit e resmon',
          description: 'Proteção contra injeção de eventos forjados no server.lua e testes de performance.',
          assignedAgentHandle: '@auditor',
          status: 'pending',
        },
      ],
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };

    const initialActivities: Record<string, ProjectAgentActivity> = {
      '@scriptmaster': {
        agentHandle: '@scriptmaster',
        status: 'idle',
        thought: 'Aguardando início do plano de ação.',
        lastActiveAt: Date.now(),
      },
      '@balanceador': {
        agentHandle: '@balanceador',
        status: 'idle',
        thought: 'Pronto para balanceamento de tabelas e configs.',
        lastActiveAt: Date.now(),
      },
      '@auditor': {
        agentHandle: '@auditor',
        status: 'idle',
        thought: 'Monitorando segurança e consumo de resmon.',
        lastActiveAt: Date.now(),
      },
    };

    const initialDialogues: InterAgentMessage[] = [
      {
        id: 'dialogue-welcome-1',
        senderHandle: '@scriptmaster',
        senderName: 'ScriptMaster Lua',
        senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=scriptmaster',
        senderColor: '#38bdf8',
        recipientHandle: 'all',
        actionType: 'thought',
        content: 'Swarm de agentes ativo. O plano de ação está pronto para execução contínua em segundo plano.',
        timestamp: Date.now() - 30000,
      },
      {
        id: 'dialogue-welcome-2',
        senderHandle: '@auditor',
        senderName: 'Auditor de Segurança',
        senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=auditor',
        senderColor: '#ec4899',
        recipientHandle: '@scriptmaster',
        actionType: 'proposal',
        content: 'Estou com guardrails de resmon ativados. Caso surja alguma decisão de arquitetura, perguntaremos no chat e pausaremos com segurança.',
        timestamp: Date.now() - 20000,
      },
    ];

    return {
      channelId,
      projectName: channelName ? `Mod ${channelName}` : 'Projeto Mod GTA FiveM',
      gameEngine: 'GTA FiveM / Lua',
      targetDescription: 'Criação de scripts, garage NUI e balanceamento de economia para mod multiplayer.',
      guardrails: 'Mantenha o foco estritamente no desenvolvimento, scripts, configurações e testes deste mod. Recuse assuntos não relacionados à programação ou arquitetura do mod.',
      selectedProvider: 'gemini',
      selectedModel: 'gemini-flash-latest',
      customApiKey: defaultSavedKeys.geminiKey || '',
      customBaseUrl: defaultSavedKeys.customBaseUrl || '',
      agents: defaultAgents,
      ragDocs: defaultRagDocs,
      files: defaultFiles,
      activeFileId: defaultFiles[1].id, // client.lua
      testConsoleLogs: [
        '[Sistema] Workspace da Sala de Projeto inicializado com sucesso.',
        '[RAG] 2 documentos técnicos indexados (FiveM Eventos e Áudio).',
        '[Agentes] 3 especialistas prontos: @scriptmaster, @balanceador, @auditor.',
        '[Swarm] Execução autônoma em segundo plano disponível.',
      ],
      actionPlan: defaultPlan,
      agenticActivities: initialActivities,
      interAgentDialogues: initialDialogues,
      pendingUserQuestion: null,
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

  async loadProjectState(channelId: string, channelName?: string): Promise<ProjectRoomState> {
    try {
      // 1. Try Firestore first
      const docRef = doc(db, 'projectRooms', channelId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data() as ProjectRoomState;
        // Merge stored user API keys if not present in doc
        const storedKeys = this.getStoredApiKeys();
        if (!data.customApiKey && storedKeys.geminiKey) {
          data.customApiKey = storedKeys.geminiKey;
        }
        return this.sanitizeState(data);
      }
    } catch (e) {
      console.warn('Firestore loadProjectState warning, falling back to local storage:', e);
    }

    // 2. Try localStorage fallback
    try {
      const cached = localStorage.getItem(LOCAL_STORAGE_KEY_PREFIX + channelId);
      if (cached) {
        const parsed = JSON.parse(cached);
        return this.sanitizeState(parsed);
      }
    } catch {}

    // 3. Return default initial state
    const defaultState = this.getDefaultProjectState(channelId, channelName);
    this.saveProjectState(channelId, defaultState).catch(() => {});
    return this.sanitizeState(defaultState);
  },

  async saveProjectState(channelId: string, state: ProjectRoomState): Promise<void> {
    const updatedState = { ...state, updatedAt: Date.now() };

    // Save to localStorage immediately for instant offline persistence
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_PREFIX + channelId, JSON.stringify(updatedState));
    } catch {}

    // Save to Firestore so other members in the channel see updates in real-time
    // C4 Security: Strip customApiKey from shared cloud Firestore document
    try {
      const docRef = doc(db, 'projectRooms', channelId);
      const { customApiKey, ...safeCloudState } = updatedState;
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

  // Export all workspace files into a .ZIP archive ready for game installation
  async downloadProjectAsZip(projectState: ProjectRoomState) {
    const zip = new JSZip();

    // Group files by path or root
    projectState.files.forEach((file) => {
      zip.file(file.path || file.name, file.content);
    });

    // Add a README.md automatically if not present
    if (!projectState.files.some((f) => f.name.toLowerCase().startsWith('readme'))) {
      const readmeContent = `# ${projectState.projectName}
**Plataforma / Engine:** ${projectState.gameEngine}
**Objetivo:** ${projectState.targetDescription}

Criado colaborativamente na Sala de Projeto com IA do **Braza Talk**.

## Arquivos incluídos:
${projectState.files.map((f) => `- \`${f.path || f.name}\` (${f.language})`).join('\n')}

## Como instalar:
1. Extraia o conteúdo desta pasta no diretório de mods/resources do seu servidor ou jogo.
2. Certifique-se de configurar as permissões no arquivo de configuração se aplicável.
3. Bom jogo e bom desenvolvimento!
`;
      zip.file('README.md', readmeContent);
    }

    // Generate zip blob
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const safeName = (projectState.projectName || 'braza-mod')
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
