import { 
  auth,
  db, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot 
} from './firebase';
import { Server, Message, User, Permission, ChannelType } from '../types';
import { offlineStorage } from './offlineStorage';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

/**
 * Recursively strips undefined fields from an object/array so Firestore setDoc/updateDoc never rejects it.
 */
function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => sanitizeFirestoreData(item)) as unknown as T;
  }
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = sanitizeFirestoreData(value);
      }
    }
    return cleaned as T;
  }
  return obj;
}

export const firebaseDb = {
  // Listen to servers the user is authorized to see (owned, joined, or official public community)
  subscribeToServers(userId: string, callback: (servers: Server[]) => void) {
    // Deliver offline cached servers immediately for zero-latency startup
    offlineStorage.getCachedServers().then((cached) => {
      if (cached && cached.length > 0) {
        callback(cached);
      }
    }).catch(() => {});

    const serversRef = collection(db, 'servers');
    return onSnapshot(serversRef, (snapshot) => {
      const allServers: Server[] = [];
      snapshot.forEach((docSnap) => {
        allServers.push({ id: docSnap.id, ...docSnap.data() } as Server);
      });

      // Filter: users only see servers where they are owner, member, or official public community
      const userServers = allServers.filter((s) => {
        if (!userId) return s.id === 'server-braza-community' || (s as any).isPublic === true;
        const isOwner = s.ownerId === userId;
        const isMember = Array.isArray(s.members) && s.members.some((m) => m && m.id === userId);
        const isPublicCommunity = s.id === 'server-braza-community' || (s as any).isPublic === true;
        return isOwner || isMember || isPublicCommunity;
      });

      // Ensure servers have the AI Project Room channel
      userServers.forEach((srv) => {
        if (!srv.channels.some((c) => c.type === 'project')) {
          const catProjId = `cat-project-${srv.id}`;
          if (!srv.categories.some((cat) => cat.name.includes('PROJETO'))) {
            srv.categories.push({ id: catProjId, serverId: srv.id, name: 'SALAS DE PROJETO IA' });
          }
          srv.channels.push({
            id: `chan-lab-mods-${srv.id}`,
            serverId: srv.id,
            categoryId: catProjId,
            name: 'lab-mods-ia',
            type: 'project' as ChannelType,
            topic: 'Sala de Projeto IA: Workspace de Mods, Agentes, RAG, Arquivos e Sandbox de Testes',
            isE2EE: false,
            isPrivate: false,
          });
        }
      });

      callback(userServers);
      offlineStorage.cacheServers(userServers).catch(() => {});
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'servers');
      // Graceful fallback to offline cache so user experience remains uninterrupted
      offlineStorage.getCachedServers().then((cached) => {
        if (cached && cached.length > 0) {
          callback(cached);
        }
      }).catch(() => {});
    });
  },

  // Join a server (via invite code, link, or public explorer)
  async joinServer(serverId: string, user: User): Promise<Server | null> {
    try {
      let targetServerId = serverId.trim();
      let serverRef = doc(db, 'servers', targetServerId);
      let serverSnap = await getDoc(serverRef);

      if (!serverSnap.exists()) {
        // Search across all servers if passed a short invite code or slug
        const serversRef = collection(db, 'servers');
        const snap = await getDocs(serversRef);
        let foundDoc: any = null;
        snap.forEach((d) => {
          const s = d.data();
          if (
            d.id.toLowerCase() === targetServerId.toLowerCase() ||
            d.id.replace('server-', '').toLowerCase() === targetServerId.toLowerCase() ||
            (s.inviteCode && String(s.inviteCode).toLowerCase() === targetServerId.toLowerCase())
          ) {
            foundDoc = { id: d.id, ...s };
          }
        });

        if (foundDoc) {
          targetServerId = foundDoc.id;
          serverRef = doc(db, 'servers', targetServerId);
          serverSnap = await getDoc(serverRef);
        } else {
          return null;
        }
      }

      const serverData = { id: serverSnap.id, ...serverSnap.data() } as Server;
      const members = serverData.members || [];
      const alreadyMember = members.some((m) => m && m.id === user.id);

      if (!alreadyMember) {
        const updatedMembers = [...members, user];
        const memberIds = Array.from(new Set(updatedMembers.map((m) => m.id)));
        await setDoc(serverRef, sanitizeFirestoreData({ ...serverData, members: updatedMembers, memberIds }), { merge: true });
        serverData.members = updatedMembers;
        serverData.memberIds = memberIds;
      }

      return serverData;
    } catch (err) {
      console.error('Error joining server:', err);
      return null;
    }
  },

  // Fetch all discoverable public servers / communities
  async getAllPublicServers(): Promise<Server[]> {
    try {
      const serversRef = collection(db, 'servers');
      const snapshot = await getDocs(serversRef);
      const list: Server[] = [];
      snapshot.forEach((docSnap) => {
        const s = { id: docSnap.id, ...docSnap.data() } as Server;
        if (s.id === 'server-braza-community' || (s as any).isPublic === true) {
          list.push(s);
        }
      });
      return list;
    } catch (e) {
      console.warn('Could not fetch public servers:', e);
      return [];
    }
  },

  // Get single server by ID or invite code
  async getServerById(serverId: string): Promise<Server | null> {
    try {
      const serverRef = doc(db, 'servers', serverId);
      const serverSnap = await getDoc(serverRef);
      if (serverSnap.exists()) {
        return { id: serverSnap.id, ...serverSnap.data() } as Server;
      }
      return null;
    } catch (e) {
      return null;
    }
  },

  // Save or update server
  async saveServer(server: Server) {
    const serverRef = doc(db, 'servers', server.id);
    const memberIds = Array.from(
      new Set([
        ...(server.members || []).map((m) => m.id),
        server.ownerId,
      ].filter(Boolean))
    );
    const enrichedServer: Server = {
      ...server,
      memberIds,
      isPublic: server.id === 'server-braza-community' || server.isPublic === true,
    };
    const cleaned = sanitizeFirestoreData(enrichedServer);
    await setDoc(serverRef, cleaned, { merge: true });
    offlineStorage.cacheServers([enrichedServer]).catch(() => {});
  },

  // Delete server
  async deleteServer(serverId: string) {
    await deleteDoc(doc(db, 'servers', serverId));
  },

  // Listen to messages for a specific channel with pagination/limit and offline cache
  subscribeToChannelMessages(channelId: string, callback: (messages: Message[]) => void, maxCount: number = 60) {
    // Deliver offline cached messages immediately
    offlineStorage.getCachedMessages(channelId).then((cached) => {
      if (cached && cached.length > 0) {
        callback(cached);
      }
    }).catch(() => {});

    const messagesRef = collection(db, 'messages');
    
    // Attempt ordered query by timestamp descending (latest messages)
    try {
      const q = query(
        messagesRef, 
        where('channelId', '==', channelId),
        orderBy('timestamp', 'desc'),
        limit(maxCount)
      );
      
      return onSnapshot(q, (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((docSnap) => {
          msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
        });
        // Present in ascending order for chat window display
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        callback(msgs);
        offlineStorage.cacheMessages(msgs).catch(() => {});
      }, (err) => {
        console.warn('Firestore ordered messages listener fell back to unordered:', err?.message || err);
        // Fallback in case composite index is not yet built
        const fallbackQ = query(
          messagesRef,
          where('channelId', '==', channelId),
          limit(maxCount)
        );
        return onSnapshot(fallbackQ, (fallbackSnap) => {
          const msgs: Message[] = [];
          fallbackSnap.forEach((docSnap) => {
            msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
          });
          msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          callback(msgs);
          offlineStorage.cacheMessages(msgs).catch(() => {});
        }, (fallbackErr) => {
          handleFirestoreError(fallbackErr, OperationType.LIST, `messages?channelId=${channelId}`);
          offlineStorage.getCachedMessages(channelId).then((cached) => {
            if (cached && cached.length > 0) callback(cached);
          }).catch(() => {});
        });
      });
    } catch (e) {
      // Fallback if query creation fails
      const fallbackQ = query(messagesRef, where('channelId', '==', channelId), limit(maxCount));
      return onSnapshot(fallbackQ, (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((docSnap) => {
          msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
        });
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        callback(msgs);
      }, (err) => {
        handleFirestoreError(err, OperationType.LIST, `messages?channelId=${channelId}`);
      });
    }
  },

  // Send a message with offline fallback queue
  async sendMessage(message: Message) {
    const msgRef = doc(db, 'messages', message.id);
    const cleaned = sanitizeFirestoreData(message);
    try {
      await setDoc(msgRef, cleaned);
      await offlineStorage.cacheMessages([message]);
    } catch (err) {
      console.warn('Firestore sendMessage failed or offline, queuing to outbox:', err);
      await offlineStorage.queueOutboxMessage(message);
      await offlineStorage.cacheMessages([message]);
      throw err;
    }
  },

  // Sync outbox messages to Firestore
  async syncOutbox(): Promise<number> {
    const pending = await offlineStorage.getOutboxMessages();
    if (pending.length === 0) return 0;
    let synced = 0;
    for (const msg of pending) {
      try {
        const msgRef = doc(db, 'messages', msg.id);
        const cleaned = sanitizeFirestoreData(msg);
        await setDoc(msgRef, cleaned);
        synced++;
      } catch (err) {
        console.warn('Failed to sync outbox item:', msg.id, err);
      }
    }
    if (synced === pending.length) {
      await offlineStorage.clearOutbox();
    }
    return synced;
  },

  // Update a message (e.g. edit, reactions, pin)
  async updateMessage(messageId: string, updates: Partial<Message>) {
    const msgRef = doc(db, 'messages', messageId);
    const cleaned = sanitizeFirestoreData(updates);
    await updateDoc(msgRef, cleaned as Record<string, any>);
  },

  // Delete a message
  async deleteMessage(messageId: string, serverId?: string, channelId?: string) {
    if (serverId && channelId) {
      try {
        await deleteDoc(doc(db, 'servers', serverId, 'channels', channelId, 'messages', messageId));
      } catch (e) {
        console.warn('Subcollection delete failed, attempting root delete:', e);
      }
    }
    await deleteDoc(doc(db, 'messages', messageId));
  },

  // User Profile
  async updateUserProfile(userId: string, updates: Partial<User>) {
    const userRef = doc(db, 'users', userId);
    const cleaned = sanitizeFirestoreData(updates);
    await setDoc(userRef, cleaned, { merge: true });
  },

  // Fetch or seed default community server if none exists
  async initializeDefaultServerIfEmpty(user: User): Promise<Server> {
    try {
      const serversRef = collection(db, 'servers');
      const snap = await getDocs(serversRef);
      if (!snap.empty) {
        const first = snap.docs[0];
        return { id: first.id, ...first.data() } as Server;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'servers');
      // Attempt to load from offline cache before falling back to local object
      const cached = await offlineStorage.getCachedServers().catch(() => []);
      if (cached && cached.length > 0) {
        return cached[0];
      }
    }

    // Seed clean initial official server
    const initialServerId = 'server-braza-community';
    const initialServer: Server = {
      id: initialServerId,
      name: 'Braza Talk Oficial',
      icon: '🔥',
      banner: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
      description: 'Servidor oficial do Braza Talk. Bate-papo, salas de voz em alta definição e compartilhamento de tela seguro.',
      ownerId: user.id,
      e2eeEnabled: true,
      createdAt: Date.now(),
      sounds: {
        pack: 'braza_classic',
        volume: 0.8,
        userJoinSound: true,
        userLeaveSound: true,
        screenShareStartSound: true,
        screenShareEndSound: true,
        streamViewerSound: true,
        mentionSound: true,
        messageSound: true,
      },
      roles: [
        {
          id: `role-admin-${initialServerId}`,
          name: 'Administrador',
          color: '#ef4444',
          hoist: true,
          position: 1,
          permissions: Object.values(Permission),
        },
        {
          id: `role-member-${initialServerId}`,
          name: '@everyone',
          color: '#94a3b8',
          hoist: false,
          position: 2,
          permissions: [
            Permission.SEND_MESSAGES,
            Permission.CONNECT_VOICE,
            Permission.SPEAK,
            Permission.ATTACH_FILES,
          ],
        },
      ],
      categories: [
        { id: `cat-text-${initialServerId}`, serverId: initialServerId, name: 'CANAIS DE TEXTO' },
        { id: `cat-voice-${initialServerId}`, serverId: initialServerId, name: 'SALAS DE VOZ & VÍDEO' },
        { id: `cat-project-${initialServerId}`, serverId: initialServerId, name: 'SALAS DE PROJETO IA' },
      ],
      channels: [
        {
          id: 'chan-geral',
          serverId: initialServerId,
          categoryId: `cat-text-${initialServerId}`,
          name: 'geral',
          type: 'text' as ChannelType,
          topic: 'Bate-papo principal da comunidade Braza Talk',
          isE2EE: false,
          isPrivate: false,
        },
        {
          id: 'chan-anuncios',
          serverId: initialServerId,
          categoryId: `cat-text-${initialServerId}`,
          name: 'anúncios',
          type: 'announcement' as ChannelType,
          topic: 'Atualizações e comunicados da plataforma',
          isE2EE: false,
          isPrivate: false,
        },
        {
          id: 'chan-lab-mods',
          serverId: initialServerId,
          categoryId: `cat-project-${initialServerId}`,
          name: 'lab-mods-ia',
          type: 'project' as ChannelType,
          topic: 'Sala de Projeto IA: Workspace de Mods, Agentes, RAG, Arquivos e Sandbox de Testes',
          isE2EE: false,
          isPrivate: false,
        },
        {
          id: 'chan-voice-lounge',
          serverId: initialServerId,
          categoryId: `cat-voice-${initialServerId}`,
          name: 'Lounge de Voz HD',
          type: 'voice' as ChannelType,
          topic: 'Sala de áudio em tempo real com supressão de ruído',
          isE2EE: true,
          isPrivate: false,
        },
        {
          id: 'chan-voice-streams',
          serverId: initialServerId,
          categoryId: `cat-voice-${initialServerId}`,
          name: 'Transmissão & Games',
          type: 'voice' as ChannelType,
          topic: 'Compartilhamento de tela e streaming ao vivo',
          isE2EE: true,
          isPrivate: false,
        },
      ],
      members: [user],
      bots: [
        {
          id: 'bot-automod',
          name: 'AutoMod Sentinel',
          tag: '0000',
          avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
          description: 'Proteção contra spam e moderação automática.',
          type: 'automod',
          enabled: true,
          prefix: '!',
          settings: {
            profanityFilter: true,
            spamDetectionThreshold: 5,
          },
        },
      ],
      auditLogs: [],
    };

    try {
      await setDoc(doc(db, 'servers', initialServerId), sanitizeFirestoreData(initialServer));
      offlineStorage.cacheServers([initialServer]).catch(() => {});
    } catch (writeErr) {
      handleFirestoreError(writeErr, OperationType.WRITE, `servers/${initialServerId}`);
      offlineStorage.cacheServers([initialServer]).catch(() => {});
    }
    return initialServer;
  }
};
