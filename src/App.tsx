import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Server,
  Channel,
  Message,
  VoiceParticipant,
  User,
  NotificationItem,
  ChannelType,
  Permission,
} from './types';
import { ServerNav } from './components/Sidebar/ServerNav';
import { ChannelNav } from './components/Sidebar/ChannelNav';
import { ChatArea } from './components/Chat/ChatArea';
import { VoiceRoomStage } from './components/Voice/VoiceRoomStage';
import { VoiceControlsBar } from './components/Voice/VoiceControlsBar';
import { MemberList } from './components/MemberList/MemberList';
import { ServerSettingsModal } from './components/Modals/ServerSettingsModal';
import { UserSettingsModal } from './components/Modals/UserSettingsModal';
import { AppInstallerModal } from './components/Modals/AppInstallerModal';
import { CreateServerOrChannelModal } from './components/Modals/CreateServerOrChannelModal';
import { InviteModal } from './components/Modals/InviteModal';
import { ExploreServersModal } from './components/Modals/ExploreServersModal';
import { AuthModal } from './components/Modals/AuthModal';
import { ManageChannelModal } from './components/Modals/ManageChannelModal';
import { NotificationsModal, AppNotification } from './components/Modals/NotificationsModal';
import { OfflineBanner } from './components/Common/OfflineBanner';
import { PWAInstallBanner } from './components/Common/PWAInstallBanner';
import { NotificationToast } from './components/Common/NotificationToast';
import { soundEngine } from './services/soundEngine';
import { e2eeService } from './services/e2eeService';
import { offlineStorage } from './services/offlineStorage';
import { botEngine } from './services/botEngine';
import { updateService, UpdateState } from './services/updateService';
import { screenShareService } from './services/screenShareService';
import { webrtcService } from './services/webrtcService';
import { projectService } from './services/projectService';
import { useVoiceCall } from './hooks/useVoiceCall';
import { Sparkles } from 'lucide-react';
import { ProjectWorkspace } from './components/ProjectRoom/ProjectWorkspace';
import { 
  auth, 
  onAuthStateChanged, 
  signOut, 
  FirebaseUser,
  db,
  doc,
  getDoc
} from './services/firebase';
import { firebaseDb } from './services/firebaseDb';

