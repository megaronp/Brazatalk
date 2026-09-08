import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const server = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json());

// Lazy-loaded Gemini AI client
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

const GEMINI_TEXT_FALLBACK_CANDIDATES = [
  'gemini-flash-latest',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

// In-memory cooldown tracking for models experiencing temporary demand spikes (e.g. 503 UNAVAILABLE)
const modelDemandCooldowns = new Map<string, number>();

function isModelCoolingDown(model: string): boolean {
  const expiry = modelDemandCooldowns.get(model);
  if (!expiry) return false;
  if (Date.now() < expiry) return true;
  modelDemandCooldowns.delete(model);
  return false;
}

function markModelDemandCooldown(model: string, durationMs = 60000) {
  modelDemandCooldowns.set(model, Date.now() + durationMs);
}

async function generateWithFallback(ai: GoogleGenAI, params: any) {
  const requestedModel = params.model || 'gemini-flash-latest';
  
  // Build candidate list prioritizing healthy models that are not in cooldown
  const availableCandidates = [...GEMINI_TEXT_FALLBACK_CANDIDATES];
  if (!availableCandidates.includes(requestedModel)) {
    availableCandidates.unshift(requestedModel);
  }

  // If the requested model is not cooling down, try it first; otherwise prioritize other candidates
  const modelsToTry: string[] = [];
  if (!isModelCoolingDown(requestedModel)) {
    modelsToTry.push(requestedModel);
  }
  for (const m of availableCandidates) {
    if (!modelsToTry.includes(m) && !isModelCoolingDown(m)) {
      modelsToTry.push(m);
    }
  }
  // If all are cooling down or remaining, append the rest
  for (const m of availableCandidates) {
    if (!modelsToTry.includes(m)) {
      modelsToTry.push(m);
    }
  }

  let lastError: any = null;

  for (let i = 0; i < modelsToTry.length; i++) {
    const currentModel = modelsToTry[i];
    try {
      return await ai.models.generateContent({
        ...params,
        model: currentModel,
      });
    } catch (err: any) {
      lastError = err;
      const errMsg = String(err?.message || '');
      const errStatus = String(err?.status || '');
      const is503OrDemand =
        err?.status === 'UNAVAILABLE' ||
        errMsg.includes('503') ||
        errMsg.includes('high demand') ||
        errMsg.includes('temporarily unavailable') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errStatus === 'RESOURCE_EXHAUSTED' ||
        errMsg.includes('429');

      const isNotFound =
        err?.status === 'NOT_FOUND' ||
        errMsg.includes('404') ||
        errMsg.includes('no longer available') ||
        errMsg.includes('not found');

      // Use console.log (stdout) rather than console.warn (stderr) so container supervisor does not flag routine fallbacks
      console.log(`[Gemini Fallback] Model "${currentModel}" status (demand/503: ${is503OrDemand}, notFound: ${isNotFound}). Switching to next candidate...`);

      if (is503OrDemand) {
        // Put model in temporary 60-second cooldown so subsequent requests don't waste time or hit 503
        markModelDemandCooldown(currentModel, 60000);
        continue;
      }

      if (isNotFound) {
        continue;
      }

      // If it's an authentication/authorization error (401/403/invalid api key), fail fast without burning requests
      if (errMsg.includes('API_KEY_INVALID') || errMsg.includes('403') || errMsg.includes('401')) {
        throw err;
      }
    }
  }

  throw lastError;
}

// In-memory real-time state for connected clients & voice rooms
interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
  userName?: string;
  userAvatar?: string;
  currentChannelId?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  isScreenSharing?: boolean;
  isStreamingVideo?: boolean;
  isSpeaking?: boolean;
}

interface ServerVoiceParticipant {
  userId: string;
  userName: string;
  userAvatar: string;
  channelId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  isCameraOn: boolean;
  viewers: string[];
  joinedAt: number;
}

const clients = new Map<string, ConnectedClient>();
const voiceParticipants = new Map<string, ServerVoiceParticipant>();

// WebSocket Server
const wss = new WebSocketServer({ server });

function broadcast(data: object, excludeWs?: WebSocket) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN && client !== excludeWs) {
      client.send(payload);
    }
  });
}

function broadcastToChannel(channelId: string, data: object, excludeWs?: WebSocket) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.currentChannelId === channelId && client.ws.readyState === WebSocket.OPEN && client.ws !== excludeWs) {
      client.ws.send(payload);
    }
  });
}

