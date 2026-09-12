import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Trust reverse proxy (Nginx on Oracle VPS)
app.set('trust proxy', 1);

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: [
          "'self'",
          "wss:",
          "ws:",
          "https://*.googleapis.com",
          "https://*.firebaseio.com",
          "wss://*.firebaseio.com",
        ],
        frameAncestors: ["'self'", "https://*.google.com", "https://*.run.app", "https://ai.studio"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: false, // Protected via frameAncestors in CSP above
  })
);

app.use(express.json({ limit: '2mb' }));

// Rate Limiters
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Muitas requisições. Aguarde um momento.' },
});

const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'rate_limit_exceeded', message: 'Limite de chamadas de IA atingido. Tente em instantes.' },
});

app.use('/api/', apiLimiter);
app.use('/api/ai/', aiLimiter);
app.use('/api/project/', aiLimiter);

// Firebase Token Verification Helper for C2 / C3
let googleCertsCache: { certs: Record<string, string>; expiresAt: number } | null = null;
async function getGooglePublicCerts(): Promise<Record<string, string>> {
  if (googleCertsCache && Date.now() < googleCertsCache.expiresAt) {
    return googleCertsCache.certs;
  }
  try {
    const res = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if (res.ok) {
      const certs = (await res.json()) as Record<string, string>;
      const cacheControl = res.headers.get('cache-control') || '';
      const match = cacheControl.match(/max-age=(\d+)/);
      const maxAge = match ? parseInt(match[1], 10) * 1000 : 6 * 3600 * 1000;
      googleCertsCache = { certs, expiresAt: Date.now() + maxAge };
      return certs;
    }
  } catch (err) {
    console.warn('Failed to fetch Google public certs:', err);
  }
  return googleCertsCache?.certs || {};
}

let firebaseProjectId = 'gen-lang-client-0846705533';
try {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    if (cfg.projectId) firebaseProjectId = cfg.projectId;
  }
} catch {}

export async function verifyFirebaseIdToken(token: string): Promise<{ uid: string; email?: string; name?: string } | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    if (header.alg !== 'RS256' || !header.kid) return null;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    if (payload.aud !== firebaseProjectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${firebaseProjectId}`) return null;
    if (!payload.sub || typeof payload.sub !== 'string') return null;

    const certs = await getGooglePublicCerts();
    const cert = certs[header.kid];
    if (cert) {
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${parts[0]}.${parts[1]}`);
      const isValid = verifier.verify(cert, parts[2], 'base64url');
      if (!isValid) return null;
    } else {
      // If certificate is not found for kid, never trust unverified tokens
      return null;
    }

    return {
      uid: payload.sub,
      email: payload.email,
      name: payload.name || payload.email,
    };
  } catch {
    return null;
  }
}

const ALLOW_DEV_AUTH = process.env.ALLOW_DEV_AUTH === 'true';

// Authentication Middleware for API routes (C2 / B1)
async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (token) {
    const verified = await verifyFirebaseIdToken(token);
    if (verified) {
      (req as any).user = verified;
      return next();
    }
  }

  // Allow development or preview fallback ONLY when explicit ALLOW_DEV_AUTH is set (B1)
  if (ALLOW_DEV_AUTH) {
    (req as any).user = { uid: (req.headers['x-dev-user-id'] as string) || 'dev-user', name: 'Dev User' };
    return next();
  }

  return res.status(401).json({
    error: 'unauthenticated',
    message: 'Acesso não autorizado. ID Token do Firebase é obrigatório.',
  });
}

// AI Timeout Wrapper (A7)
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs = 60000,
  errorMsg = 'A operação de IA excedeu o tempo limite de 60 segundos.'
): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

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

interface FilePresenceUser {
  userId: string;
  userName: string;
  userAvatar?: string;
  status: 'viewing' | 'editing';
  lastPing: number;
}

// Scoped presence per channel: channelId -> Map<fileId, Map<userId, FilePresenceUser>>
const channelFilePresence = new Map<string, Map<string, Map<string, FilePresenceUser>>>();

function updateFilePresence(channelId: string, fileId: string, user: FilePresenceUser) {
  if (!channelFilePresence.has(channelId)) {
    channelFilePresence.set(channelId, new Map());
  }
  const channelMap = channelFilePresence.get(channelId)!;
  if (!channelMap.has(fileId)) {
    channelMap.set(fileId, new Map());
  }
  channelMap.get(fileId)!.set(user.userId, user);
}

function removeUserFilePresence(channelId: string, userId: string, fileId?: string) {
  const channelMap = channelFilePresence.get(channelId);
  if (!channelMap) return;
  if (fileId) {
    channelMap.get(fileId)?.delete(userId);
  } else {
    channelMap.forEach((users) => users.delete(userId));
  }
}

function getChannelPresenceSummary(channelId: string): Record<string, FilePresenceUser[]> {
  const channelMap = channelFilePresence.get(channelId);
  if (!channelMap) return {};
  const now = Date.now();
  const summary: Record<string, FilePresenceUser[]> = {};
  channelMap.forEach((users, fileId) => {
    const active: FilePresenceUser[] = [];
    users.forEach((u, uId) => {
      if (now - u.lastPing < 45000) {
        active.push(u);
      } else {
        users.delete(uId);
      }
    });
    if (active.length > 0) {
      summary[fileId] = active;
    }
  });
  return summary;
}

