import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';

const app = express();
const server = http.createServer(app);
const PORT = 3000;

app.use(express.json());

// In-memory real-time state for connected clients & voice rooms
interface ConnectedClient {
  ws: WebSocket;
  userId: string;
  userName: string;
  userAvatar: string;
  currentChannelId?: string;
  isMuted?: boolean;
  isDeafened?: boolean;
  isScreenSharing?: boolean;
  isStreamingVideo?: boolean;
  isSpeaking?: boolean;
}

const clients = new Map<string, ConnectedClient>();

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
  let clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      switch (msg.type) {
        case 'auth': {
          clientId = msg.userId || clientId;
          clients.set(clientId, {
            ws,
            userId: msg.userId,
            userName: msg.userName,
            userAvatar: msg.userAvatar,
            currentChannelId: msg.channelId,
          });

          // Send current active voice participants
          const participants = Array.from(clients.values())
            .filter((c) => !!c.currentChannelId)
            .map((c) => ({
              userId: c.userId,
              userName: c.userName,
              userAvatar: c.userAvatar,
              channelId: c.currentChannelId,
              isMuted: !!c.isMuted,
              isDeafened: !!c.isDeafened,
              isSpeaking: !!c.isSpeaking,
              isScreenSharing: !!c.isScreenSharing,
              isCameraOn: !!c.isStreamingVideo,
              viewers: [],
              joinedAt: Date.now(),
            }));

          ws.send(JSON.stringify({ type: 'init-voice-state', participants }));
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
            client.isMuted = msg.isMuted || false;
            client.isDeafened = msg.isDeafened || false;
            client.isScreenSharing = false;
            client.isStreamingVideo = false;
          }

          // Broadcast user joined sound & presence event
          broadcast({
            type: 'voice-user-joined',
            channelId: msg.channelId,
            user: {
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
            },
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

          broadcast({
            type: 'voice-user-left',
            channelId: oldChannelId,
            userId: msg.userId,
            userName: msg.userName,
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
          break;
        }

        case 'start-screen-share': {
          const client = clients.get(clientId);
          if (client) client.isScreenSharing = true;

          broadcast({
            type: 'screen-share-started',
            channelId: msg.channelId,
            userId: msg.userId,
            userName: msg.userName,
            streamTitle: msg.streamTitle || `${msg.userName}'s Screen`,
          });
          break;
        }

        case 'stop-screen-share': {
          const client = clients.get(clientId);
          if (client) client.isScreenSharing = false;

          broadcast({
            type: 'screen-share-stopped',
            channelId: msg.channelId,
            userId: msg.userId,
            userName: msg.userName,
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
          broadcastToChannel(msg.channelId, {
            type: 'webrtc-signal',
            fromUserId: msg.fromUserId,
            toUserId: msg.toUserId,
            signal: msg.signal,
          }, ws);
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
    if (client && client.currentChannelId) {
      broadcast({
        type: 'voice-user-left',
        channelId: client.currentChannelId,
        userId: client.userId,
        userName: client.userName,
      });
    }
    clients.delete(clientId);
  });
});

// REST API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', serverTime: Date.now(), connectedClients: clients.size });
});

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
    console.log(`DisSphere Real-time Server listening on http://0.0.0.0:${PORT}`);
  });
}

start();