export default function App() {
  // Authentication state
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);

  // App State
  const [currentUser, setCurrentUser] = useState<User>(() => {
    let savedMicId = 'default';
    let savedSpeakerId = 'default';
    try {
      savedMicId = localStorage.getItem('braza_audio_input_id') || 'default';
      savedSpeakerId = localStorage.getItem('braza_audio_output_id') || 'default';
    } catch {}
    return {
      id: 'guest',
      name: 'Carregando...',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=braza',
      status: 'online',
      customStatus: '🔥 Conectado no Braza Talk',
      joinedAt: Date.now(),
      selectedMicId: savedMicId,
      selectedSpeakerId: savedSpeakerId,
    };
  });

  const [servers, setServers] = useState<Server[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [activeChannelId, setActiveChannelId] = useState<string>('chan-geral');
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [showMemberList, setShowMemberList] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Network & Offline Outbox
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);

  // In-App & Native Desktop Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const pushNotificationToast = (
    title: string,
    body: string,
    type: 'message' | 'mention' | 'voice_join' | 'stream_start'
  ) => {
    const newNotif: NotificationItem = {
      id: `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      title,
      body,
      type,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev.filter((n) => Date.now() - n.timestamp < 10000).slice(0, 3)]);

    // Trigger Native Desktop Notification when permitted
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(`Braza Talk: ${title}`, {
          body,
          icon: '/favicon.ico',
        });
      } catch {
        // Fallback gracefully inside restricted contexts
      }
    }
  };

  const handleSyncOutbox = async () => {
    try {
      const syncedCount = await firebaseDb.syncOutbox();
      if (syncedCount > 0) {
        setPendingSyncCount(0);
        pushNotificationToast(
          'Sincronização Concluída',
          `${syncedCount} mensagem(ns) pendente(s) sincronizada(s) com o servidor.`,
          'message'
        );
      }
    } catch (err) {
      console.warn('Erro ao sincronizar mensagens da fila offline:', err);
    }
  };

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

  // Real WebRTC Mesh Voice, Audio & Screen Hook
  const {
    currentVoiceChannelId,
    setCurrentVoiceChannelId,
    voiceParticipants,
    setVoiceParticipants,
    isMuted,
    setIsMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
    screenMediaStream,
    handleJoinVoice,
    handleLeaveVoice,
    handleToggleMute,
    handleToggleDeafen,
    handleStartScreenShare,
    handleStopScreenShare,
    handleChangeScreenSource,
    handleToggleCamera,
  } = useVoiceCall({
    currentUser,
    wsRef,
    pushNotificationToast,
  });

  const handleToggleScreenShare = isScreenSharing ? handleStopScreenShare : handleStartScreenShare;

  const [isWatchingStreamId, setIsWatchingStreamId] = useState<string | null>(null);

  // Modals
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [userSettingsInitialTab, setUserSettingsInitialTab] = useState<'profile' | 'voice' | 'e2ee' | 'notifications' | 'storage'>('profile');
  const [showAppInstaller, setShowAppInstaller] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState<{ open: boolean; channelId?: string }>({
    open: false,
  });
  const [showExploreModal, setShowExploreModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [appNotifications, setAppNotifications] = useState<AppNotification[]>(() => {
    try {
      const saved = localStorage.getItem('braza_talk_notifications');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [
      {
        id: 'braza-welcome-news',
        type: 'news',
        title: 'Bem-vindo ao Braza Talk!',
        message: 'Áudio espacial de ultra-baixa latência Opus, salas de voz protegidas, WebRTC P2P e compartilhamento de tela com som integrados.',
        timestamp: Date.now() - 1000 * 60 * 45,
        read: false,
      },
    ];
  });

  useEffect(() => {
    try {
      localStorage.setItem('braza_talk_notifications', JSON.stringify(appNotifications));
    } catch {}
  }, [appNotifications]);

  const unreadNotificationsCount = useMemo(
    () => appNotifications.filter((n) => !n.read).length,
    [appNotifications]
  );
  const [appInstallerTab, setAppInstallerTab] = useState<'install' | 'update'>('install');
  const [updateInfo, setUpdateInfo] = useState<UpdateState>(updateService.getState());
  const [createModal, setCreateModal] = useState<{ open: boolean; mode: 'server' | 'channel'; categoryId?: string }>({
    open: false,
    mode: 'server',
  });
  const [managingChannel, setManagingChannel] = useState<Channel | null>(null);

  // OTA Update Listener & Background Check
  useEffect(() => {
    const unsubscribeUpdate = updateService.subscribe((state) => {
      setUpdateInfo(state);
    });

    const timer = setTimeout(() => {
      if (updateService.getState().autoCheckEnabled) {
        updateService.checkForUpdates();
      }
    }, 2500);

    return () => {
      unsubscribeUpdate();
      clearTimeout(timer);
    };
  }, []);

  // 1. Firebase Auth Listener
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        // Fetch user profile from Firestore or construct it
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.exists() ? userDoc.data() : null;

        const appUser: User = {
          id: user.uid,
          name: userData?.name || user.displayName || user.email?.split('@')[0] || 'Membro Braza',
          email: user.email || undefined,
          avatar: userData?.avatar || user.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.uid}`,
          status: (userData?.status as any) || 'online',
          customStatus: userData?.customStatus || '🔥 Conectado no Braza Talk',
          bio: userData?.bio || 'Membro da comunidade Braza Talk.',
          joinedAt: userData?.createdAt || Date.now(),
          e2eePublicKey: `E2EE-PUB-${user.uid.slice(0, 8)}`,
          e2eeFingerprint: e2eeService.getFingerprint(),
          voiceInputMode: userData?.voiceInputMode || 'open',
          pttKey: userData?.pttKey || 'Space',
          pttReleaseDelay: userData?.pttReleaseDelay ?? 200,
          selectedMicId: userData?.selectedMicId || localStorage.getItem('braza_audio_input_id') || 'default',
          selectedSpeakerId: userData?.selectedSpeakerId || localStorage.getItem('braza_audio_output_id') || 'default',
        };

        setCurrentUser((prev) => {
          if (prev && prev.id === user.uid) {
            return {
              ...appUser,
              name: prev.name || appUser.name,
              avatar: prev.avatar || appUser.avatar,
              customStatus: prev.customStatus || appUser.customStatus,
              bio: prev.bio || appUser.bio,
              status: prev.status || appUser.status,
              selectedMicId: prev.selectedMicId || appUser.selectedMicId,
              selectedSpeakerId: prev.selectedSpeakerId || appUser.selectedSpeakerId,
            };
          }
          return appUser;
        });

        // If PTT mode is enabled, initially start muted until key is held
        if (appUser.voiceInputMode === 'ptt') {
          setIsMuted(true);
        }

        // Check and bootstrap default server if empty
        const initialServer = await firebaseDb.initializeDefaultServerIfEmpty(appUser);
        setActiveServerId((prev) => prev || initialServer.id);
        setActiveChannelId((prev) => {
          if (prev) return prev;
          return initialServer.channels && initialServer.channels.length > 0 ? initialServer.channels[0].id : '';
        });
      }
      setAuthLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  // 2. Real-time Firestore Servers Subscription
  useEffect(() => {
    if (!firebaseUser) return;

    const unsubscribeServers = firebaseDb.subscribeToServers(firebaseUser.uid, (serverList) => {
      if (serverList.length > 0) {
        setServers(serverList);
        setActiveServerId((prev) => {
          if (prev === null) return null;
          if (prev && serverList.some((s) => s.id === prev)) return prev;
          return serverList[0].id;
        });
      } else {
        setServers([]);
      }
    });

    return () => unsubscribeServers();
  }, [firebaseUser]);

  // 3. Handle Invite via URL parameter or pathname
  useEffect(() => {
    if (!firebaseUser || !currentUser.id) return;

    const urlParams = new URLSearchParams(window.location.search);
    let inviteServerId = urlParams.get('invite');
    const inviteChannelId = urlParams.get('channel');

    if (!inviteServerId && window.location.pathname.startsWith('/invite/')) {
      const slug = window.location.pathname.replace('/invite/', '').trim();
      if (slug) inviteServerId = slug;
    }

    if (inviteServerId) {
      firebaseDb.joinServer(inviteServerId, currentUser).then((joinedServer) => {
        if (joinedServer) {
          setActiveServerId(joinedServer.id);
          if (inviteChannelId && joinedServer.channels?.some((c) => c.id === inviteChannelId)) {
            setActiveChannelId(inviteChannelId);
          } else if (joinedServer.channels && joinedServer.channels[0]) {
            setActiveChannelId(joinedServer.channels[0].id);
          }
          pushNotificationToast(
            'Convite Aceito!',
            `Você entrou no servidor "${joinedServer.name}" com sucesso.`,
            'voice_join'
          );
          soundEngine.playUserJoin();
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname.startsWith('/invite/') ? '/' : window.location.pathname
          );
        }
      }).catch((e) => {
        console.warn('Could not process URL invite:', e);
      });
    }
  }, [firebaseUser, currentUser]);

  const handleJoinServer = async (serverIdOrCode: string): Promise<boolean> => {
    if (!currentUser.id) return false;
    try {
      const server = await firebaseDb.joinServer(serverIdOrCode, currentUser);
      if (server) {
        setActiveServerId(server.id);
        if (server.channels && server.channels.length > 0) {
          setActiveChannelId(server.channels[0].id);
        }
        pushNotificationToast('Sucesso!', `Você entrou no servidor "${server.name}"!`, 'voice_join');
        return true;
      }
      return false;
    } catch (e) {
      console.error('Error joining server:', e);
      return false;
    }
  };

  // List of contacts for Direct Messages
  const directMessageUsers: User[] = useMemo(() => {
    const memberMap = new Map<string, User>();
    servers.forEach((s) => {
      s.members?.forEach((m) => {
        if (m.id !== currentUser.id) {
          memberMap.set(m.id, m);
        }
      });
    });
    if (memberMap.size === 0) {
      return [
        {
          id: 'user-elena',
          name: 'Elena Rostova',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
          status: 'online',
          customStatus: 'Desenvolvendo Braza Talk WebRTC',
          joinedAt: Date.now() - 86400000 * 30,
        },
        {
          id: 'user-lucas',
          name: 'Lucas Silva',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
          status: 'online',
          customStatus: 'Testando áudio HD SFU',
          joinedAt: Date.now() - 86400000 * 15,
        },
        {
          id: 'user-sofia',
          name: 'Sofia Chen',
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150',
          status: 'idle',
          customStatus: 'Em reunião no canal de voz',
          joinedAt: Date.now() - 86400000 * 7,
        },
      ];
    }
    return Array.from(memberMap.values());
  }, [servers, currentUser.id]);

  // Active Server & Channel objects (Isolating E2EE exclusively to Direct Messages)
  const currentServer = activeServerId !== null ? (servers.find((s) => s.id === activeServerId) || servers[0] || null) : null;
  const currentChannel: Channel = useMemo(() => {
    if (!currentServer) {
      // Direct Messages view: 1-on-1 private conversation, always E2EE
      const activeDMUser =
        directMessageUsers.find((u) => activeChannelId === `dm-${[currentUser.id, u.id].sort().join('_')}`) ||
        directMessageUsers[0];

      if (activeDMUser) {
        return {
          id: `dm-${[currentUser.id, activeDMUser.id].sort().join('_')}`,
          serverId: '',
          name: activeDMUser.name,
          type: 'text' as ChannelType,
          isE2EE: true,
          isPrivate: true,
          topic: `Conversa direta criptografada ponta a ponta (AES-GCM-256) com ${activeDMUser.name}`,
        };
      }

      return {
        id: 'dm-default',
        serverId: '',
        name: 'Mensagens Diretas',
        type: 'text' as ChannelType,
        isE2EE: true,
        isPrivate: true,
        topic: 'Conversa direta criptografada ponta a ponta (AES-GCM-256)',
      };
    }

    // Public community channels: standard unencrypted (or channel default)
    const chan =
      currentServer.channels.find((c) => c.id === activeChannelId) ||
      currentServer.channels[0];

    return (
      chan || {
        id: 'chan-fallback',
        serverId: currentServer.id,
        name: 'geral',
        type: 'text' as ChannelType,
        isE2EE: false,
        isPrivate: false,
      }
    );
  }, [currentServer, activeChannelId, directMessageUsers, currentUser.id]);

  // 3. Real-time Firestore Messages Subscription for active channel
  useEffect(() => {
    if (!firebaseUser || !currentChannel.id || currentChannel.id === 'chan-fallback') return;

    const unsubscribeMessages = firebaseDb.subscribeToChannelMessages(currentChannel.id, currentServer?.id, async (channelMsgs) => {
      // Decrypt any E2EE encrypted messages using WebCrypto AES-GCM-256
      const processedMsgs = await Promise.all(
        channelMsgs.map(async (msg) => {
          if (msg.isEncrypted && msg.encryptedContent && msg.encryptionIv) {
            try {
              const decrypted = await e2eeService.decryptMessage(
                msg.encryptedContent,
                msg.encryptionIv,
                currentChannel.id
              );
              return { ...msg, content: decrypted };
            } catch (err) {
              console.warn('Failed to decrypt message:', err);
              return msg;
            }
          }
          return msg;
        })
      );

      setMessages((prev) => ({
        ...prev,
        [currentChannel.id]: processedMsgs,
      }));
      offlineStorage.cacheMessages(processedMsgs);
    });

    return () => unsubscribeMessages();
  }, [firebaseUser, currentChannel.id, currentServer?.id]);

  const currentChannelMessages = messages[currentChannel.id] || [];

  // --- INITIALIZATION & OFFLINE DB SYNC ---
  useEffect(() => {
    // 1. Initialize Network Listeners
    const unsubscribeNetwork = offlineStorage.onNetworkChange((online) => {
      setIsOnline(online);
      if (online) {
        handleSyncOutbox();
      }
    });

    // 2. Connect to Real-time WebSocket with Heartbeat and Exponential Reconnection
    let reconnectTimeout: any = null;
    let heartbeatInterval: any = null;
    let reconnectDelay = 1000;
    let isDisposed = false;

    const connectWS = () => {
      if (isDisposed) return;
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = async () => {
          reconnectDelay = 1000; // Reset backoff upon successful connection

          let token = '';
          try {
            if (auth.currentUser) {
              token = await auth.currentUser.getIdToken();
            }
          } catch {}

          if (token && auth.currentUser) {
            socket.send(
              JSON.stringify({
                type: 'auth',
                token,
                userId: auth.currentUser.uid,
                userName: currentUser.name,
                userAvatar: currentUser.avatar,
                channelId: currentVoiceChannelId,
              })
            );
          } else {
            const guestId = currentUser.id?.startsWith('guest-')
              ? currentUser.id
              : `guest-${currentUser.id || 'anonymous'}`;
            socket.send(
              JSON.stringify({
                type: 'auth',
                userId: guestId,
                userName: currentUser.name || 'Visitante',
                userAvatar: currentUser.avatar,
                channelId: currentVoiceChannelId,
              })
            );
          }

          // Start 30s heartbeat ping to keep connection alive through Nginx proxies
          clearInterval(heartbeatInterval);
          heartbeatInterval = setInterval(() => {
            if (socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') return;
            handleIncomingWSEvent(data);
          } catch (e) {
            console.warn('WS message error:', e);
          }
        };

        socket.onclose = () => {
          clearInterval(heartbeatInterval);
          if (!isDisposed) {
            // Reconnect with exponential backoff (1s -> 30s)
            clearTimeout(reconnectTimeout);
            reconnectTimeout = setTimeout(() => {
              reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
              connectWS();
            }, reconnectDelay);
          }
        };

        socket.onerror = () => {
          socket.close();
        };

        wsRef.current = socket;
      } catch (e) {
        console.warn('WebSocket connection fallback:', e);
      }
    };

    connectWS();

    // Auto-sync room participants whenever tab is focused or periodically
    const handleWindowFocus = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'get-voice-state' }));
      }
    };
    window.addEventListener('focus', handleWindowFocus);
    const syncTimer = setInterval(handleWindowFocus, 5000);

    const handleSendWs = (e: any) => {
      if (e.detail && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(e.detail));
      }
    };
    window.addEventListener('braza-send-ws', handleSendWs);

    return () => {
      isDisposed = true;
      clearTimeout(reconnectTimeout);
      clearInterval(heartbeatInterval);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('braza-send-ws', handleSendWs);
      clearInterval(syncTimer);
      unsubscribeNetwork();
      wsRef.current?.close();
    };
  }, [currentUser.id]);

  // Re-authenticate WebSocket with fresh Firebase ID Token whenever user signs in or changes
  useEffect(() => {
    if (!firebaseUser) return;

    let isCancelled = false;
    const upgradeWSAuth = async () => {
      try {
        const token = await firebaseUser.getIdToken();
        if (!isCancelled && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'auth',
              token,
              userId: firebaseUser.uid,
              userName: currentUser.name,
              userAvatar: currentUser.avatar,
              channelId: currentVoiceChannelId,
            })
          );
        }
      } catch (err) {
        console.warn('Failed to upgrade WebSocket auth with token:', err);
      }
    };

    upgradeWSAuth();
    return () => {
      isCancelled = true;
    };
  }, [firebaseUser, currentUser.name, currentUser.avatar, currentVoiceChannelId]);

  // Handle incoming WebSocket broadcasts (Voice & Signals)
  const handleIncomingWSEvent = (data: any) => {
    switch (data.type) {
      case 'auth-ok': {
        // Authenticated identity confirmed by server
        break;
      }

      case 'voice-participants-sync':
      case 'init-voice-state': {
        if (data.participants && Array.isArray(data.participants)) {
          setVoiceParticipants(data.participants);
        }
        break;
      }

      case 'voice-state-changed': {
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === data.userId ? { ...p, ...data.updates } : p))
        );
        break;
      }

      case 'voice-user-joined': {
        setVoiceParticipants((prev) => {
          const filtered = prev.filter((p) => p.userId !== data.user.userId);
          return [...filtered, data.user];
        });
        soundEngine.playUserJoin();
        pushNotificationToast(
          'Entrou na Sala de Voz',
          `${data.user.userName} conectou à sala de áudio.`,
          'voice_join'
        );
        if (currentVoiceChannelId && data.user.userId !== currentUser.id) {
          webrtcService.initiateConnection(data.user.userId);
        }
        break;
      }

      case 'voice-user-left': {
        setVoiceParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
        webrtcService.closePeer(data.userId);
        soundEngine.playUserLeave();
        break;
      }

      case 'webrtc-signal': {
        if (data.fromUserId && data.signal) {
          webrtcService.handleSignal(data.fromUserId, data.signal);
        }
        break;
      }

      case 'screen-share-started': {
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === data.userId ? { ...p, isScreenSharing: true } : p))
        );
        soundEngine.playScreenShareStart();
        pushNotificationToast(
          'Transmissão Iniciada',
          `${data.userName} começou a compartilhar tela ao vivo!`,
          'stream_start'
        );
        break;
      }

      case 'screen-share-stopped': {
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === data.userId ? { ...p, isScreenSharing: false } : p))
        );
        soundEngine.playScreenShareEnd();
        break;
      }

      case 'stream-viewer-joined': {
        if (data.streamerUserId === currentUser.id) {
          soundEngine.playStreamViewer();
          pushNotificationToast(
            'Novo Espectador',
            `${data.viewerUserName} está assistindo sua transmissão!`,
            'mention'
          );
        }
        break;
      }

      case 'project-plan-updated': {
        window.dispatchEvent(new CustomEvent('braza-project-plan-updated', { detail: data }));
        break;
      }

      case 'file-presence-sync': {
        window.dispatchEvent(new CustomEvent('braza-file-presence-sync', { detail: data }));
        break;
      }

      case 'user-profile-updated': {
        // 1. Update voice participants in real time so the active voice room immediately updates avatar & name
        setVoiceParticipants((prev) =>
          prev.map((p) =>
            p.userId === data.userId
              ? {
                  ...p,
                  userName: data.userName || p.userName,
                  userAvatar: data.userAvatar || p.userAvatar,
                }
              : p
          )
        );

        // 2. Update server member list in real time
        setServers((prev) =>
          prev.map((srv) => ({
            ...srv,
            members: srv.members.map((m) =>
              m.id === data.userId
                ? {
                    ...m,
                    name: data.userName || m.name,
                    avatar: data.userAvatar || m.avatar,
                    status: data.status || m.status,
                    customStatus: data.customStatus !== undefined ? data.customStatus : m.customStatus,
                    bio: data.bio !== undefined ? data.bio : m.bio,
                  }
                : m
            ),
          }))
        );
        break;
      }

      case 'room-invite-received': {
        soundEngine.playMention();
        const inviteNotification: AppNotification = {
          id: data.inviteId || `inv-${Date.now()}`,
          type: 'invite',
          title: 'Convite para Sala de Voz',
          message: `${data.senderName || 'Alguém'} convidou você para a sala #${data.channelName || 'voz'} no servidor ${data.serverName || 'Braza Talk'}.`,
          timestamp: data.timestamp || Date.now(),
          read: false,
          inviteData: {
            inviteId: data.inviteId,
            serverId: data.serverId,
            serverName: data.serverName,
            channelId: data.channelId,
            channelName: data.channelName,
            senderUserId: data.senderUserId,
            senderName: data.senderName,
            senderAvatar: data.senderAvatar,
          },
        };
        setAppNotifications((prev) => [inviteNotification, ...prev]);
        pushNotificationToast(
          'Convite para Sala',
          `${data.senderName || 'Um membro'} convidou você para #${data.channelName || 'voz'}`,
          'mention'
        );
        break;
      }
    }
  };

  // 1. Send Message (Firestore + E2EE + Bots)
  const handleSendMessage = async (
    content: string,
    isVoiceNote?: boolean,
    voiceDuration?: number,
    attachments?: any[]
  ) => {
    if (!firebaseUser) return;
    const isEncrypted = currentChannel.isE2EE || false;
    let encryptedContent = content;
    let encryptionIv: string | undefined = undefined;

    if (isEncrypted) {
      try {
        const encResult = await e2eeService.encryptMessage(content, currentChannel.id);
        encryptedContent = encResult.ciphertext;
        encryptionIv = encResult.iv;
      } catch (err) {
        console.error('Failed to encrypt message with E2EE AES-GCM:', err);
      }
    }

    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channelId: currentChannel.id,
      serverId: currentServer?.id || '',
      authorId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRoleColor: '#6366f1',
      content,
      encryptedContent,
      encryptionIv,
      isEncrypted,
      attachments: attachments || [],
      reactions: [],
      timestamp: Date.now(),
      isVoiceNote: !!isVoiceNote,
      ...(voiceDuration !== undefined ? { voiceDuration } : {}),
      pendingSync: !isOnline,
    };

    // Optimistic local state update
    setMessages((prev) => ({
      ...prev,
      [currentChannel.id]: [...(prev[currentChannel.id] || []), newMsg],
    }));

    // Cache offline
    offlineStorage.cacheMessages([newMsg]);

    if (!isOnline) {
      offlineStorage.queueOutboxMessage(newMsg);
      setPendingSyncCount((c) => c + 1);
      return;
    }

    // Persist to Firebase Firestore
    try {
      await firebaseDb.sendMessage(newMsg, currentServer?.id);
    } catch (e) {
      console.warn('Failed to send message immediately to Firestore, saved to offline outbox:', e);
      setPendingSyncCount((c) => c + 1);
    }

    // Process Automated Bots & Slash Commands
    if (content.startsWith('/')) {
      const parts = content.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');

      botEngine.executeSlashCommand(
        command,
        args,
        currentUser.name,
        currentUser.id,
        currentServer?.bots || [],
        currentChannelMessages,
        currentChannel.name,
        currentServer?.members
      ).then(async (botReply) => {
        if (!botReply) return;

        // If command was /clear, delete the requested amount of messages
        if (botReply.clearCount && currentChannelMessages.length > 0) {
          const toDelete = currentChannelMessages.slice(-botReply.clearCount);
          for (const m of toDelete) {
            try {
              await firebaseDb.deleteMessage(m.id, currentServer?.id, currentChannel.id);
            } catch (err) {
              console.error('Error deleting message:', err);
            }
          }
          setMessages((prev) => ({
            ...prev,
            [currentChannel.id]: (prev[currentChannel.id] || []).filter(
              (m) => !toDelete.some((d) => d.id === m.id)
            ),
          }));
        }

        const botMsg: Message = {
          id: `bot-msg-${Date.now()}`,
          channelId: currentChannel.id,
          serverId: currentServer?.id,
          authorId: currentUser.id,
          authorName: botReply.authorName || 'Braza Talk Bot',
          authorAvatar: botReply.authorAvatar || currentUser.avatar,
          authorRoleColor: botReply.authorRoleColor || '#6366f1',
          isBot: true,
          botTag: botReply.botTag || 'BOT',
          content: botReply.content || '',
          reactions: [],
          timestamp: Date.now(),
        };

        setMessages((prev) => ({
          ...prev,
          [currentChannel.id]: [...(prev[currentChannel.id] || []), botMsg],
        }));
        await firebaseDb.sendMessage(botMsg, currentServer?.id);
        soundEngine.playMessage();
      }).catch((err) => {
        console.error('Slash command execution error:', err);
      });
    } else {
      // AutoMod check
      botEngine.processIncomingMessage(newMsg, currentServer?.bots || [], (reply) => {
        setTimeout(async () => {
          const botMsg: Message = {
            id: `bot-reply-${Date.now()}`,
            channelId: currentChannel.id,
            serverId: currentServer?.id,
            authorId: currentUser.id,
            authorName: reply.authorName || 'AutoMod Sentinel',
            authorAvatar: reply.authorAvatar || '',
            authorRoleColor: reply.authorRoleColor || '#ef4444',
            isBot: true,
            botTag: reply.botTag || 'AUTOMOD',
            content: reply.content || '',
            reactions: [],
            timestamp: Date.now(),
          };
          setMessages((prev) => ({
            ...prev,
            [currentChannel.id]: [...(prev[currentChannel.id] || []), botMsg],
          }));
          await firebaseDb.sendMessage(botMsg, currentServer?.id);
          soundEngine.playMention();
        }, 200);
      });
    }
  };

  // 2. React to message
  const handleReact = async (messageId: string, emoji: string) => {
    const channelMsgs = messages[currentChannel.id] || [];
    const msg = channelMsgs.find((m) => m.id === messageId);
    if (!msg) return;

    const existingReaction = msg.reactions?.find((r) => r.emoji === emoji);
    let updatedReactions = [...(msg.reactions || [])];

    if (existingReaction) {
      const hasUser = existingReaction.users.includes(currentUser.id);
      if (hasUser) {
        const newUsers = existingReaction.users.filter((u) => u !== currentUser.id);
        if (newUsers.length === 0) {
          updatedReactions = updatedReactions.filter((r) => r.emoji !== emoji);
        } else {
          updatedReactions = updatedReactions.map((r) =>
            r.emoji === emoji ? { ...r, count: r.count - 1, users: newUsers } : r
          );
        }
      } else {
        updatedReactions = updatedReactions.map((r) =>
          r.emoji === emoji ? { ...r, count: r.count + 1, users: [...r.users, currentUser.id] } : r
        );
      }
    } else {
      updatedReactions.push({ emoji, count: 1, users: [currentUser.id] });
    }

    setMessages((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] || []).map((m) =>
        m.id === messageId ? { ...m, reactions: updatedReactions } : m
      ),
    }));

    try {
      await firebaseDb.updateMessage(messageId, { reactions: updatedReactions }, currentServer?.id, currentChannel.id);
    } catch (e) {
      console.error('Failed to update reactions:', e);
    }
  };

  // 3. Pin message
  const handlePinMessage = async (messageId: string) => {
    const channelMsgs = messages[currentChannel.id] || [];
    const targetMsg = channelMsgs.find((m) => m.id === messageId);
    if (!targetMsg) return;
    const nextPinned = !targetMsg.pinned;

    setMessages((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] || []).map((m) =>
        m.id === messageId ? { ...m, pinned: nextPinned } : m
      ),
    }));

    try {
      await firebaseDb.updateMessage(messageId, { pinned: nextPinned }, currentServer?.id, currentChannel.id);
    } catch (e) {
      console.error('Failed to update pinned state:', e);
    }
  };

  // 4. Delete message
  const handleDeleteMessage = async (messageId: string) => {
    setMessages((prev) => ({
      ...prev,
      [currentChannel.id]: (prev[currentChannel.id] || []).filter((m) => m.id !== messageId),
    }));
    try {
      await firebaseDb.deleteMessage(messageId, currentServer?.id, currentChannel.id);
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  const handleWatchStream = (streamerUserId: string) => {
    setIsWatchingStreamId(streamerUserId);
    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'watch-stream',
          channelId: currentVoiceChannelId,
          streamerUserId,
          viewerUserId: currentUser.id,
          viewerUserName: currentUser.name,
        })
      );
    }
  };

  // 8. Server Management & Role Assignment
  const handleUpdateServer = async (updated: Partial<Server>) => {
    if (!currentServer) return;
    const merged: Server = { ...currentServer, ...updated };
    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? merged : s)));
    try {
      await firebaseDb.saveServer(merged);
    } catch (e) {
      console.error('Failed to update server in DB:', e);
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    if (!currentServer) return;
    const updatedMembers = currentServer.members.map((m) => {
      if (m.id !== userId) return m;
      const currentRoles = m.roles || [];
      return currentRoles.includes(roleId) ? m : { ...m, roles: [...currentRoles, roleId] };
    });
    const updatedServer = { ...currentServer, members: updatedMembers };
    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    await firebaseDb.saveServer(updatedServer);
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    if (!currentServer) return;
    const updatedMembers = currentServer.members.map((m) => {
      if (m.id !== userId) return m;
      return { ...m, roles: (m.roles || []).filter((r) => r !== roleId) };
    });
    const updatedServer = { ...currentServer, members: updatedMembers };
    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    await firebaseDb.saveServer(updatedServer);
  };

  const handleCreateServer = async (name: string, icon: string, description: string, e2ee: boolean) => {
    const newServerId = `server-${Date.now()}`;
    const newServer: Server = {
      id: newServerId,
      name,
      icon,
      description,
      ownerId: currentUser.id,
      e2eeEnabled: e2ee,
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
          id: `role-admin-${newServerId}`,
          name: 'Administrador',
          color: '#ef4444',
          hoist: true,
          position: 1,
          permissions: Object.values(Permission),
        },
        {
          id: `role-member-${newServerId}`,
          name: '@everyone',
          color: '#94a3b8',
          hoist: false,
          position: 2,
          permissions: [
            Permission.SEND_MESSAGES,
            Permission.CONNECT_VOICE,
            Permission.SPEAK,
          ],
        },
      ],
      categories: [
        { id: `cat-main-${newServerId}`, serverId: newServerId, name: 'CANAIS PRINCIPAIS' },
        { id: `cat-voice-${newServerId}`, serverId: newServerId, name: 'SALAS DE VOZ' },
      ],
      channels: [
        {
          id: `chan-general-${newServerId}`,
          serverId: newServerId,
          categoryId: `cat-main-${newServerId}`,
          name: 'geral',
          type: 'text',
          isE2EE: e2ee,
          isPrivate: false,
        },
        {
          id: `chan-voice-${newServerId}`,
          serverId: newServerId,
          categoryId: `cat-voice-${newServerId}`,
          name: 'Lounge de Voz (HD)',
          type: 'voice',
          isE2EE: e2ee,
          isPrivate: false,
        },
      ],
      members: [currentUser],
      bots: currentServer?.bots || [],
      auditLogs: [],
    };

    setServers((prev) => [...prev, newServer]);
    setActiveServerId(newServerId);
    setActiveChannelId(`chan-general-${newServerId}`);
    await firebaseDb.saveServer(newServer);
  };

  const handleCreateChannel = async (
    name: string,
    type: ChannelType,
    isE2EE: boolean,
    categoryId?: string,
    projectConfig?: { description?: string; gameEngine?: string }
  ) => {
    if (!currentServer) return;
    const newChanId = `chan-${Date.now()}`;
    const newChannel: Channel = {
      id: newChanId,
      serverId: currentServer.id,
      categoryId: categoryId || currentServer.categories[0]?.id,
      name,
      type,
      isE2EE,
      isPrivate: false,
    };

    if (type === 'project') {
      const blankState = projectService.getBlankProjectState(newChanId, name, {
        description: projectConfig?.description,
        gameEngine: projectConfig?.gameEngine,
        serverId: currentServer.id,
      });
      projectService.saveProjectState(newChanId, blankState).catch(() => {});
    }

    const updatedServer = {
      ...currentServer,
      channels: [...currentServer.channels, newChannel],
    };

    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    setActiveChannelId(newChanId);
    await firebaseDb.saveServer(updatedServer);
  };

  const handleUpdateChannel = async (channelId: string, updates: Partial<Channel>) => {
    if (!currentServer) return;

    const updatedChannels = currentServer.channels.map((c) =>
      c.id === channelId ? { ...c, ...updates } : c
    );

    const updatedServer: Server = {
      ...currentServer,
      channels: updatedChannels,
    };

    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    await firebaseDb.saveServer(updatedServer);

    // Keep managing channel in sync if currently opened
    setManagingChannel((prev) => (prev && prev.id === channelId ? { ...prev, ...updates } : prev));

    pushNotificationToast(
      'Sala Atualizada',
      `As configurações da sala #${updates.name || 'canal'} foram salvas.`,
      'message'
    );
  };

  const handleDeleteChannel = async (channelId: string) => {
    if (!currentServer) return;

    const channelToDelete = currentServer.channels.find((c) => c.id === channelId);
    const channelName = channelToDelete?.name || 'sala';

    // 1. If currently connected in voice in this channel, leave voice
    if (currentVoiceChannelId === channelId) {
      handleLeaveVoice();
    }

    // 2. Select next available channel if active channel is deleted
    const remainingChannels = currentServer.channels.filter((c) => c.id !== channelId);
    if (activeChannelId === channelId) {
      const nextChan = remainingChannels[0];
      if (nextChan) {
        setActiveChannelId(nextChan.id);
      }
    }

    // 3. Complete dependency wipe: messages, files, agent runners and offline cache
    try {
      await firebaseDb.deleteChannelMessages(channelId, currentServer.id);
    } catch (e) {
      console.warn('Erro ao deletar mensagens da sala:', e);
    }

    if (channelToDelete?.type === 'project') {
      try {
        await projectService.deleteProjectRoom(channelId);
      } catch (e) {
        console.warn('Erro ao deletar sala de projeto:', e);
      }
    }

    // 4. Update server in state & Firestore
    const updatedServer: Server = {
      ...currentServer,
      channels: remainingChannels,
    };

    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    await firebaseDb.saveServer(updatedServer);

    // 5. Close managing modal
    setManagingChannel(null);

    pushNotificationToast(
      'Sala Excluída',
      `A sala #${channelName} e todas as suas dependências foram permanentemente excluídas.`,
      'message'
    );
  };

  const handleUpdateUser = async (updated: Partial<User>) => {
    const next = { ...currentUser, ...updated };
    setCurrentUser(next);

    // 1. Immediately update active voice room participants locally without requiring rejoin
    setVoiceParticipants((prev) =>
      prev.map((p) =>
        p.userId === currentUser.id
          ? {
              ...p,
              userName: updated.name || p.userName,
              userAvatar: updated.avatar || p.userAvatar,
            }
          : p
      )
    );

    // 2. Immediately update member list in all servers locally
    setServers((prev) =>
      prev.map((srv) => ({
        ...srv,
        members: srv.members.map((m) =>
          m.id === currentUser.id
            ? {
                ...m,
                ...updated,
                name: updated.name || m.name,
                avatar: updated.avatar || m.avatar,
                status: updated.status || m.status,
                customStatus: updated.customStatus !== undefined ? updated.customStatus : m.customStatus,
                bio: updated.bio !== undefined ? updated.bio : m.bio,
              }
            : m
        ),
      }))
    );

    // 3. Broadcast real-time profile update via WebSocket so other peers update instantly
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'user-profile-updated',
          userId: currentUser.id,
          userName: updated.name || currentUser.name,
          userAvatar: updated.avatar || currentUser.avatar,
          status: updated.status || currentUser.status,
          customStatus: updated.customStatus !== undefined ? updated.customStatus : currentUser.customStatus,
          bio: updated.bio !== undefined ? updated.bio : currentUser.bio,
          channelId: currentVoiceChannelId,
        })
      );
    }

    // 4. Persist to Firestore DB (Users collection and Server Members)
    if (firebaseUser) {
      try {
        await firebaseDb.updateUserProfile(firebaseUser.uid, updated);
        if (currentServer) {
          const updatedMembers = currentServer.members.map((m) =>
            m.id === currentUser.id
              ? {
                  ...m,
                  ...updated,
                  name: updated.name || m.name,
                  avatar: updated.avatar || m.avatar,
                  status: updated.status || m.status,
                  customStatus: updated.customStatus !== undefined ? updated.customStatus : m.customStatus,
                  bio: updated.bio !== undefined ? updated.bio : m.bio,
                }
              : m
          );
          const updatedServer = { ...currentServer, members: updatedMembers };
          await firebaseDb.saveServer(updatedServer);
        }
      } catch (err) {
        console.warn('Error persisting profile update:', err);
      }
    }

    pushNotificationToast(
      'Perfil Atualizado',
      'Suas alterações foram sincronizadas automaticamente em todas as salas.',
      'mention'
    );
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setFirebaseUser(null);
  };

  const handleLeaveVoiceAndNavigateToGeneral = () => {
    handleLeaveVoice();
    // Automatically navigate user to the general text chat channel upon leaving voice room
    if (currentServer && currentServer.channels && currentServer.channels.length > 0) {
      const generalChannel =
        currentServer.channels.find(
          (c) =>
            c.type === 'text' &&
            (c.name.toLowerCase() === 'geral' ||
              c.name.toLowerCase() === 'chat-geral' ||
              c.name.toLowerCase() === 'general' ||
              c.name.toLowerCase().includes('geral'))
        ) || currentServer.channels.find((c) => c.type === 'text');

      if (generalChannel) {
        setActiveChannelId(generalChannel.id);
      }
    }
  };

  const isVoiceActiveChannel = currentChannel.type === 'voice' || currentChannel.type === 'stage';

  // Ensure voice participants list for sidebar, stage, and controls bar always contains current user when in voice
  const enrichedSidebarVoiceParticipants = useMemo(() => {
    let list = [...voiceParticipants];
    if (currentVoiceChannelId && !list.some((p) => p.userId === currentUser.id && p.channelId === currentVoiceChannelId)) {
      list.push({
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatar: currentUser.avatar,
        channelId: currentVoiceChannelId,
        isMuted,
        isDeafened,
        isSpeaking: false,
        isScreenSharing,
        isCameraOn,
        viewers: [],
        joinedAt: Date.now(),
      });
    }
    return list.map((p) =>
      p.userId === currentUser.id
        ? { ...p, userName: currentUser.name, userAvatar: currentUser.avatar }
        : p
    );
  }, [
    voiceParticipants,
    currentVoiceChannelId,
    currentUser.id,
    currentUser.name,
    currentUser.avatar,
    isMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
  ]);

  const activeStageVoiceParticipants = useMemo(() => {
    let list = voiceParticipants.filter((p) => p.channelId === currentChannel.id);
    if (currentVoiceChannelId === currentChannel.id) {
      const myIndex = list.findIndex((p) => p.userId === currentUser.id);
      if (myIndex >= 0) {
        list = list.map((p, idx) =>
          idx === myIndex
            ? {
                ...p,
                userName: currentUser.name,
                userAvatar: currentUser.avatar,
                isMuted,
                isDeafened,
                isScreenSharing,
                isCameraOn,
              }
            : p
        );
      } else {
        list = [
          ...list,
          {
            userId: currentUser.id,
            userName: currentUser.name,
            userAvatar: currentUser.avatar,
            channelId: currentChannel.id,
            isMuted,
            isDeafened,
            isSpeaking: false,
            isScreenSharing,
            isCameraOn,
            viewers: [],
            joinedAt: Date.now(),
          },
        ];
      }
    }
    return list;
  }, [
    voiceParticipants,
    currentChannel.id,
    currentVoiceChannelId,
    currentUser.id,
    currentUser.name,
    currentUser.avatar,
    isMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
  ]);

  const activeVoiceBarParticipants = useMemo(() => {
    if (!currentVoiceChannelId) return [];
    let list = voiceParticipants.filter((p) => p.channelId === currentVoiceChannelId);
    const myIndex = list.findIndex((p) => p.userId === currentUser.id);
    if (myIndex >= 0) {
      list = list.map((p, idx) =>
        idx === myIndex
          ? {
              ...p,
              userName: currentUser.name,
              userAvatar: currentUser.avatar,
              isMuted,
              isDeafened,
              isScreenSharing,
              isCameraOn,
            }
          : p
      );
    } else {
      list = [
        ...list,
        {
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          channelId: currentVoiceChannelId,
          isMuted,
          isDeafened,
          isSpeaking: false,
          isScreenSharing,
          isCameraOn,
          viewers: [],
          joinedAt: Date.now(),
        },
      ];
    }
    return list;
  }, [
    voiceParticipants,
    currentVoiceChannelId,
    currentUser.id,
    currentUser.name,
    currentUser.avatar,
    isMuted,
    isDeafened,
    isScreenSharing,
    isCameraOn,
  ]);

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#090a0f] text-white gap-4">
        <div className="w-10 h-10 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
        <p className="text-sm font-medium text-slate-400">Conectando ao Braza Talk...</p>
      </div>
    );
  }

  return (
    <div id="brazatalk-app-root" className="h-screen w-screen flex flex-col bg-[#090a0f] overflow-hidden">
      {/* Auth Screen Modal if user not logged in */}
      {!firebaseUser && <AuthModal />}

      {/* Offline Alert Banner */}
      <OfflineBanner
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onManualSync={handleSyncOutbox}
      />

      {/* Dynamic OTA Update Banner */}
      {updateInfo.updateAvailable && (
        <div
          id="banner-update-available"
          className="bg-gradient-to-r from-emerald-600 via-indigo-600 to-purple-600 text-white px-3 sm:px-4 py-2 flex items-center justify-between text-xs z-30 shadow-md animate-in slide-in-from-top duration-300 shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="p-1 rounded-md bg-white/20 shrink-0">
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <span className="font-bold truncate">
              Nova versão {updateInfo.latestVersion} do Braza Talk disponível!
            </span>
            <span className="hidden md:inline text-white/80 text-[11px]">
              (Atualização instantânea OTA com 1 clique — sem necessidade de reinstalar)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              id="btn-banner-update-now"
              onClick={() => {
                setAppInstallerTab('update');
                setShowAppInstaller(true);
              }}
              className="bg-white hover:bg-slate-100 text-slate-900 font-bold px-3 py-1 rounded-lg text-[11px] transition-all shadow-sm cursor-pointer whitespace-nowrap"
            >
              Atualizar com 1 Clique
            </button>
          </div>
        </div>
      )}

      {/* PWA App Installation Prompt for Mobile Browsers */}
      <PWAInstallBanner onOpenInstallerModal={() => setShowAppInstaller(true)} />

      {/* Main Multi-Sidebar Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Left Drawer Backdrop */}
        {mobileNavOpen && (
          <div
            id="backdrop-mobile-nav"
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* 1 & 2. Desktop Static Sidebars OR Mobile Slide-in Drawer */}
        <div
          id="nav-sidebars-container"
          className={`${
            mobileNavOpen
              ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl animate-in slide-in-from-left duration-200'
              : 'hidden md:flex'
          }`}
        >
          {/* 1. Far Left: Server Navigation */}
          <ServerNav
            servers={servers}
            activeServerId={activeServerId}
            unreadNotificationsCount={unreadNotificationsCount}
            onOpenNotifications={() => setShowNotificationsModal(true)}
            onSelectServer={(id) => {
              setActiveServerId(id);
              if (id) {
                const s = servers.find((serv) => serv.id === id);
                if (s && s.channels.length > 0) {
                  setActiveChannelId(s.channels[0].id);
                }
              }
            }}
            onOpenCreateServer={() => {
              setMobileNavOpen(false);
              setCreateModal({ open: true, mode: 'server' });
            }}
            onOpenInstaller={() => {
              setMobileNavOpen(false);
              setShowAppInstaller(true);
            }}
            onOpenExplore={() => {
              setMobileNavOpen(false);
              setShowExploreModal(true);
            }}
          />

          {/* 2. Channels Sidebar */}
          <ChannelNav
            server={currentServer}
            activeChannelId={activeChannelId}
            onSelectChannel={(chan) => {
              setActiveChannelId(chan.id);
              setMobileNavOpen(false);
            }}
            voiceParticipants={enrichedSidebarVoiceParticipants}
            currentVoiceChannelId={currentVoiceChannelId}
            onJoinVoice={(cId) => {
              handleJoinVoice(cId);
              setMobileNavOpen(false);
            }}
            onLeaveVoice={handleLeaveVoiceAndNavigateToGeneral}
            onOpenServerSettings={() => {
              setMobileNavOpen(false);
              setShowServerSettings(true);
            }}
            onOpenCreateChannel={(catId) => {
              setMobileNavOpen(false);
              setCreateModal({ open: true, mode: 'channel', categoryId: catId });
            }}
            onOpenManageChannel={(chan) => {
              setMobileNavOpen(false);
              setManagingChannel(chan);
            }}
            onOpenInvite={(cId) => {
              setMobileNavOpen(false);
              setShowInviteModal({ open: true, channelId: cId });
            }}
            currentUser={currentUser}
            onOpenUserSettings={() => {
              setMobileNavOpen(false);
              setUserSettingsInitialTab('profile');
              setShowUserSettings(true);
            }}
            onToggleMute={handleToggleMute}
            onToggleDeafen={handleToggleDeafen}
            isMuted={isMuted}
            isDeafened={isDeafened}
            directMessageUsers={directMessageUsers}
          />
        </div>

        {/* 3. Center Main Stage / Chat View */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {currentChannel.type === 'project' ? (
            <ProjectWorkspace
              channel={currentChannel}
              currentUser={currentUser}
              voiceParticipants={enrichedSidebarVoiceParticipants}
              currentVoiceChannelId={currentVoiceChannelId}
              onJoinVoice={handleJoinVoice}
              onLeaveVoice={handleLeaveVoiceAndNavigateToGeneral}
              isMuted={isMuted}
              isDeafened={isDeafened}
              onToggleMute={handleToggleMute}
              onToggleDeafen={handleToggleDeafen}
              onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
              onOpenManageChannel={() => setManagingChannel(currentChannel)}
            />
          ) : isVoiceActiveChannel ? (
            <VoiceRoomStage
              channel={currentChannel}
              participants={activeStageVoiceParticipants}
              currentUser={currentUser}
              onWatchStream={handleWatchStream}
              isWatchingStreamId={isWatchingStreamId}
              onStopWatchingStream={() => setIsWatchingStreamId(null)}
              onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
              onToggleMemberList={() => setShowMemberList(!showMemberList)}
              showMemberList={showMemberList}
              screenMediaStream={screenMediaStream}
              onChangeScreenSource={handleChangeScreenSource}
              onToggleScreenShare={handleToggleScreenShare}
              onOpenInvite={() => setShowInviteModal({ open: true, channelId: currentChannel.id })}
              onLeaveVoice={handleLeaveVoiceAndNavigateToGeneral}
              unreadNotificationsCount={unreadNotificationsCount}
              onOpenNotifications={() => setShowNotificationsModal(true)}
            />
          ) : (
            <ChatArea
              channel={currentChannel}
              messages={currentChannelMessages}
              currentUser={currentUser}
              onSendMessage={handleSendMessage}
              onReact={handleReact}
              onPinMessage={handlePinMessage}
              onDeleteMessage={handleDeleteMessage}
              onToggleMemberList={() => setShowMemberList(!showMemberList)}
              showMemberList={showMemberList}
              onOpenE2EESecurityModal={() => {
                setUserSettingsInitialTab('e2ee');
                setShowUserSettings(true);
              }}
              onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
              onOpenInvite={() => setShowInviteModal({ open: true, channelId: currentChannel.id })}
              onOpenManageChannel={() => setManagingChannel(currentChannel)}
              unreadNotificationsCount={unreadNotificationsCount}
              onOpenNotifications={() => setShowNotificationsModal(true)}
            />
          )}

          {/* Active Voice Connection Bar at bottom when connected in voice (hidden if already in project room which has integrated bar) */}
          {currentVoiceChannelId && currentChannel.type !== 'project' && (
            <VoiceControlsBar
              currentChannel={
                currentServer?.channels.find((c) => c.id === currentVoiceChannelId) || currentChannel
              }
              participants={activeVoiceBarParticipants}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isScreenSharing={isScreenSharing}
              isCameraOn={isCameraOn}
              onToggleMute={handleToggleMute}
              onToggleDeafen={handleToggleDeafen}
              onToggleScreenShare={handleToggleScreenShare}
              onToggleCamera={handleToggleCamera}
              onLeaveVoice={handleLeaveVoiceAndNavigateToGeneral}
            />
          )}
        </div>

        {/* 4. Right: Member List Sidebar */}
        {showMemberList && currentServer && (
          <>
            {/* Mobile Backdrop for Member List */}
            <div
              id="backdrop-mobile-members"
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-200"
              onClick={() => setShowMemberList(false)}
            />
            <div
              id="member-list-wrapper"
              className="fixed inset-y-0 right-0 z-50 shadow-2xl md:static md:z-auto md:shadow-none flex animate-in slide-in-from-right duration-200"
            >
              <MemberList
                members={currentServer.members || [currentUser]}
                roles={currentServer.roles}
                currentUser={currentUser}
                onAssignRole={handleAssignRole}
                onRemoveRole={handleRemoveRole}
                onClose={() => setShowMemberList(false)}
                onKickMember={async (uid) => {
                  const updatedMembers = (currentServer.members || []).filter((m) => m.id !== uid);
                  const updatedServer = { ...currentServer, members: updatedMembers };
                  setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
                  await firebaseDb.saveServer(updatedServer);
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Floating Push Notification Toast */}
      <NotificationToast
        notifications={notifications}
        onDismiss={(id) => setNotifications((prev) => prev.filter((n) => n.id !== id))}
        onNavigate={(srvId, chanId) => {
          if (srvId) setActiveServerId(srvId);
          if (chanId) setActiveChannelId(chanId);
        }}
      />

      {/* MODALS */}
      {showServerSettings && currentServer && (
        <ServerSettingsModal
          server={currentServer}
          onClose={() => setShowServerSettings(false)}
          onUpdateServer={handleUpdateServer}
          onManageChannel={(chan) => {
            setShowServerSettings(false);
            setManagingChannel(chan);
          }}
        />
      )}

      {managingChannel && currentServer && (
        <ManageChannelModal
          channel={managingChannel}
          server={currentServer}
          onClose={() => setManagingChannel(null)}
          onUpdateChannel={handleUpdateChannel}
          onDeleteChannel={handleDeleteChannel}
        />
      )}

      {showUserSettings && (
        <UserSettingsModal
          currentUser={currentUser}
          initialTab={userSettingsInitialTab}
          onClose={() => setShowUserSettings(false)}
          onUpdateUser={handleUpdateUser}
          onSignOut={handleSignOut}
          onOpenInstaller={() => {
            setShowUserSettings(false);
            setShowAppInstaller(true);
          }}
        />
      )}

      {showAppInstaller && (
        <AppInstallerModal
          initialTab={appInstallerTab}
          onClose={() => setShowAppInstaller(false)}
        />
      )}

      {createModal.open && (
        <CreateServerOrChannelModal
          mode={createModal.mode}
          categoryId={createModal.categoryId}
          onClose={() => setCreateModal({ open: false, mode: 'server' })}
          onCreateServer={handleCreateServer}
          onCreateChannel={handleCreateChannel}
        />
      )}

      {showInviteModal.open && (
        <InviteModal
          server={currentServer}
          channel={
            showInviteModal.channelId
              ? currentServer?.channels.find((c) => c.id === showInviteModal.channelId) || currentChannel
              : currentChannel
          }
          currentUser={currentUser}
          availableUsers={directMessageUsers}
          onClose={() => setShowInviteModal({ open: false })}
          onSendDirectInvite={(targetUser, channelName) => {
            const newNotif: NotificationItem = {
              id: `notif-${Date.now()}`,
              title: 'Convite Enviado!',
              body: `Convite para ${currentServer?.name || 'servidor'} enviado para ${targetUser.name}.`,
              type: 'mention',
              timestamp: Date.now(),
              channelId: showInviteModal.channelId || currentChannel.id,
              serverId: currentServer?.id,
              read: false,
            };
            setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);
            pushNotificationToast('Convite Enviado', `Convite enviado para ${targetUser.name}!`, 'mention');
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'server-invite',
                  targetUserId: targetUser.id,
                  senderName: currentUser.name,
                  serverName: currentServer?.name,
                  serverId: currentServer?.id,
                  channelId: showInviteModal.channelId || currentChannel.id,
                })
              );
            }
          }}
        />
      )}

      {showExploreModal && (
        <ExploreServersModal
          isOpen={showExploreModal}
          onClose={() => setShowExploreModal(false)}
          currentUser={currentUser}
          userServers={servers}
          onSelectServer={(sId) => {
            setActiveServerId(sId);
            const s = servers.find((srv) => srv.id === sId);
            if (s && s.channels && s.channels.length > 0) {
              setActiveChannelId(s.channels[0].id);
            }
          }}
          onJoinServer={handleJoinServer}
        />
      )}

      {/* Real-time Notifications & Room Invites Modal */}
      <NotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        notifications={appNotifications}
        onMarkAllAsRead={() => {
          setAppNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        }}
        onClearAll={() => {
          setAppNotifications([]);
        }}
        onDismissNotification={(id) => {
          setAppNotifications((prev) => prev.filter((n) => n.id !== id));
        }}
        onAcceptInvite={(invite) => {
          if (invite.serverId) {
            setActiveServerId(invite.serverId);
          }
          if (invite.channelId) {
            setActiveChannelId(invite.channelId);
            handleJoinVoice(invite.channelId);
          }
        }}
      />
    </div>
  );
}