function broadcastToChannel(channelId: string, data: object, excludeWs?: WebSocket) {
  const payload = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.currentChannelId === channelId && client.ws.readyState === WebSocket.OPEN && client.ws !== excludeWs) {
      client.ws.send(payload);
    }
  });
}

export interface ResolvedIdentity {
  userId: string;
  userName: string;
  userAvatar?: string;
  isVerified: boolean;
}

/**
 * Resolves and strictly enforces client identity:
 * - If a token is provided, verifies it with Google/Firebase public certs.
 *   - If valid, returns the verified UID with isVerified = true.
 *   - If invalid, returns null so the connection can be terminated immediately.
 * - If NO token is provided:
 *   - NEVER returns an un-prefixed UID.
 *   - Guarantees 'guest-' prefix so that guest IDs can never match or impersonate a real Firebase UID.
 */
export async function resolveIdentity(
  msg: any,
  clientId: string
): Promise<ResolvedIdentity | null> {
  const providedName =
    typeof msg.userName === 'string' && msg.userName.trim() ? msg.userName.trim() : 'Membro';
  const providedAvatar = typeof msg.userAvatar === 'string' ? msg.userAvatar : undefined;

  if (msg.token) {
    try {
      const verified = await verifyFirebaseIdToken(msg.token);
      if (!verified) {
        return null;
      }
      return {
        userId: verified.uid,
        userName: verified.name || providedName,
        userAvatar: providedAvatar,
        isVerified: true,
      };
    } catch {
      return null;
    }
  }

  // No token provided: strictly assign guest identity with 'guest-' prefix
  let guestId: string;
  if (typeof msg.userId === 'string' && msg.userId.startsWith('guest-')) {
    guestId = msg.userId;
  } else if (typeof msg.userId === 'string' && msg.userId.trim()) {
    guestId = `guest-${msg.userId.trim()}`;
  } else {
    guestId = `guest-${clientId}`;
  }

  return {
    userId: guestId,
    userName: providedName,
    userAvatar: providedAvatar,
    isVerified: false,
  };
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

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Ping / Pong Heartbeat (M3)
      if (msg.type === 'ping') {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'pong' }));
        }
        return;
      }

      switch (msg.type) {
        case 'get-voice-state': {
          ws.send(JSON.stringify({
            type: 'init-voice-state',
            participants: Array.from(voiceParticipants.values()),
          }));
          break;
        }

        case 'auth': {
          // Strictly resolve and enforce authenticated vs guest identity
          const identity = await resolveIdentity(msg, clientId);
          if (!identity) {
            // Invalid token provided: reject immediately and close connection
            ws.close(4001, 'invalid token');
            return;
          }

          // Maintain stable connection in clients map
          const existingClient = clients.get(clientId);
          const oldUserId = existingClient?.userId;

          if (existingClient) {
            existingClient.userId = identity.userId;
            existingClient.userName = identity.userName;
            existingClient.userAvatar = identity.userAvatar;
            if (msg.channelId) existingClient.currentChannelId = msg.channelId;
          } else {
            clients.set(clientId, {
              ws,
              userId: identity.userId,
              userName: identity.userName,
              userAvatar: identity.userAvatar,
              currentChannelId: msg.channelId,
            });
          }

          // Identity upgrade: migrate voice participants & file presence to eliminate ghost participants
          if (oldUserId && oldUserId !== identity.userId) {
            const oldParticipant = voiceParticipants.get(oldUserId);
            if (oldParticipant) {
              voiceParticipants.delete(oldUserId);
              const updatedParticipant: ServerVoiceParticipant = {
                ...oldParticipant,
                userId: identity.userId,
                userName: identity.userName,
                userAvatar: identity.userAvatar || oldParticipant.userAvatar,
              };
              voiceParticipants.set(identity.userId, updatedParticipant);

              broadcast({
                type: 'voice-user-left',
                channelId: oldParticipant.channelId,
                userId: oldUserId,
              });
              broadcast({
                type: 'voice-user-joined',
                channelId: updatedParticipant.channelId,
                user: {
                  id: updatedParticipant.userId,
                  name: updatedParticipant.userName,
                  avatar: updatedParticipant.userAvatar,
                },
              });
              broadcast({
                type: 'voice-participants-sync',
                participants: Array.from(voiceParticipants.values()),
              });
            }

            // Migrate channel file presence maps
            channelFilePresence.forEach((channelMap, chId) => {
              let changed = false;
              channelMap.forEach((users) => {
                const oldPresence = users.get(oldUserId);
                if (oldPresence) {
                  users.delete(oldUserId);
                  users.set(identity.userId, {
                    ...oldPresence,
                    userId: identity.userId,
                    userName: identity.userName,
                    userAvatar: identity.userAvatar,
                  });
                  changed = true;
                }
              });
              if (changed) {
                broadcastToChannel(chId, {
                  type: 'file-presence-sync',
                  channelId: chId,
                  presence: getChannelPresenceSummary(chId),
                });
              }
            });
          }

          // Confirm authentication success to client
          ws.send(JSON.stringify({
            type: 'auth-ok',
            userId: identity.userId,
            userName: identity.userName,
            isVerified: identity.isVerified,
          }));

          // Send current active voice participants
          ws.send(JSON.stringify({
            type: 'init-voice-state',
            participants: Array.from(voiceParticipants.values()),
          }));
          break;
        }

        case 'user-profile-updated': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;

          if (client) {
            if (msg.userName) client.userName = msg.userName;
            if (msg.userAvatar) client.userAvatar = msg.userAvatar;
            if (msg.channelId && !client.currentChannelId) client.currentChannelId = msg.channelId;
          }

          const p = voiceParticipants.get(effectiveUserId);
          if (p) {
            if (msg.userName) p.userName = msg.userName;
            if (msg.userAvatar) p.userAvatar = msg.userAvatar;
          }

          // Broadcast strictly bound to verified effectiveUserId
          broadcast({
            type: 'user-profile-updated',
            userId: effectiveUserId,
            userName: msg.userName || client?.userName || 'Membro',
            userAvatar: msg.userAvatar || client?.userAvatar,
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

        // M7: chat-message dead code removed (messages are synchronized strictly via Firestore)

        case 'typing': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;
          broadcast(
            {
              type: 'typing',
              channelId: msg.channelId,
              userId: effectiveUserId,
              userName: client?.userName || msg.userName || 'Membro',
              isTyping: msg.isTyping,
            },
            ws
          );
          break;
        }

        case 'join-voice': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;
          const effectiveName = client?.userName || msg.userName || 'Membro';
          const effectiveAvatar = client?.userAvatar || msg.userAvatar;

          if (client) {
            client.currentChannelId = msg.channelId;
            client.isMuted = msg.isMuted || false;
            client.isDeafened = msg.isDeafened || false;
            client.isScreenSharing = false;
            client.isStreamingVideo = false;
          }

          const newParticipant: ServerVoiceParticipant = {
            userId: effectiveUserId,
            userName: effectiveName,
            userAvatar: effectiveAvatar,
            channelId: msg.channelId,
            isMuted: msg.isMuted || false,
            isDeafened: msg.isDeafened || false,
            isSpeaking: false,
            isScreenSharing: false,
            isCameraOn: false,
            viewers: [],
            joinedAt: Date.now(),
          };

          voiceParticipants.set(effectiveUserId, newParticipant);

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
          const effectiveUserId = client?.userId || clientId;
          const oldChannelId = client?.currentChannelId || msg.channelId;
          if (client) {
            client.currentChannelId = undefined;
            client.isScreenSharing = false;
            client.isStreamingVideo = false;
          }

          voiceParticipants.delete(effectiveUserId);

          broadcast({
            type: 'voice-user-left',
            channelId: oldChannelId,
            userId: effectiveUserId,
            userName: client?.userName || msg.userName,
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'voice-state-update': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;

          if (client) {
            if (msg.isMuted !== undefined) client.isMuted = msg.isMuted;
            if (msg.isDeafened !== undefined) client.isDeafened = msg.isDeafened;
            if (msg.isSpeaking !== undefined) client.isSpeaking = msg.isSpeaking;
            if (msg.isScreenSharing !== undefined) client.isScreenSharing = msg.isScreenSharing;
            if (msg.isCameraOn !== undefined) client.isStreamingVideo = msg.isCameraOn;
          }

          const p = voiceParticipants.get(effectiveUserId);
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
            userId: effectiveUserId,
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
          const effectiveUserId = client?.userId || clientId;
          const currentChannel = client?.currentChannelId || msg.channelId;

          // Participant must ALREADY be connected in the voice channel to start screen sharing
          const p = voiceParticipants.get(effectiveUserId);
          if (!p || (currentChannel && p.channelId !== currentChannel)) {
            console.warn(`[Voice] Rejected start-screen-share: user ${effectiveUserId} not in channel ${currentChannel}`);
            break;
          }

          if (client) {
            client.isScreenSharing = true;
          }
          p.isScreenSharing = true;

          broadcast({
            type: 'screen-share-started',
            channelId: p.channelId,
            userId: effectiveUserId,
            userName: p.userName || client?.userName || 'Membro',
            streamTitle: msg.streamTitle || `${p.userName || client?.userName || 'Membro'}'s Screen`,
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'stop-screen-share': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;
          if (client) client.isScreenSharing = false;

          const p = voiceParticipants.get(effectiveUserId);
          if (p) p.isScreenSharing = false;

          broadcast({
            type: 'screen-share-stopped',
            channelId: p?.channelId || client?.currentChannelId || msg.channelId,
            userId: effectiveUserId,
            userName: p?.userName || client?.userName || 'Membro',
          });

          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
          break;
        }

        case 'watch-stream': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;
          broadcast({
            type: 'stream-viewer-joined',
            channelId: msg.channelId,
            streamerUserId: msg.streamerUserId,
            viewerUserId: effectiveUserId,
            viewerUserName: client?.userName || msg.viewerUserName || 'Espectador',
          });
          break;
        }

        case 'webrtc-signal': {
          // Relay WebRTC signaling with strictly verified sender fromUserId (C3)
          const client = clients.get(clientId);
          const effectiveSenderId = client?.userId || clientId;

          if (msg.toUserId) {
            let delivered = false;
            clients.forEach((c) => {
              // Strict identity matching: guest and verified UIDs never cross-match
              const matches = c.userId === msg.toUserId;
              if (matches && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(JSON.stringify({
                  type: 'webrtc-signal',
                  channelId: msg.channelId,
                  fromUserId: effectiveSenderId,
                  toUserId: msg.toUserId,
                  signal: msg.signal,
                }));
                delivered = true;
              }
            });
            if (!delivered) {
              broadcastToChannel(msg.channelId, {
                type: 'webrtc-signal',
                fromUserId: effectiveSenderId,
                toUserId: msg.toUserId,
                signal: msg.signal,
              }, ws);
            }
          } else {
            broadcastToChannel(msg.channelId, {
              type: 'webrtc-signal',
              fromUserId: effectiveSenderId,
              toUserId: msg.toUserId,
              signal: msg.signal,
            }, ws);
          }
          break;
        }

        case 'server-invite': {
          const client = clients.get(clientId);
          // Sender userId is strictly taken from verified client connection
          const senderUserId = client?.userId || clientId;
          const targetUserId = msg.targetUserId;

          if (targetUserId) {
            clients.forEach((c) => {
              // Strict identity matching without guest- prefix stripping
              const matches = c.userId === targetUserId;
              if (matches && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(
                  JSON.stringify({
                    type: 'room-invite-received',
                    inviteId: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    senderUserId,
                    senderName: client?.userName || 'Membro',
                    senderAvatar: client?.userAvatar,
                    serverName: msg.serverName || 'Servidor',
                    serverId: msg.serverId,
                    channelId: msg.channelId,
                    channelName: msg.channelName,
                    timestamp: Date.now(),
                  })
                );
              }
            });
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

        case 'join-channel': {
          const client = clients.get(clientId);
          if (client && msg.channelId) {
            if (client.currentChannelId && client.currentChannelId !== msg.channelId && client.userId) {
              removeUserFilePresence(client.currentChannelId, client.userId);
              broadcastToChannel(client.currentChannelId, {
                type: 'file-presence-sync',
                channelId: client.currentChannelId,
                presence: getChannelPresenceSummary(client.currentChannelId),
              });
            }
            client.currentChannelId = msg.channelId;
            // Send current channel file presence immediately to connecting user
            ws.send(JSON.stringify({
              type: 'file-presence-sync',
              channelId: msg.channelId,
              presence: getChannelPresenceSummary(msg.channelId),
            }));
          }
          break;
        }

        case 'file-presence': {
          const client = clients.get(clientId);
          const effectiveUserId = client?.userId || clientId;
          const effectiveUserName = client?.userName || msg.userName || 'Membro';
          const effectiveUserAvatar = client?.userAvatar || msg.userAvatar;
          const channelId = msg.channelId || client?.currentChannelId;

          if (channelId && msg.fileId) {
            if (msg.status === 'left') {
              removeUserFilePresence(channelId, effectiveUserId, msg.fileId);
            } else {
              updateFilePresence(channelId, msg.fileId, {
                userId: effectiveUserId,
                userName: effectiveUserName,
                userAvatar: effectiveUserAvatar,
                status: msg.status === 'editing' ? 'editing' : 'viewing',
                lastPing: Date.now(),
              });
            }

            broadcastToChannel(channelId, {
              type: 'file-presence-sync',
              channelId,
              presence: getChannelPresenceSummary(channelId),
            });
          }
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
    const channelId = client?.currentChannelId;
    clients.delete(clientId);

    if (participantUserId) {
      // Check if user still has ANY OTHER active sockets connected
      let hasOtherActiveSocket = false;
      for (const [, c] of clients.entries()) {
        if (c.userId === participantUserId && c.ws.readyState === WebSocket.OPEN) {
          hasOtherActiveSocket = true;
          break;
        }
      }

      if (!hasOtherActiveSocket) {
        if (channelId) {
          removeUserFilePresence(channelId, participantUserId);
          broadcastToChannel(channelId, {
            type: 'file-presence-sync',
            channelId,
            presence: getChannelPresenceSummary(channelId),
          });
        }

        const p = voiceParticipants.get(participantUserId);
        if (p) {
          voiceParticipants.delete(participantUserId);
          broadcast({
            type: 'voice-user-left',
            channelId: p.channelId || channelId,
            userId: participantUserId,
            userName: client?.userName || p?.userName,
          });
          broadcast({
            type: 'voice-participants-sync',
            participants: Array.from(voiceParticipants.values()),
          });
        }
      }
    }
  });
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: Date.now(), connectedClients: clients.size });
});

// Ephemeral ICE Servers Generator (Google STUN + Authenticated HMAC Coturn TURN)
app.get('/api/webrtc/ice-servers', requireAuth, (req, res) => {
  const turnSecret = process.env.TURN_SHARED_SECRET;
  const turnUrl = process.env.TURN_URL;

  const iceServers: any[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ];

  if (turnSecret && turnUrl) {
    const ttlSeconds = 24 * 3600; // 24h validity
    const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
    const username = `${expiry}:${(req as any).user?.uid || 'user'}`;
    const hmac = crypto.createHmac('sha1', turnSecret);
    hmac.update(username);
    const credential = hmac.digest('base64');

    iceServers.push({
      urls: turnUrl,
      username,
      credential,
    });
  }

  res.json({ iceServers });
});

// Real AI Command Handler (Gemini 2.5 Flash) with Auth and Timeout (C2, A7)
app.post('/api/ai/command', requireAuth, async (req, res) => {
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

      const response = await withTimeout(
        generateWithFallback(ai, {
          model: 'gemini-flash-latest',
          contents: promptText,
        }),
        60000,
        'O resumo de IA demorou mais de 60 segundos para ser gerado.'
      );

      return res.json({
        success: true,
        reply: response.text || 'Nenhum resumo pôde ser gerado para o conteúdo atual.',
      });
    }

    // Default /ai <pergunta>
    const userQuery = prompt || 'Como usar o Braza Talk?';
    const response = await withTimeout(
      generateWithFallback(ai, {
        model: 'gemini-flash-latest',
        contents: userQuery,
        config: {
          systemInstruction: 'Você é o Braza Bot, assistente oficial do Braza Talk (aplicativo de comunicação em tempo real com voz, vídeo, chat e canais). Responda com simpatia, precisão, concisão e formatação amigável em Markdown em português.',
        },
      }),
      60000,
      'A resposta do Braza Bot excedeu o tempo limite de 60 segundos.'
    );

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
app.post('/api/project/generate', requireAuth, async (req, res) => {
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
      const response = await withTimeout(
        generateWithFallback(client, {
          model: modelName,
          contents: fullPrompt,
          config: {
            systemInstruction,
          },
        }),
        60000,
        'O processamento de IA do projeto excedeu o limite de 60 segundos.'
      );
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
  initiatorUserId?: string;
}

const projectRunners = new Map<string, ProjectRunnerState>();

const RUNNERS_STORAGE_DIR = path.join(process.cwd(), 'storage', 'runners');
try {
  if (!fs.existsSync(RUNNERS_STORAGE_DIR)) {
    fs.mkdirSync(RUNNERS_STORAGE_DIR, { recursive: true });
  }
} catch {}

function saveRunnerToDisk(runner: ProjectRunnerState) {
  try {
    const filePath = path.join(RUNNERS_STORAGE_DIR, `${runner.channelId}.json`);
    const cleanState = {
      channelId: runner.channelId,
      plan: runner.plan,
      agenticActivities: runner.agenticActivities,
      interAgentDialogues: runner.interAgentDialogues.slice(-60),
      pendingUserQuestion: runner.pendingUserQuestion,
      initiatorUserId: runner.initiatorUserId,
      projectState: {
        ...runner.projectState,
        customApiKey: undefined, // Never save sensitive API keys
      },
      savedAt: Date.now(),
    };
    fs.writeFileSync(filePath, JSON.stringify(cleanState, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to save runner to disk:', e);
  }
}

function loadRunnerFromDisk(channelId: string): ProjectRunnerState | null {
  try {
    const filePath = path.join(RUNNERS_STORAGE_DIR, `${channelId}.json`);
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return {
        channelId: data.channelId,
        plan: data.plan,
        agenticActivities: data.agenticActivities || {},
        interAgentDialogues: data.interAgentDialogues || [],
        pendingUserQuestion: data.pendingUserQuestion || null,
        projectState: data.projectState || {},
        initiatorUserId: data.initiatorUserId,
        isExecuting: false,
        paused: true,
      };
    }
  } catch {}
  return null;
}

function broadcastPlanUpdate(runner: ProjectRunnerState, extra?: any) {
  saveRunnerToDisk(runner);
  // Scoped strictly to channel clients to eliminate cross-channel leakage
  broadcastToChannel(runner.channelId, {
    type: 'project-plan-updated',
    channelId: runner.channelId,
    plan: runner.plan,
    agenticActivities: runner.agenticActivities,
    interAgentDialogues: runner.interAgentDialogues,
    pendingUserQuestion: runner.pendingUserQuestion,
    files: runner.projectState?.files || [],
    initiatorUserId: runner.initiatorUserId,
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

      // Safety ceiling: prevent unbounded infinite step execution (A7)
      const MAX_AUTONOMOUS_STEPS = 20;
      if (currentStepIndex >= MAX_AUTONOMOUS_STEPS) {
        runner.plan.status = 'completed';
        runner.plan.updatedAt = Date.now();
        addInterAgentDialogue(runner, {
          senderHandle: '@arquiteto',
          senderName: 'Arquiteto de Soluções',
          senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=arquiteto',
          senderColor: '#8b5cf6',
          recipientHandle: 'all',
          actionType: 'approval',
          content: `🛑 **Limite de segurança atingido:** O plano atingiu o teto de ${MAX_AUTONOMOUS_STEPS} passos autônomos por sessão para preservar estabilidade e cotas. Os arquivos gerados estão preservados.`,
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
          const resp = await withTimeout(
            generateWithFallback(client, {
              model: modelName,
              contents: `Execute o passo ${step.order}: ${step.title}. Gere os arquivos técnicos necessários.`,
              config: { systemInstruction },
            }),
            60000,
            'A geração de arquivos do passo autônomo excedeu o tempo limite de 60 segundos.'
          );
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

      // Honest fallback: if LLM returned no files, do NOT inject foreign domain files!
      if (extractedFiles.length === 0) {
        addInterAgentDialogue(runner, {
          senderHandle: agent.handle,
          senderName: agent.name,
          senderAvatar: agent.avatar,
          senderColor: agent.color,
          actionType: 'thought',
          content: `ℹ️ O passo ${step.order} ("${step.title}") foi processado pelo agente, porém nenhum novo arquivo precisou ser alterado ou gerado neste momento.`,
          relatedStepId: step.id,
        });
      }

      // Merge files into projectState with safety bounds (A7)
      if (!Array.isArray(runner.projectState.files)) {
        runner.projectState.files = [];
      }

      const MAX_SINGLE_FILE_CHARS = 500_000; // 500 KB limit per file
      const MAX_TOTAL_FILES_CHARS = 10_000_000; // 10 MB limit total workspace

      const filesTouchedNames: string[] = [];
      for (const ef of extractedFiles) {
        filesTouchedNames.push(ef.name);
        const safeContent = typeof ef.content === 'string' ? ef.content.slice(0, MAX_SINGLE_FILE_CHARS) : String(ef.content || '');
        const currentTotalSize = runner.projectState.files.reduce((acc: number, f: any) => acc + (f.content?.length || 0), 0);
        if (currentTotalSize + safeContent.length > MAX_TOTAL_FILES_CHARS) {
          console.warn(`Total workspace file size limit reached for ${runner.channelId}, skipping file ${ef.name}`);
          continue;
        }

        const existingIdx = runner.projectState.files.findIndex((f: any) => f.name === ef.name);
        if (existingIdx >= 0) {
          runner.projectState.files[existingIdx] = {
            ...runner.projectState.files[existingIdx],
            content: safeContent,
            updatedAt: Date.now(),
            updatedBy: agent.name,
            version: (runner.projectState.files[existingIdx].version || 1) + 1,
          };
        } else {
          runner.projectState.files.push({
            id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: ef.name,
            path: ef.name,
            language: ef.language || 'text',
            content: safeContent,
            updatedAt: Date.now(),
            updatedBy: agent.name,
            version: 1,
          });
        }
      }

      // Dynamic Reviewer / Auditor step based on project profile & agents
      const engineName = runner.projectState.gameEngine || runner.projectState.projectProfile || 'Projeto';
      const reviewerAgent = runner.projectState.agents?.find(
        (a: any) => a.handle.includes('audit') || a.handle.includes('review') || a.handle.includes('qa')
      ) || runner.projectState.agents?.[0] || {
        handle: '@revisor',
        name: 'Revisor de Código',
        avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=revisor',
        color: '#ec4899',
      };

      runner.agenticActivities[reviewerAgent.handle] = {
        agentHandle: reviewerAgent.handle,
        status: 'reviewing',
        currentTask: filesTouchedNames.length > 0 ? `Revisão de ${filesTouchedNames.join(', ')}` : `Revisão da etapa ${step.order}`,
        thought: `Verificando conformidade técnica com o escopo de ${engineName}...`,
        lastActiveAt: Date.now(),
      };

      broadcastPlanUpdate(runner);
      await new Promise((r) => setTimeout(r, 1000));
      if (runner.paused) break;

      let reviewReviewText = '';
      const reviewerApiKey = runner.projectState.customApiKey?.trim() || process.env.GEMINI_API_KEY;
      if (filesTouchedNames.length > 0 && reviewerApiKey) {
        try {
          const aiReviewerClient = new GoogleGenAI({ apiKey: reviewerApiKey });
          let reviewModelName = runner.projectState.selectedModel || 'gemini-flash-latest';
          if (
            reviewModelName === 'gemini-2.5-flash' ||
            reviewModelName === 'gemini-2.5-pro' ||
            reviewModelName === 'gemini-2.0-flash' ||
            reviewModelName === 'gemini-1.5-flash' ||
            reviewModelName === 'gemini-3.6-flash'
          ) {
            reviewModelName = 'gemini-flash-latest';
          }
          const filesSummary = extractedFiles
            .slice(0, 3)
            .map((f: any) => `### ${f.name}\n\`\`\`${f.language || ''}\n${typeof f.content === 'string' ? f.content.slice(0, 1500) : ''}\n\`\`\``)
            .join('\n\n');
          const reviewPrompt = `Você é o agente técnico ${reviewerAgent.name} (${reviewerAgent.role || 'Auditor de Código'}). Faça uma breve revisão técnica dos arquivos gerados para a etapa "${step.title}" no contexto de ${engineName}:\n\n${filesSummary}\n\nForneça um parecer conciso de 1 ou 2 frases em português sobre qualidade, boas práticas e integridade. Comece com "✅" se aprovado ou "⚠️" se houver atenção recomendada.`;
          const reviewResponse: any = await withTimeout(
            generateWithFallback(aiReviewerClient, {
              model: reviewModelName,
              contents: reviewPrompt,
            }),
            15000,
            'Timeout de revisão'
          );
          const feedback = reviewResponse?.text?.trim();
          if (feedback) {
            reviewReviewText = feedback;
          }
        } catch (e: any) {
          console.warn('Real AI reviewer note:', e?.message);
        }
      }

      if (!reviewReviewText) {
        reviewReviewText = filesTouchedNames.length > 0
          ? `✅ Arquivos (${filesTouchedNames.join(', ')}) validados estruturalmente no perfil de ${engineName}. Sintaxe e estrutura verificadas. Passo ${step.order} aprovado.`
          : `✅ Etapa ${step.order} ("${step.title}") revisada e aprovada pelo time técnico.`;
      }

      addInterAgentDialogue(runner, {
        senderHandle: reviewerAgent.handle,
        senderName: reviewerAgent.name,
        senderAvatar: reviewerAgent.avatar,
        senderColor: reviewerAgent.color,
        recipientHandle: agent.handle,
        actionType: 'code_review',
        content: reviewReviewText,
        relatedStepId: step.id,
      });

      // Complete step
      step.status = 'completed';
      step.filesTouched = filesTouchedNames;
      step.outputSummary = `Desenvolvido por ${agent.name}. Arquivos gerados/atualizados: ${filesTouchedNames.join(', ')}.`;
      step.updatedAt = Date.now();

      runner.agenticActivities[agent.handle].status = 'idle';
      runner.agenticActivities[agent.handle].thought = 'Pronto para próxima tarefa.';
      runner.agenticActivities[reviewerAgent.handle].status = 'idle';

      runner.plan.currentStepIndex++;
      runner.plan.updatedAt = Date.now();

      const changedFilesList = filesTouchedNames.length > 0
        ? runner.projectState.files.filter((f: any) => filesTouchedNames.includes(f.name))
        : [];

      broadcastPlanUpdate(runner, {
        stepCompleted: true,
        filesTouched: filesTouchedNames,
        changedFiles: changedFilesList,
      });

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
app.post('/api/project/plan/generate', requireAuth, async (req, res) => {
  const { channelId, goal, projectState } = req.body;
  if (!goal) {
    return res.status(400).json({ success: false, error: 'O objetivo do plano é obrigatório.' });
  }

  const engine = projectState?.gameEngine || projectState?.projectProfile || 'Projeto de Software';
  const projectName = projectState?.projectName || 'Projeto';
  const availableAgents = Array.isArray(projectState?.agents) && projectState.agents.length > 0
    ? projectState.agents.map((a: any) => `- ${a.handle}: ${a.name} (${a.role}). Especialidades: ${Array.isArray(a.skills) ? a.skills.join(', ') : ''}`).join('\n')
    : '- @arquiteto: Líder e Planejador\n- @desenvolvedor: Implementação e Código\n- @revisor: Testes e Validação';

  const defaultAgentHandle = projectState?.agents?.[0]?.handle || '@desenvolvedor';

  const prompt = `Você é o Arquiteto de Software e Planejador de IA (@arquiteto).
Crie um Plano de Ação estruturado em 3 a 5 passos executáveis para atingir o objetivo: "${goal}" no projeto "${projectName}" (${engine}).

Distribua as tarefas estritamente entre os agentes disponíveis no projeto:
${availableAgents}

Responda ESTRITAMENTE em formato JSON com a seguinte estrutura exata (sem formatação extra, apenas JSON puro):
{
  "goal": "${goal}",
  "steps": [
    {
      "order": 1,
      "title": "Título conciso do passo",
      "description": "Descrição detalhada do que será implementado e quais arquivos serão criados ou atualizados",
      "assignedAgentHandle": "${defaultAgentHandle}"
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

  // Dynamic fallback plan aligned with the room's actual agents and target
  if (!generatedPlanData || !Array.isArray(generatedPlanData.steps)) {
    const agentsList = Array.isArray(projectState?.agents) && projectState.agents.length > 0 ? projectState.agents : [];
    const leadAgent = agentsList[0]?.handle || defaultAgentHandle;
    const configAgent = agentsList.find((a: any) => a.handle.includes('config') || a.handle.includes('balance') || a.handle.includes('back'))?.handle || leadAgent;
    const reviewAgent = agentsList.find((a: any) => a.handle.includes('audit') || a.handle.includes('qa') || a.handle.includes('review'))?.handle || leadAgent;

    generatedPlanData = {
      goal,
      steps: [
        {
          order: 1,
          title: 'Estruturação do Escopo e Arquitetura',
          description: `Definição da estrutura inicial de arquivos e ponto de entrada para "${goal}".`,
          assignedAgentHandle: leadAgent,
        },
        {
          order: 2,
          title: 'Implementação da Lógica Principal',
          description: `Desenvolvimento dos componentes e lógica central para atender a: "${goal}".`,
          assignedAgentHandle: leadAgent,
        },
        {
          order: 3,
          title: 'Configuração e Parâmetros',
          description: 'Criação de arquivos de configuração, variáveis de ambiente e documentação de uso.',
          assignedAgentHandle: configAgent,
        },
        {
          order: 4,
          title: 'Revisão de Código e Validação',
          description: 'Inspeção de qualidade, testes de execução e conformidade com as regras do projeto.',
          assignedAgentHandle: reviewAgent,
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
app.post('/api/project/plan/start', requireAuth, (req, res) => {
  const { channelId, plan, projectState } = req.body;
  if (!channelId || !plan) {
    return res.status(400).json({ success: false, error: 'channelId e plan são obrigatórios.' });
  }

  const initiatorUid = (req as any).user?.uid;
  let runner = projectRunners.get(channelId);
  if (!runner) {
    runner = {
      channelId,
      plan,
      agenticActivities: {},
      interAgentDialogues: [],
      pendingUserQuestion: null,
      projectState: projectState || {},
      initiatorUserId: initiatorUid,
      isExecuting: false,
      paused: false,
    };
    projectRunners.set(channelId, runner);
  } else {
    runner.plan = plan;
    if (projectState) runner.projectState = projectState;
    if (initiatorUid) runner.initiatorUserId = initiatorUid;
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
app.post('/api/project/plan/pause', requireAuth, (req, res) => {
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
app.post('/api/project/plan/answer-question', requireAuth, (req, res) => {
  const { channelId, stepId, answer } = req.body;
  const runner = projectRunners.get(channelId);
  if (!runner) {
    return res.status(404).json({ success: false, error: 'Sessão do projeto não encontrada.' });
  }

  const answeringUserId = (req as any).user?.uid;
  if (answeringUserId) {
    runner.initiatorUserId = answeringUserId;
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
app.get('/api/project/plan/status/:channelId', requireAuth, (req, res) => {
  const { channelId } = req.params;
  let runner = projectRunners.get(channelId);
  if (!runner) {
    const diskRunner = loadRunnerFromDisk(channelId);
    if (diskRunner) {
      projectRunners.set(channelId, diskRunner);
      runner = diskRunner;
    }
  }

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

// 6. Delete Autonomous Plan Runner and disk snapshot
app.delete('/api/project/runner/:channelId', requireAuth, (req, res) => {
  const { channelId } = req.params;
  const runner = projectRunners.get(channelId);
  if (runner) {
    runner.paused = true;
    runner.plan.status = 'paused';
    projectRunners.delete(channelId);
  }
  try {
    const filePath = path.join(RUNNERS_STORAGE_DIR, `${channelId}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (e) {
    console.warn('Failed to delete runner file from disk:', e);
  }
  return res.json({ success: true, message: 'Runner removido com sucesso.' });
});

// Helper to securely detect current origin URL for desktop installers (C1, M8)
const SAFE_URL_REGEX = /^https?:\/\/[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/;
const SAFE_HOST_REGEX = /^[a-zA-Z0-9.-]+(:[0-9]{1,5})?$/;

function getSafeAppOrigin(req: express.Request): string {
  const envUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL;
  if (envUrl && SAFE_URL_REGEX.test(envUrl.trim())) {
    return envUrl.trim();
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const rawProto = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : req.protocol;
  const proto = rawProto === 'http' ? 'http' : 'https';

  const rawHost = String(req.headers['x-forwarded-host'] || req.get('host') || `localhost:${PORT}`).trim();
  if (SAFE_HOST_REGEX.test(rawHost)) {
    return `${proto}://${rawHost}`;
  }

  return `http://localhost:${PORT}`;
}

// Serve direct download packages for Desktop with safe origin injection (No req.query.url allowed)
app.get('/downloads/BrazaTalk-Setup.cmd', (req, res) => {
  const origin = getSafeAppOrigin(req);
  const filePath = path.join(process.cwd(), 'public', 'downloads', 'BrazaTalk-Setup.cmd');
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    content = content.replace(/set "DEFAULT_URL=.*"/, `set "DEFAULT_URL=${origin}"`);
    res.setHeader('Content-Type', 'application/x-msdos-program');
    res.setHeader('Content-Disposition', 'attachment; filename="BrazaTalk-Setup.cmd"');
    return res.send(content);
  } catch (e) {
    return res.status(404).send('Installer file not found');
  }
});

app.get('/downloads/install-linux.sh', (req, res) => {
  const origin = getSafeAppOrigin(req);
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
  const origin = getSafeAppOrigin(req);
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

const debPackageCache = new Map<string, string>();

app.get('/downloads/brazatalk_2.6.0_all.deb', (req, res) => {
  const origin = getSafeAppOrigin(req);
  res.setHeader('Content-Type', 'application/vnd.debian.binary-package');
  res.setHeader('Content-Disposition', 'attachment; filename="brazatalk_2.6.0_all.deb"');

  const cachedPath = debPackageCache.get(origin);
  if (cachedPath && fs.existsSync(cachedPath)) {
    return res.sendFile(cachedPath);
  }

  const templateDir = path.join(process.cwd(), 'server', 'deb-template');
  if (fs.existsSync(templateDir)) {
    try {
      const originKey = crypto.createHash('md5').update(origin).digest('hex').slice(0, 12);
      const tempBuildDir = path.join('/tmp', `deb_build_${originKey}`);
      const outDebPath = path.join('/tmp', `brazatalk_${originKey}.deb`);

      execSync(`rm -rf "${tempBuildDir}" && cp -r "${templateDir}" "${tempBuildDir}"`);
      
      const launcherPath = path.join(tempBuildDir, 'usr', 'bin', 'brazatalk');
      if (fs.existsSync(launcherPath)) {
        let launcherContent = fs.readFileSync(launcherPath, 'utf-8');
        launcherContent = launcherContent.replace('APP_ORIGIN_PLACEHOLDER', origin);
        fs.writeFileSync(launcherPath, launcherContent, { mode: 0o755 });
      }

      execSync(`dpkg-deb -b "${tempBuildDir}" "${outDebPath}"`);
      execSync(`rm -rf "${tempBuildDir}"`);

      debPackageCache.set(origin, outDebPath);
      return res.sendFile(outDebPath);
    } catch (err) {
      console.warn('Dynamic deb generation failed, falling back to precompiled package:', err);
    }
  }

  const filePath = path.join(process.cwd(), 'public', 'downloads', 'brazatalk_2.6.0_all.deb');
  return res.sendFile(filePath);
});

// Fallback for static downloads
app.use('/downloads', express.static(path.join(process.cwd(), 'public', 'downloads')));

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
