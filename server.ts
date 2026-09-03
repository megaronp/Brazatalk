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

async function generateWithFallback(ai: GoogleGenAI, params: any) {
  try {
    return await ai.models.generateContent(params);
  } catch (err: any) {
    // If 503 high demand, retry once after a short wait
    if (err?.message?.includes('503') || err?.status === 'UNAVAILABLE') {
      await new Promise((r) => setTimeout(r, 1200));
      return await ai.models.generateContent(params);
    }
    throw err;
  }
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
        model: 'gemini-3.8-flash',
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
      model: 'gemini-3.8-flash',
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
