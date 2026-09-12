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
  // Listen to servers the user is authorized to see (P1: filtered by memberIds)
  subscribeToServers(userId: string, callback: (servers: Server[]) => void) {
    // Deliver offline cached servers immediately for zero-latency startup
    offlineStorage.getCachedServers().then((cached) => {
      if (cached && cached.length > 0) {
        callback(cached);
      }
    }).catch(() => {});

    if (!userId) {
      return () => {};
    }

    const serversRef = collection(db, 'servers');
    const q = query(serversRef, where('memberIds', 'array-contains', userId));

    return onSnapshot(q, (snapshot) => {
      const userServers: Server[] = [];
      snapshot.forEach((docSnap) => {
        userServers.push({ id: docSnap.id, ...docSnap.data() } as Server);
      });

      callback(userServers);
      offlineStorage.cacheServers(userServers).catch(() => {});
    }, (err) => {
      console.warn('Failed to listen to servers, falling back to cache:', err);
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
        // Search across public servers if passed a short invite code or slug
        const serversRef = collection(db, 'servers');
        const q = query(serversRef, where('isPublic', '==', true));
        const snap = await getDocs(q);
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
        // Use updateDoc with only members and memberIds to strictly conform to firestore.rules
        await updateDoc(serverRef, {
          members: sanitizeFirestoreData(updatedMembers),
          memberIds,
        });
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
      const q = query(serversRef, where('isPublic', '==', true));
      const snapshot = await getDocs(q);
      const list: Server[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Server);
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

  // Listen to messages for a specific channel with pagination/limit and offline cache (strictly scoped to server subcollection)
  subscribeToChannelMessages(
    channelId: string,
    serverId: string | undefined,
    callback: (messages: Message[]) => void,
    maxCount: number = 60
  ) {
    if (!channelId || !serverId) {
      if (!serverId && channelId) {
        console.warn('subscribeToChannelMessages skipped: serverId is required to prevent leaking messages across servers');
      }
      return () => {};
    }

    // Deliver offline cached messages immediately
    offlineStorage.getCachedMessages(channelId).then((cached) => {
      if (cached && cached.length > 0) {
        callback(cached);
      }
    }).catch(() => {});

    const messagesRef = collection(db, 'servers', serverId, 'channels', channelId, 'messages');
    let isCleanedUp = false;
    let currentUnsub: (() => void) | null = null;

    const startFallbackListener = () => {
      if (isCleanedUp) return;
      try {
        const fallbackQ = query(
          messagesRef,
          limit(maxCount)
        );
        currentUnsub = onSnapshot(fallbackQ, (fallbackSnap) => {
          const msgs: Message[] = [];
          fallbackSnap.forEach((docSnap) => {
            msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
          });
          msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
          callback(msgs);
          offlineStorage.cacheMessages(msgs).catch(() => {});
        }, (fallbackErr) => {
          handleFirestoreError(fallbackErr, OperationType.LIST, `servers/${serverId}/channels/${channelId}/messages`);
          offlineStorage.getCachedMessages(channelId).then((cached) => {
            if (cached && cached.length > 0) callback(cached);
          }).catch(() => {});
        });
      } catch (e) {
        console.warn('Fallback messages listener failed:', e);
      }
    };

    try {
      const q = query(
        messagesRef, 
        orderBy('timestamp', 'desc'),
        limit(maxCount)
      );
      
      currentUnsub = onSnapshot(q, (snapshot) => {
        const msgs: Message[] = [];
        snapshot.forEach((docSnap) => {
          msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
        });
        msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        callback(msgs);
        offlineStorage.cacheMessages(msgs).catch(() => {});
      }, (err) => {
        console.warn('Firestore ordered messages listener fell back to unordered:', err?.message || err);
        startFallbackListener();
      });
    } catch (e) {
      startFallbackListener();
    }

    return () => {
      isCleanedUp = true;
      if (currentUnsub) {
        currentUnsub();
      }
    };
  },

  // Send a message with offline fallback queue (strictly saved in server subcollection)
  async sendMessage(message: Message, serverId?: string) {
    const sId = serverId || message.serverId;
    if (!sId) {
      const err = new Error('Cannot send message: missing serverId');
      console.warn('Firestore sendMessage rejected: missing serverId, queuing to outbox:', err);
      await offlineStorage.queueOutboxMessage(message);
      await offlineStorage.cacheMessages([message]);
      throw err;
    }
    const msgRef = doc(db, 'servers', sId, 'channels', message.channelId, 'messages', message.id);
    const cleaned = sanitizeFirestoreData({ ...message, serverId: sId });
    try {
      await setDoc(msgRef, cleaned);
      await offlineStorage.cacheMessages([message]);
    } catch (err) {
      console.warn('Firestore sendMessage failed or offline, queuing to outbox:', err);
      await offlineStorage.queueOutboxMessage({ ...message, serverId: sId });
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
      const sId = msg.serverId;
      if (!sId) {
        console.warn('Skipping outbox sync for message without serverId:', msg.id);
        continue;
      }
      try {
        const msgRef = doc(db, 'servers', sId, 'channels', msg.channelId, 'messages', msg.id);
        const cleaned = sanitizeFirestoreData({ ...msg, serverId: sId });
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
  async updateMessage(messageId: string, updates: Partial<Message>, serverId?: string, channelId?: string) {
    const sId = serverId || updates.serverId;
    const cId = channelId || updates.channelId;
    if (!sId || !cId) {
      console.warn('updateMessage requires both serverId and channelId', { serverId: sId, channelId: cId });
      return;
    }
    const msgRef = doc(db, 'servers', sId, 'channels', cId, 'messages', messageId);
    const cleaned = sanitizeFirestoreData(updates);
    await updateDoc(msgRef, cleaned as Record<string, any>);
  },

  // Delete a message
  async deleteMessage(messageId: string, serverId?: string, channelId?: string) {
    if (!serverId || !channelId) {
      console.warn('deleteMessage requires both serverId and channelId', { serverId, channelId });
      return;
    }
    await deleteDoc(doc(db, 'servers', serverId, 'channels', channelId, 'messages', messageId));
  },

  // Delete all messages belonging to a deleted channel (complete dependency wipe)
  async deleteChannelMessages(channelId: string, serverId?: string) {
    if (!serverId) {
      console.warn('deleteChannelMessages requires serverId', { channelId, serverId });
      await offlineStorage.clearCachedMessagesForChannel(channelId);
      return;
    }
    try {
      const messagesRef = collection(db, 'servers', serverId, 'channels', channelId, 'messages');
      const snap = await getDocs(messagesRef);
      const deletePromises = snap.docs.map((docSnap) => deleteDoc(docSnap.ref));
      await Promise.all(deletePromises);
    } catch (e) {
      console.warn('Failed to delete channel messages:', e);
    }

    // Clean up offline cache
    await offlineStorage.clearCachedMessagesForChannel(channelId);
  },

  // User Profile
  async updateUserProfile(userId: string, updates: Partial<User>) {
    const userRef = doc(db, 'users', userId);
    const cleaned = sanitizeFirestoreData(updates);
    await setDoc(userRef, cleaned, { merge: true });
  },

  // Fetch or seed default community server if none exists
  async initializeDefaultServerIfEmpty(user: User): Promise<Server> {
    const initialServerId = 'server-braza-community';
    try {
      const communityDocRef = doc(db, 'servers', initialServerId);
      const communitySnap = await getDoc(communityDocRef);
      if (communitySnap.exists()) {
        const srv = { id: communitySnap.id, ...communitySnap.data() } as Server;
        const members = srv.members || [];
        if (!members.some((m) => m && m.id === user.id)) {
          const updatedMembers = [...members, user];
          const memberIds = Array.from(new Set(updatedMembers.map((m) => m.id)));
          await updateDoc(communityDocRef, {
            members: sanitizeFirestoreData(updatedMembers),
            memberIds,
          }).catch(() => {});
          srv.members = updatedMembers;
          srv.memberIds = memberIds;
        }
        return srv;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `servers/${initialServerId}`);
      // Attempt to load from offline cache before falling back to local object
      const cached = await offlineStorage.getCachedServers().catch(() => []);
      if (cached && cached.length > 0) {
        return cached[0];
      }
    }

    // Seed clean initial official server
    const initialServer: Server = {
      id: initialServerId,
      name: 'Braza Talk Oficial',
      icon: '🔥',
      banner: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=1200&auto=format&fit=crop&q=80',
      description: 'Servidor oficial do Braza Talk. Bate-papo, salas de voz em alta definição e compartilhamento de tela seguro.',
      ownerId: user.id,
      isPublic: true,
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
      memberIds: [user.id],
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
  },

  // Admin Migration: Migrate legacy messages from root /messages to servers/{serverId}/channels/{channelId}/messages
  async migrateLegacyMessages(): Promise<{ migrated: number; errors: number; details: string[] }> {
    const details: string[] = [];
    let migrated = 0;
    let errors = 0;

    try {
      const rootMessagesRef = collection(db, 'messages');
      const snap = await getDocs(rootMessagesRef);
      if (snap.empty) {
        details.push('Nenhuma mensagem legada encontrada na coleção raiz /messages.');
        return { migrated: 0, errors: 0, details };
      }

      // Fetch existing servers to map channels to their serverId
      const serversSnap = await getDocs(collection(db, 'servers'));
      const channelToServerMap: Record<string, string> = {};
      serversSnap.forEach((docSnap) => {
        const srv = docSnap.data() as Server;
        if (srv.channels && Array.isArray(srv.channels)) {
          srv.channels.forEach((ch) => {
            if (ch && ch.id) channelToServerMap[ch.id] = srv.id;
          });
        }
      });

      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Message;
        const msgId = docSnap.id;
        const channelId = data.channelId;
        const targetServerId = data.serverId || channelToServerMap[channelId] || 'server-braza-community';

        if (!channelId) {
          details.push(`Mensagem ${msgId} ignorada por ausência de channelId.`);
          errors++;
          continue;
        }

        try {
          const targetRef = doc(db, 'servers', targetServerId, 'channels', channelId, 'messages', msgId);
          await setDoc(targetRef, sanitizeFirestoreData({ ...data, serverId: targetServerId, channelId }));
          await deleteDoc(docSnap.ref);
          migrated++;
        } catch (err: any) {
          details.push(`Erro ao migrar mensagem ${msgId}: ${err?.message || err}`);
          errors++;
        }
      }

      details.push(`Migração concluída: ${migrated} mensagens migradas, ${errors} erros.`);
    } catch (err: any) {
      details.push(`Falha geral na migração de mensagens: ${err?.message || err}`);
      errors++;
    }

    return { migrated, errors, details };
  },

  // Admin Utility: Purge orphaned root /messages collection documents
  async purgeLegacyMessages(): Promise<{ purged: number; errors: number }> {
    let purged = 0;
    let errors = 0;
    try {
      const rootMessagesRef = collection(db, 'messages');
      const snap = await getDocs(rootMessagesRef);
      for (const docSnap of snap.docs) {
        try {
          await deleteDoc(docSnap.ref);
          purged++;
        } catch {
          errors++;
        }
      }
    } catch (e) {
      console.warn('Falha ao purgar mensagens legadas:', e);
    }
    return { purged, errors };
  }
};