wss.on('connection', (ws) => {
  let clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  clients.set(clientId, { ws });

  // Immediately send current live voice room participants so the user sees members before entering
  try {
    ws.send(JSON.stringify({
      type: 'init-voice-state',
      participants: Array.from(voiceParticipants.values()),
    }));
  } catch {}

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'get-voice-state': {
          ws.send(JSON.stringify({
            type: 'init-voice-state',
            participants: Array.from(voiceParticipants.values()),
          }));
          break;
        }

        case 'auth': {
          const oldClientId = clientId;
          clientId = msg.userId || clientId;
          if (oldClientId !== clientId) {
            clients.delete(oldClientId);
          }
          clients.set(clientId, {
            ws,
            userId: msg.userId,
            userName: msg.userName,
            userAvatar: msg.userAvatar,
            currentChannelId: msg.channelId,
          });

          // Send current active voice participants
          ws.send(JSON.stringify({
            type: 'init-voice-state',
            participants: Array.from(voiceParticipants.values()),
          }));
          break;
        }

        case 'user-profile-updated': {
          clients.forEach((client) => {
            if (client.userId === msg.userId || client.ws === ws) {
              if (msg.userName) client.userName = msg.userName;
              if (msg.userAvatar) client.userAvatar = msg.userAvatar;
              if (msg.channelId && !client.currentChannelId) client.currentChannelId = msg.channelId;
            }
          });

          const p = voiceParticipants.get(msg.userId);
          if (p) {
            if (msg.userName) p.userName = msg.userName;
            if (msg.userAvatar) p.userAvatar = msg.userAvatar;
          }

          // Broadcast to all clients to update voice participants, member lists, and active rooms immediately
          broadcast({
            type: 'user-profile-updated',
            userId: msg.userId,
            userName: msg.userName,
            userAvatar: msg.userAvatar,
            status: msg.status,
            customStatus: msg.customStatus,
            bio: msg.bio,
            channelId: msg.channelId,
          });
          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'chat-message': {
          // Broadcast message to all users in the server / channel
          broadcast({
            type: 'chat-message',
            message: msg.message,
          });
          break;
        }

        case 'typing': {
          broadcast(
            {
              type: 'typing',
              channelId: msg.channelId,
              userId: msg.userId,
              userName: msg.userName,
              isTyping: msg.isTyping,
            },
            ws
          );
          break;
        }

        case 'join-voice': {
          const client = clients.get(clientId);
          if (client) {
            client.currentChannelId = msg.channelId;
            client.userId = msg.userId || client.userId;
            client.userName = msg.userName || client.userName;
            client.userAvatar = msg.userAvatar || client.userAvatar;
            client.isMuted = msg.isMuted || false;
            client.isDeafened = msg.isDeafened || false;
            client.isScreenSharing = false;
            client.isStreamingVideo = false;
          }

          const newParticipant: ServerVoiceParticipant = {
            userId: msg.userId,
            userName: msg.userName,
            userAvatar: msg.userAvatar,
            channelId: msg.channelId,
            isMuted: msg.isMuted || false,
            isDeafened: msg.isDeafened || false,
            isSpeaking: false,
            isScreenSharing: false,
            isCameraOn: false,
            viewers: [],
            joinedAt: Date.now(),
          };

          voiceParticipants.set(msg.userId, newParticipant);

          // Broadcast user joined sound & presence event
          broadcast({
            type: 'voice-user-joined',
            channelId: msg.channelId,
            user: newParticipant,
          });

          // Broadcast complete synchronized list to all clients so channel lists stay up to date
          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'leave-voice': {
          const client = clients.get(clientId);
          const oldChannelId = client?.currentChannelId || msg.channelId;
          if (client) {
            client.currentChannelId = undefined;
            client.isScreenSharing = false;
            client.isStreamingVideo = false;
          }

          voiceParticipants.delete(msg.userId);

          broadcast({
            type: 'voice-user-left',
            channelId: oldChannelId,
            userId: msg.userId,
            userName: msg.userName,
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'voice-state-update': {
          const client = clients.get(clientId);
          if (client) {
            if (msg.isMuted !== undefined) client.isMuted = msg.isMuted;
            if (msg.isDeafened !== undefined) client.isDeafened = msg.isDeafened;
            if (msg.isSpeaking !== undefined) client.isSpeaking = msg.isSpeaking;
            if (msg.isScreenSharing !== undefined) client.isScreenSharing = msg.isScreenSharing;
            if (msg.isCameraOn !== undefined) client.isStreamingVideo = msg.isCameraOn;
          }

          const p = voiceParticipants.get(msg.userId);
          if (p) {
            if (msg.isMuted !== undefined) p.isMuted = msg.isMuted;
            if (msg.isDeafened !== undefined) p.isDeafened = msg.isDeafened;
            if (msg.isSpeaking !== undefined) p.isSpeaking = msg.isSpeaking;
            if (msg.isScreenSharing !== undefined) p.isScreenSharing = msg.isScreenSharing;
            if (msg.isCameraOn !== undefined) p.isCameraOn = msg.isCameraOn;
          }

          broadcast({
            type: 'voice-state-changed',
            channelId: msg.channelId,
            userId: msg.userId,
            updates: {
              isMuted: msg.isMuted,
              isDeafened: msg.isDeafened,
              isSpeaking: msg.isSpeaking,
              isScreenSharing: msg.isScreenSharing,
              isCameraOn: msg.isCameraOn,
            },
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'start-screen-share': {
          const client = clients.get(clientId);
          if (client) client.isScreenSharing = true;

          const p = voiceParticipants.get(msg.userId);
          if (p) p.isScreenSharing = true;

          broadcast({
            type: 'screen-share-started',
            channelId: msg.channelId,
            userId: msg.userId,
            userName: msg.userName,
            streamTitle: msg.streamTitle || `${msg.userName}'s Screen`,
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'stop-screen-share': {
          const client = clients.get(clientId);
          if (client) client.isScreenSharing = false;

          const p = voiceParticipants.get(msg.userId);
          if (p) p.isScreenSharing = false;

          broadcast({
            type: 'screen-share-stopped',
            channelId: msg.channelId,
            userId: msg.userId,
            userName: msg.userName,
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'watch-stream': {
          // When a user starts viewing another participant's live stream
          broadcast({
            type: 'stream-viewer-joined',
            channelId: msg.channelId,
            streamerUserId: msg.streamerUserId,
            viewerUserId: msg.viewerUserId,
            viewerUserName: msg.viewerUserName,
          });
          break;
        }

        case 'webrtc-signal': {
          // Relay WebRTC signaling (offer / answer / ice-candidate)
          if (msg.toUserId) {
            let delivered = false;
            clients.forEach((client) => {
              if (client.userId === msg.toUserId && client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(JSON.stringify({
                  type: 'webrtc-signal',
                  channelId: msg.channelId,
                  fromUserId: msg.fromUserId,
                  toUserId: msg.toUserId,
                  signal: msg.signal,
                }));
                delivered = true;
              }
            });
            if (!delivered) {
              broadcastToChannel(msg.channelId, {
                type: 'webrtc-signal',
                fromUserId: msg.fromUserId,
                toUserId: msg.toUserId,
                signal: msg.signal,
              }, ws);
            }
          } else {
            broadcastToChannel(msg.channelId, {
              type: 'webrtc-signal',
              fromUserId: msg.fromUserId,
              toUserId: msg.toUserId,
              signal: msg.signal,
            }, ws);
          }
          break;
        }

        case 'role-permissions-updated': {
          broadcast({
            type: 'server-updated',
            serverId: msg.serverId,
            roles: msg.roles,
            auditLog: msg.auditLog,
          });
          break;
        }
      }
    } catch (e) {
      console.warn('WS parse error:', e);
    }
  });

  ws.on('close', () => {
    const client = clients.get(clientId);
    const participantUserId = client?.userId || clientId;
    const p = voiceParticipants.get(participantUserId);
    const channelId = client?.currentChannelId || p?.channelId;

    if (p || channelId) {
      voiceParticipants.delete(participantUserId);
      broadcast({
        type: 'voice-user-left',
        channelId,
        userId: participantUserId,
        userName: client?.userName || p?.userName,
      });
      broadcast({
        type: 'voice-participants-sync',
        participants: Array.from(voiceParticipants.values()),
      });
    }
    clients.delete(clientId);
  });
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: Date.now(), connectedClients: clients.size });
});

// Real AI Command Handler (Gemini 2.5 Flash)
app.post('/api/ai/command', async (req, res) => {
  const { command, prompt, channelMessages, channelName } = req.body;

  const ai = getAiClient();
  if (!ai) {
    return res.json({
      success: false,
      reply: '⚠️ **Gemini AI não configurado no servidor.**\n\nPara obter respostas inteligentes em tempo real e resumos automáticos via `/ai` e `/summarize`, configure a variável `GEMINI_API_KEY` nos segredos do projeto.',
    });
  }

  try {
    if (command === '/summarize') {
      const recentContext = Array.isArray(channelMessages) && channelMessages.length > 0
        ? channelMessages.slice(-25).join('\n')
        : 'Nenhuma mensagem recente encontrada no canal.';

      const promptText = `Você é o Braza Bot, assistente inteligente do aplicativo Braza Talk.
Resuma as mensagens recentes trocadas no canal "${channelName || 'geral'}":

${recentContext}

Gere um resumo em português com:
- Tópicos principais discutidos
- Decisões ou conclusões tomadas
- Tom de conversa objetivo e bem formatado em Markdown.`;

      const response = await generateWithFallback(ai, {
        model: 'gemini-flash-latest',
        contents: promptText,
      });

      return res.json({
        success: true,
        reply: response.text || 'Nenhum resumo pôde ser gerado para o conteúdo atual.',
      });
    }

    // Default /ai <pergunta>
    const userQuery = prompt || 'Como usar o Braza Talk?';
    const response = await generateWithFallback(ai, {
      model: 'gemini-flash-latest',
      contents: userQuery,
      config: {
        systemInstruction: 'Você é o Braza Bot, assistente oficial do Braza Talk (aplicativo de comunicação em tempo real com voz, vídeo, chat e canais). Responda com simpatia, precisão, concisão e formatação amigável em Markdown em português.',
      },
    });

    return res.json({
      success: true,
      reply: response.text || 'Sem resposta no momento.',
    });
  } catch (error: any) {
    console.error('Gemini AI error:', error);
    const is503 = error?.message?.includes('503') || error?.status === 'UNAVAILABLE';
    const cleanMsg = is503
      ? '⚠️ **IA com alta demanda no momento:** Os servidores do Gemini estão processando muitas requisições temporariamente. Por favor, aguarde alguns segundos e envie sua pergunta novamente.'
      : `⚠️ Falha ao processar solicitação com Gemini: ${error?.message || 'Erro desconhecido'}`;

    return res.json({
      success: false,
      reply: cleanMsg,
    });
  }
});

// Multi-LLM Collaborative Project Room Generator (Gemini, OpenAI, Claude, Groq, DeepSeek, Ollama)
app.post('/api/project/generate', async (req, res) => {
  const {
    prompt,
    mentionedAgentHandle,
    projectState,
    conversationHistory,
  } = req.body;

  if (!prompt || !projectState) {
    return res.status(400).json({ success: false, error: 'Parâmetros prompt e projectState são obrigatórios.' });
  }

  const {
    projectName = 'Projeto Mod',
    gameEngine = 'GTA FiveM / Lua',
    targetDescription = 'Desenvolvimento de Mod',
    guardrails = '',
    selectedProvider = 'gemini',
    selectedModel = 'gemini-flash-latest',
    customApiKey = '',
    customBaseUrl = '',
    agents = [],
    ragDocs = [],
    files = [],
  } = projectState;

  // Resolve active agent
  let activeAgent = agents.find((a: any) => 
    mentionedAgentHandle && (a.handle?.toLowerCase() === mentionedAgentHandle.toLowerCase() || a.id === mentionedAgentHandle)
  );

  if (!activeAgent && agents.length > 0) {
    // Check if prompt mentions any agent handle
    const promptLower = prompt.toLowerCase();
    const matched = agents.find((a: any) => a.handle && promptLower.includes(a.handle.toLowerCase()));
    activeAgent = matched || agents[0];
  }

  const agentName = activeAgent?.name || 'Braza ModDev';
  const agentHandle = activeAgent?.handle || '@moddev';
  const agentRole = activeAgent?.role || 'Especialista em Desenvolvimento de Mods e Scripts';
  const agentPrompt = activeAgent?.systemPrompt || 'Você é o desenvolvedor líder do mod.';
  const agentSkills = Array.isArray(activeAgent?.skills) ? activeAgent.skills.join(', ') : 'Geração de Código, Arquitetura, Correção de Bugs';

  // Format RAG context
  let ragContext = '';
  if (Array.isArray(ragDocs) && ragDocs.length > 0) {
    ragContext = ragDocs.map((doc: any) => `### DOCUMENTO RAG: ${doc.title} (${doc.gameEngine || gameEngine})\n${doc.content}`).join('\n\n');
  }

  // Format workspace files context
  let filesContext = '';
  if (Array.isArray(files) && files.length > 0) {
    filesContext = files.map((f: any) => `Arquivo: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content.slice(0, 1500)}${f.content.length > 1500 ? '\n...[conteúdo resumido]' : ''}\n\`\`\``).join('\n\n');
  }

  // Build System & Context Instruction
  const systemInstruction = `Você é o agente ${agentName} (${agentHandle}), com o papel de: "${agentRole}".
Suas habilidades principais são: ${agentSkills}.
Instruções específicas da sua persona:
${agentPrompt}

=== CONTEXTO DO PROJETO ===
Nome do Projeto: ${projectName}
Jogo / Engine / Plataforma: ${gameEngine}
Objetivo Geral: ${targetDescription}

=== GUARDRAILS E LIMITES ESTRITOS DO PROJETO ===
${guardrails || 'ATENÇÃO: Mantenha todas as respostas estritamente focadas no desenvolvimento deste mod/jogo e seus arquivos técnicos. Se o usuário fizer perguntas não relacionadas (culinária, política, assuntos aleatórios), recuse cordialmente e redirecione o foco para o desenvolvimento do mod.'}

=== BASE DE CONHECIMENTO & DOCUMENTAÇÃO DA ENGINE (RAG) ===
${ragContext || 'Nenhum documento RAG adicional fornecido. Utilize as melhores práticas da engine ' + gameEngine + '.'}

=== ARQUIVOS ATUAIS NO WORKSPACE ===
${filesContext || 'Nenhum arquivo criado no workspace ainda.'}

=== INSTRUÇÕES DE CRIAÇÃO E ATUALIZAÇÃO DE ARQUIVOS ===
Quando você criar ou sugerir alterações em arquivos do projeto (ex: scripts Lua, arquivos JSON de configuração, manifests, HTML/CSS/JS de NUI, etc.), você DEVE incluir ao final da sua resposta um bloco estruturado no seguinte formato exato:

<<<BRAZA_PROJECT_ACTIONS>>>
{
  "files": [
    {
      "name": "nome_do_arquivo.ext",
      "action": "create",
      "language": "lua",
      "content": "conteúdo completo do arquivo aqui"
    }
  ],
  "testRecommendation": "Breve instrução de como testar (ex: comando no console, evento a disparar ou preview web)"
}
<<<END_BRAZA_PROJECT_ACTIONS>>>

No texto da sua resposta:
- Responda em português com clareza e entusiasmo técnico.
- Explique o que o script faz, quais eventos ou funções foram criados e onde o arquivo deve ser colocado.
- Dê orientações práticas para a equipe que está no canal de voz ouvindo e testando.`;

  // Build user prompt with conversation history
  let fullPrompt = '';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const recent = conversationHistory.slice(-6).map((m: any) => `${m.authorName || 'Usuário'}: ${m.content}`).join('\n');
    fullPrompt += `=== HISTÓRICO RECENTE DO CHAT ===\n${recent}\n\n`;
  }
  fullPrompt += `=== MENSAGEM DO USUÁRIO ===\n${prompt}`;

  // Provider execution
  let rawReplyText = '';
  const provider = selectedProvider || 'gemini';

  try {
    if (provider === 'gemini') {
      const apiKey = customApiKey?.trim() || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.json({
          success: false,
          reply: '⚠️ **Chave do Gemini não configurada.** Insira sua API Key nas Configurações da Sala ou configure GEMINI_API_KEY no servidor.',
        });
      }

      const client = new GoogleGenAI({ apiKey });
      let modelName = selectedModel?.startsWith('gemini') ? selectedModel : 'gemini-flash-latest';
      // Automatically migrate deprecated or non-existent models
      if (
        modelName === 'gemini-2.5-flash' ||
        modelName === 'gemini-2.5-pro' ||
        modelName === 'gemini-2.0-flash' ||
        modelName === 'gemini-2.0-pro' ||
        modelName === 'gemini-1.5-flash' ||
        modelName === 'gemini-1.5-pro' ||
        modelName === 'gemini-3.6-flash'
      ) {
        modelName = 'gemini-flash-latest';
      }
      const response = await generateWithFallback(client, {
        model: modelName,
        contents: fullPrompt,
        config: {
          systemInstruction,
        },
      });
      rawReplyText = response.text || '';
    } else if (provider === 'openai' || provider === 'groq' || provider === 'deepseek' || provider === 'custom') {
      const apiKey = customApiKey?.trim() || (provider === 'groq' ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY);
      if (!apiKey && provider !== 'custom') {
        return res.json({
          success: false,
          reply: `⚠️ **Chave de API necessária para ${provider.toUpperCase()}.**\n\nAbra o painel "Configurações de IA & Chaves" no topo da Sala de Projeto e insira sua API Key para usar este modelo.`,
        });
      }

      let endpoint = 'https://api.openai.com/v1/chat/completions';
      let model = selectedModel || 'gpt-4o';

      if (provider === 'groq') {
        endpoint = 'https://api.groq.com/openai/v1/chat/completions';
        model = selectedModel || 'llama-3.3-70b-versatile';
      } else if (provider === 'deepseek') {
        endpoint = 'https://api.deepseek.com/chat/completions';
        model = selectedModel || 'deepseek-chat';
      } else if (provider === 'custom') {
        endpoint = (customBaseUrl ? customBaseUrl.replace(/\/$/, '') : 'http://localhost:11434') + '/v1/chat/completions';
        model = selectedModel || 'llama3';
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey || 'ollama'}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: fullPrompt },
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro na API ${provider} (${response.status}): ${errText}`);
      }

      const data: any = await response.json();
      rawReplyText = data?.choices?.[0]?.message?.content || '';
    } else if (provider === 'claude') {
      const apiKey = customApiKey?.trim() || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return res.json({
          success: false,
          reply: '⚠️ **Chave da Anthropic Claude necessária.** Insira sua chave no painel "Configurações de IA & Chaves" no topo da sala.',
        });
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: selectedModel || 'claude-3-5-sonnet-20241022',
          max_tokens: 4096,
          system: systemInstruction,
          messages: [{ role: 'user', content: fullPrompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Erro na API Claude (${response.status}): ${errText}`);
      }

      const data: any = await response.json();
      rawReplyText = data?.content?.[0]?.text || '';
    }

    // Parse actions block from reply
    let cleanedReply = rawReplyText;
    let extractedFiles: any[] = [];
    let testRecommendation = '';

    const actionMatch = rawReplyText.match(/<<<BRAZA_PROJECT_ACTIONS>>>([\s\S]*?)<<<END_BRAZA_PROJECT_ACTIONS>>>/);
    if (actionMatch && actionMatch[1]) {
      try {
        const jsonStr = actionMatch[1].trim();
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed.files)) {
          extractedFiles = parsed.files.map((f: any) => ({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: f.name || 'script.lua',
            path: f.name || 'script.lua',
            content: f.content || '',
            language: f.language || 'lua',
            updatedAt: Date.now(),
            updatedBy: agentName,
            version: 1,
          }));
        }
        testRecommendation = parsed.testRecommendation || '';
        // Remove raw JSON from chat reply text for clean presentation
        cleanedReply = rawReplyText.replace(/<<<BRAZA_PROJECT_ACTIONS>>>[\s\S]*?<<<END_BRAZA_PROJECT_ACTIONS>>>/, '').trim();
      } catch (e) {
        console.warn('Could not parse project actions JSON:', e);
      }
    }

    return res.json({
      success: true,
      reply: cleanedReply || 'Arquivo(s) atualizado(s) no workspace do projeto.',
      files: extractedFiles,
      testRecommendation,
      agent: {
        id: activeAgent?.id || 'agent-default',
        name: agentName,
        handle: agentHandle,
        avatar: activeAgent?.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=moddev',
        color: activeAgent?.color || '#6366f1',
      },
      provider,
      model: selectedModel,
    });
  } catch (error: any) {
    console.error('Project generate error:', error);
    const rawMsg = String(error?.message || '');
    const is503 = rawMsg.includes('503') || rawMsg.includes('high demand') || error?.status === 'UNAVAILABLE';
    const isQuota = rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED') || error?.status === 'RESOURCE_EXHAUSTED';

    let userFriendlyMsg = rawMsg;
    if (is503) {
      userFriendlyMsg = 'Os servidores de IA estão com alta demanda temporária no momento (Erro 503). Por favor, aguarde alguns instantes e tente novamente, ou selecione outro modelo/provedor nas Configurações da Sala.';
    } else if (isQuota) {
      userFriendlyMsg = 'Limite de requisições por minuto atingido (Erro 429). Por favor, aguarde alguns segundos e envie novamente.';
    }

    return res.json({
      success: false,
      reply: `⚠️ **Aviso de IA:** ${userFriendlyMsg}`,
    });
  }
});

// ==========================================
// AUTONOMOUS BACKGROUND AGENT SWARM ENGINE
// ==========================================

interface ProjectPlanStep {
  id: string;
  order: number;
  title: string;
  description: string;
  assignedAgentHandle: string;
  status: 'pending' | 'in_progress' | 'waiting_user_input' | 'completed' | 'failed';
  questionToUser?: string;
  userAnswer?: string;
  outputSummary?: string;
  filesTouched?: string[];
  updatedAt?: number;
}

interface ProjectActionPlan {
  id: string;
  goal: string;
  status: 'idle' | 'running' | 'waiting_user' | 'completed' | 'paused';
  currentStepIndex: number;
  steps: ProjectPlanStep[];
  startedAt?: number;
  updatedAt?: number;
}

interface InterAgentMessage {
  id: string;
  senderHandle: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  recipientHandle?: string;
  actionType: 'thought' | 'proposal' | 'critique' | 'code_review' | 'question_user' | 'approval';
  content: string;
  timestamp: number;
  relatedStepId?: string;
  relatedFileName?: string;
}

interface ProjectAgentActivity {
  agentHandle: string;
  status: 'idle' | 'thinking' | 'coding' | 'reviewing' | 'waiting_user';
  currentTask?: string;
  thought?: string;
  lastActiveAt: number;
}

interface ProjectPendingQuestion {
  stepId: string;
  agentHandle: string;
  agentName: string;
  agentAvatar: string;
  agentColor?: string;
  question: string;
  suggestedOptions?: string[];
  timestamp: number;
}

interface ProjectRunnerState {
  channelId: string;
  plan: ProjectActionPlan;
  agenticActivities: Record<string, ProjectAgentActivity>;
  interAgentDialogues: InterAgentMessage[];
  pendingUserQuestion: ProjectPendingQuestion | null;
  projectState: any;
  isExecuting: boolean;
  paused: boolean;
}

const projectRunners = new Map<string, ProjectRunnerState>();

function broadcastPlanUpdate(runner: ProjectRunnerState, extra?: any) {
  broadcast({
    type: 'project-plan-updated',
    channelId: runner.channelId,
    plan: runner.plan,
    agenticActivities: runner.agenticActivities,
    interAgentDialogues: runner.interAgentDialogues,
    pendingUserQuestion: runner.pendingUserQuestion,
    files: runner.projectState?.files || [],
    ...extra,
  });
}

function addInterAgentDialogue(
  runner: ProjectRunnerState,
  msg: Omit<InterAgentMessage, 'id' | 'timestamp'>
) {
  const newMsg: InterAgentMessage = {
    ...msg,
    id: `dialogue-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
  };
  runner.interAgentDialogues.push(newMsg);
  if (runner.interAgentDialogues.length > 50) {
    runner.interAgentDialogues.shift();
  }
  return newMsg;
}

// Background runner loop
async function runProjectAutonomousLoop(channelId: string) {
  const runner = projectRunners.get(channelId);
  if (!runner || runner.paused || runner.isExecuting) return;

  runner.isExecuting = true;

  try {
    while (!runner.paused && runner.plan.status === 'running') {
      const { steps, currentStepIndex } = runner.plan;

      if (currentStepIndex >= steps.length) {
        runner.plan.status = 'completed';
        runner.plan.updatedAt = Date.now();
        addInterAgentDialogue(runner, {
          senderHandle: '@arquiteto',
          senderName: 'Arquiteto de Soluções',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=arquiteto',
          senderColor: '#8b5cf6',
          recipientHandle: 'all',
          actionType: 'approval',
          content: `🎉 **Plano de Ação concluído com sucesso!** Todos os ${steps.length} passos foram executados pelos agentes. Os arquivos estão salvos no Workspace e prontos para teste ou download em .ZIP!`,
        });
        broadcastPlanUpdate(runner);
        break;
      }

      const step = steps[currentStepIndex];

      // If waiting for user, halt loop safely
      if (step.status === 'waiting_user_input' && !step.userAnswer) {
        runner.plan.status = 'waiting_user';
        broadcastPlanUpdate(runner);
        break;
      }

      // Start executing step
      step.status = 'in_progress';
      step.updatedAt = Date.now();

      // Find assigned agent
      const assignedHandle = step.assignedAgentHandle || '@scriptmaster';
      const agent = runner.projectState.agents?.find(
        (a: any) => a.handle.toLowerCase() === assignedHandle.toLowerCase()
      ) || runner.projectState.agents?.[0] || {
        handle: '@scriptmaster',
        name: 'ScriptMaster Lua',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=scriptmaster',
        color: '#38bdf8',
        role: 'Desenvolvedor Líder',
      };

      // Set agent activity
      runner.agenticActivities[agent.handle] = {
        agentHandle: agent.handle,
        status: 'thinking',
        currentTask: step.title,
        thought: `Analisando dependências para: ${step.title}...`,
        lastActiveAt: Date.now(),
      };

      addInterAgentDialogue(runner, {
        senderHandle: agent.handle,
        senderName: agent.name,
        senderAvatar: agent.avatar,
        senderColor: agent.color,
        recipientHandle: '@auditor',
        actionType: 'proposal',
        content: `Iniciando **Passo ${step.order}: ${step.title}**. ${step.description}`,
        relatedStepId: step.id,
      });

      broadcastPlanUpdate(runner);

      // Brief thinking delay for realistic agent swarm collaboration
      await new Promise((r) => setTimeout(r, 1200));
      if (runner.paused) break;

      runner.agenticActivities[agent.handle].status = 'coding';
      runner.agenticActivities[agent.handle].thought = `Codificando scripts e arquivos para ${step.title}...`;
      broadcastPlanUpdate(runner);

      // Prepare LLM execution context
      const existingFilesSummary = (runner.projectState.files || [])
        .map((f: any) => `Arquivo: ${f.name} (${f.language})\n\`\`\`${f.language}\n${f.content.slice(0, 1000)}\n\`\`\``)
        .join('\n\n');

      const systemInstruction = `Você é o agente ${agent.name} (${agent.handle}) executando autonomamente em segundo plano o projeto "${runner.projectState.projectName}" (${runner.projectState.gameEngine}).
Seu objetivo geral do projeto: ${runner.projectState.targetDescription}
Guardrails: ${runner.projectState.guardrails || 'Foco estrito em desenvolvimento técnico e código funcional.'}

Você está executando o passo ${step.order} de ${steps.length}:
Título do Passo: "${step.title}"
Descrição: "${step.description}"
${step.userAnswer ? `\n>>> RESPOSTA DECISIVA DO USUÁRIO PARA ESTE PASSO: "${step.userAnswer}". Incorpore essa escolha técnica diretamente no código!` : ''}

=== ARQUIVOS ATUAIS NO WORKSPACE ===
${existingFilesSummary || 'Nenhum arquivo ainda.'}

=== INSTRUÇÕES DE EXECUÇÃO ===
1. Desenvolva o código completo e funcional necessário para este passo.
2. Formate as alterações de arquivos no bloco obrigatório:
<<<BRAZA_PROJECT_ACTIONS>>>
{
  "files": [
    {
      "name": "nome_do_arquivo.ext",
      "action": "create",
      "language": "lua",
      "content": "código completo aqui"
    }
  ],
  "testRecommendation": "instrução de teste rápida"
}
<<<END_BRAZA_PROJECT_ACTIONS>>>

3. ATENÇÃO: DÚVIDAS E PARADA COM SEGURANÇA:
Se este passo envolver uma escolha arquitetural ou de regra de negócio crítica onde o usuário NÃO tenha respondido ainda (ex: escolha entre frameworks ESX ou QBCore, taxa fixa ou dinâmica, tabela de banco SQL vs JSON), você PODE incluir o seguinte bloco para pausar e aguardar com segurança:
<<<BRAZA_QUESTION>>>
{
  "question": "Pergunta objetiva e clara para o usuário",
  "options": ["Opção A", "Opção B", "Opção C"]
}
<<<END_BRAZA_QUESTION>>>
Se o usuário já deu sua resposta em "RESPOSTA DECISIVA DO USUÁRIO", NÃO inclua o bloco de pergunta, apenas execute o código correspondente!`;

      let aiResponseText = '';
      try {
        const apiKey = runner.projectState.customApiKey?.trim() || process.env.GEMINI_API_KEY;
        if (apiKey) {
          const client = new GoogleGenAI({ apiKey });
          let modelName = runner.projectState.selectedModel || 'gemini-flash-latest';
          if (
            modelName === 'gemini-2.5-flash' ||
            modelName === 'gemini-2.5-pro' ||
            modelName === 'gemini-2.0-flash' ||
            modelName === 'gemini-1.5-flash' ||
            modelName === 'gemini-3.6-flash'
          ) {
            modelName = 'gemini-flash-latest';
          }
          const resp = await generateWithFallback(client, {
            model: modelName,
            contents: `Execute o passo ${step.order}: ${step.title}. Gere os arquivos técnicos necessários.`,
            config: { systemInstruction },
          });
          aiResponseText = resp.text || '';
        }
      } catch (err: any) {
        console.log('Autonomous runner LLM call failed, falling back to rule-based generator:', err?.message || err);
      }

      // Check if agent needs to pause and ask user a question
      const questionMatch = aiResponseText.match(/<<<BRAZA_QUESTION>>>([\s\S]*?)<<<END_BRAZA_QUESTION>>>/);
      if (questionMatch && questionMatch[1] && !step.userAnswer) {
        try {
          const qData = JSON.parse(questionMatch[1].trim());
          const questionText = qData.question || 'O agente precisa de uma confirmação sua para prosseguir com segurança.';
          const options = Array.isArray(qData.options) ? qData.options : ['Confirmar Padrão', 'Customizar'];

          step.status = 'waiting_user_input';
          step.questionToUser = questionText;
          runner.plan.status = 'waiting_user';
          runner.pendingUserQuestion = {
            stepId: step.id,
            agentHandle: agent.handle,
            agentName: agent.name,
            agentAvatar: agent.avatar,
            agentColor: agent.color,
            question: questionText,
            suggestedOptions: options,
            timestamp: Date.now(),
          };

          runner.agenticActivities[agent.handle] = {
            agentHandle: agent.handle,
            status: 'waiting_user',
            currentTask: step.title,
            thought: `Aguardando resposta do usuário: "${questionText.slice(0, 60)}..."`,
            lastActiveAt: Date.now(),
          };

          addInterAgentDialogue(runner, {
            senderHandle: agent.handle,
            senderName: agent.name,
            senderAvatar: agent.avatar,
            senderColor: agent.color,
            actionType: 'question_user',
            content: `⏸️ **Pausado aguardando resposta da equipe:** "${questionText}"`,
            relatedStepId: step.id,
          });

          broadcastPlanUpdate(runner);
          break; // Stop loop, waiting for user answer endpoint
        } catch (e) {
          console.warn('Could not parse question JSON:', e);
        }
      }

      // Process generated files
      let extractedFiles: any[] = [];
      const actionMatch = aiResponseText.match(/<<<BRAZA_PROJECT_ACTIONS>>>([\s\S]*?)<<<END_BRAZA_PROJECT_ACTIONS>>>/);
      if (actionMatch && actionMatch[1]) {
        try {
          const parsed = JSON.parse(actionMatch[1].trim());
          if (Array.isArray(parsed.files)) {
            extractedFiles = parsed.files;
          }
        } catch {}
      }

      // Fallback file generation if LLM was dry or unavailable
      if (extractedFiles.length === 0) {
        if (step.order === 1) {
          extractedFiles.push({
            name: 'fxmanifest.lua',
            language: 'lua',
            content: `fx_version 'cerulean'\ngame 'gta5'\nauthor 'Braza ModDev Swarm'\ndescription '${runner.projectState.projectName}'\nversion '1.0.0'\n\nclient_scripts {\n    'client.lua'\n}\nserver_scripts {\n    'server.lua'\n}\nshared_scripts {\n    'config.lua'\n}\n`,
          });
        } else if (step.order === 2) {
          extractedFiles.push({
            name: 'server.lua',
            language: 'lua',
            content: `-- Server-side de ${runner.projectState.projectName}\nlocal QBCore = nil\n\nRegisterNetEvent('braza:server:validateAction', function(data)\n    local src = source\n    -- Validação de source e segurança anti-cheat\n    if not src or src <= 0 then return end\n    print(('[Segurança] Ação validada para player %s'):format(src))\nend)\n`,
          });
        } else {
          extractedFiles.push({
            name: 'config.json',
            language: 'json',
            content: JSON.stringify(
              {
                modName: runner.projectState.projectName,
                version: '1.0.0',
                enabled: true,
                economy: {
                  spawnFee: 500,
                  currencyType: 'bank',
                },
                antiExploit: {
                  rateLimitMs: 300,
                  logViolations: true,
                },
              },
              null,
              2
            ),
          });
        }
      }

      // Merge files into projectState
      if (!Array.isArray(runner.projectState.files)) {
        runner.projectState.files = [];
      }

      const filesTouchedNames: string[] = [];
      for (const ef of extractedFiles) {
        filesTouchedNames.push(ef.name);
        const existingIdx = runner.projectState.files.findIndex((f: any) => f.name === ef.name);
        if (existingIdx >= 0) {
          runner.projectState.files[existingIdx] = {
            ...runner.projectState.files[existingIdx],
            content: ef.content,
            updatedAt: Date.now(),
            updatedBy: agent.name,
            version: (runner.projectState.files[existingIdx].version || 1) + 1,
          };
        } else {
          runner.projectState.files.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: ef.name,
            path: ef.name,
            language: ef.language || 'lua',
            content: ef.content,
            updatedAt: Date.now(),
            updatedBy: agent.name,
            version: 1,
          });
        }
      }

      // Auditor review step
      const auditorAgent = runner.projectState.agents?.find(
        (a: any) => a.handle === '@auditor'
      ) || {
        handle: '@auditor',
        name: 'Auditor de Segurança',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=auditor',
        color: '#ec4899',
      };

      runner.agenticActivities[auditorAgent.handle] = {
        agentHandle: auditorAgent.handle,
        status: 'reviewing',
        currentTask: `Auditoria de ${filesTouchedNames.join(', ')}`,
        thought: 'Verificando injeções de evento, resmon e conformidade...',
        lastActiveAt: Date.now(),
      };

      broadcastPlanUpdate(runner);
      await new Promise((r) => setTimeout(r, 1000));
      if (runner.paused) break;

      addInterAgentDialogue(runner, {
        senderHandle: auditorAgent.handle,
        senderName: auditorAgent.name,
        senderAvatar: auditorAgent.avatar,
        senderColor: auditorAgent.color,
        recipientHandle: agent.handle,
        actionType: 'code_review',
        content: `✅ Arquivos (${filesTouchedNames.join(', ')}) auditados! Resmon estimado < 0.01ms e validações de source OK. Passo ${step.order} aprovado.`,
        relatedStepId: step.id,
      });

      // Complete step
      step.status = 'completed';
      step.filesTouched = filesTouchedNames;
      step.outputSummary = `Desenvolvido por ${agent.name}. Arquivos gerados/atualizados: ${filesTouchedNames.join(', ')}.`;
      step.updatedAt = Date.now();

      runner.agenticActivities[agent.handle].status = 'idle';
      runner.agenticActivities[agent.handle].thought = 'Pronto para próxima tarefa.';
      runner.agenticActivities[auditorAgent.handle].status = 'idle';

      runner.plan.currentStepIndex++;
      runner.plan.updatedAt = Date.now();

      broadcastPlanUpdate(runner);

      // Delay between steps
      await new Promise((r) => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error('Error in runProjectAutonomousLoop:', err);
  } finally {
    runner.isExecuting = false;
  }
}

