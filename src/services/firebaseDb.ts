import { 
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
  onSnapshot 
} from './firebase';
import { Server, Message, User, Permission, ChannelType } from '../types';

export const firebaseDb = {
  // Listen to all servers the user is a member of or owns, or public servers
  subscribeToServers(userId: string, callback: (servers: Server[]) => void) {
    const serversRef = collection(db, 'servers');
    return onSnapshot(serversRef, (snapshot) => {
      const serverList: Server[] = [];
      snapshot.forEach((docSnap) => {
        serverList.push({ id: docSnap.id, ...docSnap.data() } as Server);
      });
      callback(serverList);
    }, (err) => {
      console.error('Firestore subscribeToServers error:', err);
    });
  },

  // Save or update server
  async saveServer(server: Server) {
    const serverRef = doc(db, 'servers', server.id);
    await setDoc(serverRef, server, { merge: true });
  },

  // Delete server
  async deleteServer(serverId: string) {
    await deleteDoc(doc(db, 'servers', serverId));
  },

  // Listen to messages for a specific channel
  subscribeToChannelMessages(channelId: string, callback: (messages: Message[]) => void) {
    const messagesRef = collection(db, 'messages');
    const q = query(messagesRef, where('channelId', '==', channelId));
    
    return onSnapshot(q, (snapshot) => {
      const msgs: Message[] = [];
      snapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() } as Message);
      });
      // Sort chronologically by timestamp
      msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
      callback(msgs);
    }, (err) => {
      console.error('Firestore subscribeToChannelMessages error:', err);
    });
  },

  // Send a message
  async sendMessage(message: Message) {
    const msgRef = doc(db, 'messages', message.id);
    await setDoc(msgRef, message);
  },

  // Update a message (e.g. edit, reactions, pin)
  async updateMessage(messageId: string, updates: Partial<Message>) {
    const msgRef = doc(db, 'messages', messageId);
    await updateDoc(msgRef, updates);
  },

  // Delete a message
  async deleteMessage(messageId: string) {
    await deleteDoc(doc(db, 'messages', messageId));
  },

  // User Profile
  async updateUserProfile(userId: string, updates: Partial<User>) {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, updates, { merge: true });
  },

  // Fetch or seed default community server if none exists
  async initializeDefaultServerIfEmpty(user: User): Promise<Server> {
    const serversRef = collection(db, 'servers');
    const snap = await getDocs(serversRef);
    if (!snap.empty) {
      const first = snap.docs[0];
      return { id: first.id, ...first.data() } as Server;
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
      ],
      channels: [
        {
          id: 'chan-geral',
          serverId: initialServerId,
          categoryId: `cat-text-${initialServerId}`,
          name: 'geral',
          type: 'text' as ChannelType,
          topic: 'Bate-papo principal da comunidade Braza Talk',
          isE2EE: true,
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

    await setDoc(doc(db, 'servers', initialServerId), initialServer);
    return initialServer;
  }
};