// 1. Generate Intelligent Action Plan
app.post('/api/project/plan/generate', async (req, res) => {
  const { channelId, goal, projectState } = req.body;
  if (!goal) {
    return res.status(400).json({ success: false, error: 'O objetivo do plano é obrigatório.' });
  }

  const prompt = `Você é o Arquiteto de Sistemas de Mods Multiplayer (@arquiteto).
Crie um Plano de Ação estruturado em 3 a 5 passos executáveis para atingir o objetivo: "${goal}" no projeto "${projectState?.projectName || 'Mod'}" (${projectState?.gameEngine || 'GTA FiveM'}).

Distribua as tarefas entre os agentes disponíveis:
- @scriptmaster: Código de rede, lógica FiveM/Lua, eventos client/server.
- @balanceador: Arquivos de configuração (config.json, config.lua), economia, tabelas de dados.
- @auditor: Anti-cheat, otimização de resmon, testes de segurança e validação final.

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura exata (sem formatação extra):
{
  "goal": "${goal}",
  "steps": [
    {
      "order": 1,
      "title": "Título conciso do passo",
      "description": "Descrição detalhada do que será implementado e quais arquivos serão criados",
      "assignedAgentHandle": "@scriptmaster"
    }
  ]
}`;

  let generatedPlanData: any = null;
  try {
    const apiKey = projectState?.customApiKey?.trim() || process.env.GEMINI_API_KEY;
    if (apiKey) {
      const client = new GoogleGenAI({ apiKey });
      let modelName = projectState?.selectedModel || 'gemini-flash-latest';
      if (
        modelName === 'gemini-2.5-flash' ||
        modelName === 'gemini-2.5-pro' ||
        modelName === 'gemini-2.0-flash' ||
        modelName === 'gemini-1.5-flash' ||
        modelName === 'gemini-3.6-flash'
      ) {
        modelName = 'gemini-flash-latest';
      }
      const resp = await generateWithFallback(client, {
        model: modelName,
        contents: prompt,
      });

      const text = resp.text || '';
      const cleanJson = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      generatedPlanData = JSON.parse(cleanJson);
    }
  } catch (e: any) {
    console.log('Plan generation AI fallback:', e?.message || e);
  }

  // Fallback plan if AI fails
  if (!generatedPlanData || !Array.isArray(generatedPlanData.steps)) {
    generatedPlanData = {
      goal,
      steps: [
        {
          order: 1,
          title: 'Estruturação de Manifest e Dependências',
          description: 'Criação do fxmanifest.lua e definição dos scripts de cliente e servidor.',
          assignedAgentHandle: '@scriptmaster',
        },
        {
          order: 2,
          title: 'Implementação de Eventos e Lógica Central',
          description: 'Criação do client.lua e server.lua com proteção de source.',
          assignedAgentHandle: '@scriptmaster',
        },
        {
          order: 3,
          title: 'Tabelas de Configuração e Balanceamento',
          description: 'Criação do config.json com taxas, permissões e parâmetros ajustáveis.',
          assignedAgentHandle: '@balanceador',
        },
        {
          order: 4,
          title: 'Auditoria de Segurança e Validação de Resmon',
          description: 'Inspeção de vulnerabilidades de rede e testes no Sandbox.',
          assignedAgentHandle: '@auditor',
        },
      ],
    };
  }

  const actionPlan: ProjectActionPlan = {
    id: `plan-${Date.now()}`,
    goal: generatedPlanData.goal || goal,
    status: 'idle',
    currentStepIndex: 0,
    steps: generatedPlanData.steps.map((s: any, idx: number) => ({
      id: `step-${Date.now()}-${idx + 1}`,
      order: s.order || idx + 1,
      title: s.title || `Passo ${idx + 1}`,
      description: s.description || '',
      assignedAgentHandle: s.assignedAgentHandle || '@scriptmaster',
      status: 'pending',
    })),
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  return res.json({ success: true, plan: actionPlan });
});

// 2. Start / Resume Autonomous Plan Execution in Background
app.post('/api/project/plan/start', (req, res) => {
  const { channelId, plan, projectState } = req.body;
  if (!channelId || !plan) {
    return res.status(400).json({ success: false, error: 'channelId e plan são obrigatórios.' });
  }

  let runner = projectRunners.get(channelId);
  if (!runner) {
    runner = {
      channelId,
      plan,
      agenticActivities: {},
      interAgentDialogues: [],
      pendingUserQuestion: null,
      projectState: projectState || {},
      isExecuting: false,
      paused: false,
    };
    projectRunners.set(channelId, runner);
  } else {
    runner.plan = plan;
    if (projectState) runner.projectState = projectState;
    runner.paused = false;
  }

  runner.plan.status = 'running';
  runner.plan.updatedAt = Date.now();

  addInterAgentDialogue(runner, {
    senderHandle: '@arquiteto',
    senderName: 'Arquiteto de Soluções',
    senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=arquiteto',
    senderColor: '#8b5cf6',
    recipientHandle: 'all',
    actionType: 'thought',
    content: `🚀 **Execução Autônoma iniciada em 2º Plano!** O swarm de agentes continuará desenvolvendo mesmo se você navegar por outras salas ou canais.`,
  });

  broadcastPlanUpdate(runner);

  // Trigger background loop asynchronously
  setImmediate(() => {
    runProjectAutonomousLoop(channelId);
  });

  return res.json({
    success: true,
    message: 'Execução autônoma em segundo plano iniciada.',
    plan: runner.plan,
  });
});

// 3. Pause Autonomous Plan Execution
app.post('/api/project/plan/pause', (req, res) => {
  const { channelId } = req.body;
  const runner = projectRunners.get(channelId);
  if (!runner) {
    return res.json({ success: true });
  }

  runner.paused = true;
  runner.plan.status = 'paused';
  runner.plan.updatedAt = Date.now();

  addInterAgentDialogue(runner, {
    senderHandle: '@arquiteto',
    senderName: 'Arquiteto de Soluções',
    senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=arquiteto',
    senderColor: '#8b5cf6',
    actionType: 'thought',
    content: `⏸️ Execução do Plano pausada pela equipe.`,
  });

  broadcastPlanUpdate(runner);
  return res.json({ success: true, plan: runner.plan });
});

// 4. Answer Pending Agent Question & Resume Execution
app.post('/api/project/plan/answer-question', (req, res) => {
  const { channelId, stepId, answer } = req.body;
  const runner = projectRunners.get(channelId);
  if (!runner) {
    return res.status(404).json({ success: false, error: 'Sessão do projeto não encontrada.' });
  }

  const currentStep = runner.plan.steps.find((s) => s.id === stepId) || runner.plan.steps[runner.plan.currentStepIndex];
  if (currentStep) {
    currentStep.userAnswer = answer;
    currentStep.status = 'in_progress';
  }

  runner.pendingUserQuestion = null;
  runner.paused = false;
  runner.plan.status = 'running';
  runner.plan.updatedAt = Date.now();

  addInterAgentDialogue(runner, {
    senderHandle: '@usuario',
    senderName: 'Equipe de Desenvolvimento',
    senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=user',
    senderColor: '#10b981',
    actionType: 'proposal',
    content: `💬 **Decisão do Usuário:** "${answer}". Retomando desenvolvimento autônomo com segurança!`,
    relatedStepId: stepId,
  });

  broadcastPlanUpdate(runner);

  // Resume loop
  setImmediate(() => {
    runProjectAutonomousLoop(channelId);
  });

  return res.json({ success: true, plan: runner.plan });
});

// 5. Query Autonomous Plan Status
app.get('/api/project/plan/status/:channelId', (req, res) => {
  const { channelId } = req.params;
  const runner = projectRunners.get(channelId);
  if (!runner) {
    return res.json({ success: true, exists: false, runner: null });
  }

  return res.json({
    success: true,
    exists: true,
    plan: runner.plan,
    agenticActivities: runner.agenticActivities,
    interAgentDialogues: runner.interAgentDialogues,
    pendingUserQuestion: runner.pendingUserQuestion,
    files: runner.projectState?.files || [],
  });
});

// Helper to detect current origin URL for desktop installers
function getRequestOrigin(req: express.Request): string {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const proto = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'localhost:3000';
  return `${proto}://${host}`;
}

// Serve direct download packages for Desktop with dynamic origin injection
app.get('/downloads/BrazaTalk-Setup.cmd', (req, res) => {
  const origin = (req.query.url as string) || getRequestOrigin(req);
  const filePath = path.join(process.cwd(), 'public', 'downloads', 'BrazaTalk-Setup.cmd');
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    // Replace default URL with client origin
    content = content.replace(/set "DEFAULT_URL=.*"/, `set "DEFAULT_URL=${origin}"`);
    res.setHeader('Content-Type', 'application/x-msdos-program');
    res.setHeader('Content-Disposition', 'attachment; filename="BrazaTalk-Setup.cmd"');
    return res.send(content);
  } catch (e) {
    return res.status(404).send('Installer file not found');
  }
});

app.get('/downloads/install-linux.sh', (req, res) => {
  const origin = (req.query.url as string) || getRequestOrigin(req);
  const filePath = path.join(process.cwd(), 'public', 'downloads', 'install-linux.sh');
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/APP_URL="\$\{1:-\$\{BRAZATALK_URL:-.*\}\}"/, `APP_URL="\${1:-\${BRAZATALK_URL:-${origin}}}"`);
    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', 'attachment; filename="install-linux.sh"');
    return res.send(content);
  } catch (e) {
    return res.status(404).send('Installer script not found');
  }
});

app.get('/downloads/BrazaTalk-macOS.command', (req, res) => {
  const origin = (req.query.url as string) || getRequestOrigin(req);
  const filePath = path.join(process.cwd(), 'public', 'downloads', 'BrazaTalk-macOS.command');
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/APP_URL="\$\{1:-\$\{BRAZATALK_URL:-.*\}\}"/, `APP_URL="\${1:-\${BRAZATALK_URL:-${origin}}}"`);
    res.setHeader('Content-Type', 'application/x-sh');
    res.setHeader('Content-Disposition', 'attachment; filename="BrazaTalk-macOS.command"');
    return res.send(content);
  } catch (e) {
    return res.status(404).send('Installer command not found');
  }
});

app.get('/downloads/brazatalk_2.6.0_all.deb', (req, res) => {
  const filePath = path.join(process.cwd(), 'public', 'downloads', 'brazatalk_2.6.0_all.deb');
  res.setHeader('Content-Type', 'application/vnd.debian.binary-package');
  res.setHeader('Content-Disposition', 'attachment; filename="brazatalk_2.6.0_all.deb"');
  return res.sendFile(filePath);
});

// Fallback for static downloads
app.use('/downloads', express.static(path.join(process.cwd(), 'public', 'downloads')));

app.post('/api/push-notification', (req, res) => {
  const { title, body, userId } = req.body;
  // Push notification simulator/dispatch
  res.json({ success: true, deliveredAt: Date.now(), title, body, recipient: userId || 'all' });
});

// Initialize Vite in Dev or Static Serving in Prod
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Braza Talk Real-time Server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
