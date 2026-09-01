import React, { useState, useEffect, useRef } from 'react';
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
import { AuthModal } from './components/Modals/AuthModal';
import { OfflineBanner } from './components/Common/OfflineBanner';
import { NotificationToast } from './components/Common/NotificationToast';
import { soundEngine } from './services/soundEngine';
import { e2eeService } from './services/e2eeService';
import { offlineStorage } from './services/offlineStorage';
import { botEngine } from './services/botEngine';
import { updateService, UpdateState } from './services/updateService';
import { Sparkles } from 'lucide-react';
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
  const [currentUser, setCurrentUser] = useState<User>({
    id: 'guest',
    name: 'Carregando...',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=braza',
    status: 'online',
    customStatus: '🔥 Conectado no Braza Talk',
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

  // In-App Notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Voice & Video State
  const [currentVoiceChannelId, setCurrentVoiceChannelId] = useState<string | null>(null);
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipant[]>([]);

  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isWatchingStreamId, setIsWatchingStreamId] = useState<string | null>(null);
  const [screenMediaStream, setScreenMediaStream] = useState<MediaStream | null>(null);

  // Modals
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);
  const [showAppInstaller, setShowAppInstaller] = useState(false);
  const [appInstallerTab, setAppInstallerTab] = useState<'install' | 'update'>('install');
  const [updateInfo, setUpdateInfo] = useState<UpdateState>(updateService.getState());
  const [createModal, setCreateModal] = useState<{ open: boolean; mode: 'server' | 'channel'; categoryId?: string }>({
    open: false,
    mode: 'server',
  });

  // WebSocket reference
  const wsRef = useRef<WebSocket | null>(null);

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
        };

        setCurrentUser(appUser);

        // If PTT mode is enabled, initially start muted until key is held
        if (appUser.voiceInputMode === 'ptt') {
          setIsMuted(true);
        }

        // Check and bootstrap default server if empty
        const initialServer = await firebaseDb.initializeDefaultServerIfEmpty(appUser);
        setActiveServerId(initialServer.id);
        if (initialServer.channels && initialServer.channels.length > 0) {
          setActiveChannelId(initialServer.channels[0].id);
        }
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
          if (prev && serverList.some((s) => s.id === prev)) return prev;
          return serverList[0].id;
        });
      } else {
        setServers([]);
      }
    });

    return () => unsubscribeServers();
  }, [firebaseUser]);

  // Active Server & Channel objects
  const currentServer = servers.find((s) => s.id === activeServerId) || servers[0] || null;
  const currentChannel =
    currentServer?.channels.find((c) => c.id === activeChannelId) ||
    currentServer?.channels[0] || {
      id: 'chan-fallback',
      serverId: currentServer?.id || 'server-braza-community',
      name: 'geral',
      type: 'text' as ChannelType,
      isE2EE: false,
      isPrivate: false,
    };

  // 3. Real-time Firestore Messages Subscription for active channel
  useEffect(() => {
    if (!firebaseUser || !currentChannel.id || currentChannel.id === 'chan-fallback') return;

    const unsubscribeMessages = firebaseDb.subscribeToChannelMessages(currentChannel.id, (channelMsgs) => {
      setMessages((prev) => ({
        ...prev,
        [currentChannel.id]: channelMsgs,
      }));
      offlineStorage.cacheMessages(channelMsgs);
    });

    return () => unsubscribeMessages();
  }, [firebaseUser, currentChannel.id]);

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

    // 2. Connect to Real-time WebSocket for Voice/Video WebRTC signals
    const connectWS = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const socket = new WebSocket(wsUrl);

        socket.onopen = () => {
          if (currentUser.id && currentUser.id !== 'guest') {
            socket.send(
              JSON.stringify({
                type: 'auth',
                userId: currentUser.id,
                userName: currentUser.name,
                userAvatar: currentUser.avatar,
                channelId: currentVoiceChannelId,
              })
            );
          }
        };

        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleIncomingWSEvent(data);
          } catch (e) {
            console.warn('WS message error:', e);
          }
        };

        wsRef.current = socket;
      } catch (e) {
        console.warn('WebSocket connection fallback:', e);
      }
    };

    connectWS();

    return () => {
      unsubscribeNetwork();
      wsRef.current?.close();
    };
  }, [currentUser.id]);

  // Handle incoming WebSocket broadcasts (Voice & Signals)
  const handleIncomingWSEvent = (data: any) => {
    switch (data.type) {
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
        break;
      }

      case 'voice-user-left': {
        setVoiceParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
        soundEngine.playUserLeave();
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
    }
  };

  // Open Microphone Voice Activity Detection (VAD)
  const vadQuietTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSpeakingRef = useRef<boolean>(false);

  useEffect(() => {
    // Only active in Open Mic mode, connected to voice channel, and not muted/deafened
    if (currentUser.voiceInputMode === 'ptt' || !currentVoiceChannelId || isMuted || isDeafened) {
      if (isSpeakingRef.current) {
        isSpeakingRef.current = false;
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
        );
        if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
          wsRef.current.send(
            JSON.stringify({
              type: 'voice-state-update',
              channelId: currentVoiceChannelId,
              userId: currentUser.id,
              isSpeaking: false,
            })
          );
        }
      }
      return;
    }

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let micStream: MediaStream | null = null;
    let checkInterval: NodeJS.Timeout | null = null;

    const startVAD = async () => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaStreamSource(micStream);
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        checkInterval = setInterval(() => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;

          // Threshold: if average volume is above 10 (out of 255)
          if (avg > 10) {
            if (vadQuietTimeoutRef.current) {
              clearTimeout(vadQuietTimeoutRef.current);
              vadQuietTimeoutRef.current = null;
            }

            if (!isSpeakingRef.current) {
              isSpeakingRef.current = true;
              setVoiceParticipants((prev) =>
                prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: true } : p))
              );

              if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
                wsRef.current.send(
                  JSON.stringify({
                    type: 'voice-state-update',
                    channelId: currentVoiceChannelId,
                    userId: currentUser.id,
                    isSpeaking: true,
                  })
                );
              }
            }
          } else {
            // Silence detected: wait 350ms before marking as quiet
            if (isSpeakingRef.current && !vadQuietTimeoutRef.current) {
              vadQuietTimeoutRef.current = setTimeout(() => {
                isSpeakingRef.current = false;
                vadQuietTimeoutRef.current = null;
                setVoiceParticipants((prev) =>
                  prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
                );

                if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
                  wsRef.current.send(
                    JSON.stringify({
                      type: 'voice-state-update',
                      channelId: currentVoiceChannelId,
                      userId: currentUser.id,
                      isSpeaking: false,
                    })
                  );
                }
              }, 350);
            }
          }
        }, 70);
      } catch (err) {
        console.warn('VAD mic init info/permission:', err);
      }
    };

    startVAD();

    return () => {
      if (checkInterval) clearInterval(checkInterval);
      if (vadQuietTimeoutRef.current) clearTimeout(vadQuietTimeoutRef.current);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioCtx && audioCtx.state !== 'closed') audioCtx.close().catch(() => {});
      if (isSpeakingRef.current) {
        isSpeakingRef.current = false;
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isSpeaking: false } : p))
        );
      }
    };
  }, [currentUser.voiceInputMode, currentVoiceChannelId, isMuted, isDeafened, currentUser.id]);

  // Push-to-Talk (PTT) Global Key Listener
  const pttReleaseTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (currentUser.voiceInputMode !== 'ptt' || !currentVoiceChannelId) return;

    const pttKeyTarget = currentUser.pttKey || 'Space';
    const releaseDelay = currentUser.pttReleaseDelay ?? 200;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in text inputs or textareas
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const pressedKey = e.code || e.key;
      if (pressedKey === pttKeyTarget || e.key === pttKeyTarget || e.code === pttKeyTarget) {
        if (pttReleaseTimeoutRef.current) {
          clearTimeout(pttReleaseTimeoutRef.current);
          pttReleaseTimeoutRef.current = null;
        }

        // Unmute and mark speaking when key is held
        setIsMuted(false);
        setVoiceParticipants((prev) =>
          prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: false, isSpeaking: true } : p))
        );

        if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
          wsRef.current.send(
            JSON.stringify({
              type: 'voice-state-update',
              channelId: currentVoiceChannelId,
              userId: currentUser.id,
              isMuted: false,
              isSpeaking: true,
            })
          );
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const pressedKey = e.code || e.key;
      if (pressedKey === pttKeyTarget || e.key === pttKeyTarget || e.code === pttKeyTarget) {
        if (pttReleaseTimeoutRef.current) {
          clearTimeout(pttReleaseTimeoutRef.current);
        }

        pttReleaseTimeoutRef.current = setTimeout(() => {
          setIsMuted(true);
          setVoiceParticipants((prev) =>
            prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: true, isSpeaking: false } : p))
          );

          if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
            wsRef.current.send(
              JSON.stringify({
                type: 'voice-state-update',
                channelId: currentVoiceChannelId,
                userId: currentUser.id,
                isMuted: true,
                isSpeaking: false,
              })
            );
          }
        }, releaseDelay);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      if (pttReleaseTimeoutRef.current) {
        clearTimeout(pttReleaseTimeoutRef.current);
      }
    };
  }, [currentUser.voiceInputMode, currentUser.pttKey, currentUser.pttReleaseDelay, currentVoiceChannelId, currentUser.id]);

  const pushNotificationToast = (
    title: string,
    body: string,
    type: 'message' | 'mention' | 'voice_join' | 'stream_start'
  ) => {
    const newNotif: NotificationItem = {
      id: `toast-${Date.now()}-${Math.random()}`,
      title,
      body,
      type,
      timestamp: Date.now(),
      read: false,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);
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

    if (isEncrypted) {
      encryptedContent = e2eeService.encrypt(content, currentChannel.id);
    }

    const newMsg: Message = {
      id: `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      channelId: currentChannel.id,
      serverId: currentServer?.id || '',
      authorId: currentUser.id,
      userId: currentUser.id,
      authorName: currentUser.name,
      authorAvatar: currentUser.avatar,
      authorRoleColor: '#6366f1',
      content,
      encryptedContent,
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
      await firebaseDb.sendMessage(newMsg);
    } catch (e) {
      console.error('Failed to send message to Firestore:', e);
    }

    // Process Automated Bots & Slash Commands
    if (content.startsWith('/')) {
      const parts = content.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');

      const botReply = botEngine.executeSlashCommand(
        command,
        args,
        currentUser.name,
        currentUser.id,
        currentServer?.bots || [],
        currentChannelMessages
      );

      if (botReply) {
        setTimeout(async () => {
          const botMsg: Message = {
            id: `bot-msg-${Date.now()}`,
            channelId: currentChannel.id,
            serverId: currentServer?.id,
            authorId: botReply.authorId || 'system-bot',
            userId: currentUser.id,
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
          await firebaseDb.sendMessage(botMsg);
          soundEngine.playMessage();
        }, 300);
      }
    } else {
      // AutoMod check
      botEngine.processIncomingMessage(newMsg, currentServer?.bots || [], (reply) => {
        setTimeout(async () => {
          const botMsg: Message = {
            id: `bot-reply-${Date.now()}`,
            channelId: currentChannel.id,
            serverId: currentServer?.id,
            authorId: reply.authorId || 'bot-automod',
            userId: currentUser.id,
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
          await firebaseDb.sendMessage(botMsg);
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
      await firebaseDb.updateMessage(messageId, { reactions: updatedReactions });
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
      await firebaseDb.updateMessage(messageId, { pinned: nextPinned });
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
      await firebaseDb.deleteMessage(messageId);
    } catch (e) {
      console.error('Failed to delete message:', e);
    }
  };

  // 5. Voice Room Connect / Disconnect
  const handleJoinVoice = (channelId: string) => {
    if (currentVoiceChannelId === channelId) return;

    if (currentVoiceChannelId) {
      soundEngine.playUserLeave();
    }

    setCurrentVoiceChannelId(channelId);
    soundEngine.playUserJoin();

    const myParticipant: VoiceParticipant = {
      userId: currentUser.id,
      userName: currentUser.name,
      userAvatar: currentUser.avatar,
      channelId,
      isMuted,
      isDeafened,
      isSpeaking: false,
      isScreenSharing: false,
      isCameraOn: false,
      viewers: [],
      joinedAt: Date.now(),
    };

    setVoiceParticipants((prev) => [...prev.filter((p) => p.userId !== currentUser.id), myParticipant]);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'join-voice',
          channelId,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatar,
          isMuted,
          isDeafened,
        })
      );
    }
  };

  const handleStopScreenShare = () => {
    if (screenMediaStream) {
      screenMediaStream.getTracks().forEach((track) => track.stop());
      setScreenMediaStream(null);
    }
    setIsScreenSharing(false);
    soundEngine.playScreenShareEnd();

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isScreenSharing: false } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'stop-screen-share',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          userName: currentUser.name,
        })
      );
    }
  };

  const handleLeaveVoice = () => {
    if (!currentVoiceChannelId) return;
    soundEngine.playUserLeave();

    if (screenMediaStream) {
      screenMediaStream.getTracks().forEach((track) => track.stop());
      setScreenMediaStream(null);
    }

    setVoiceParticipants((prev) => prev.filter((p) => p.userId !== currentUser.id));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'leave-voice',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          userName: currentUser.name,
        })
      );
    }

    setCurrentVoiceChannelId(null);
    setIsScreenSharing(false);
    setIsCameraOn(false);
  };

  // 6. Voice Controls: Mute, Deafen, Screen Share, Camera
  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.playMute(nextMuted);

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isMuted: nextMuted } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice-state-update',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          isMuted: nextMuted,
        })
      );
    }
  };

  const handleToggleDeafen = () => {
    const nextDeafened = !isDeafened;
    setIsDeafened(nextDeafened);
    soundEngine.playDeafen(nextDeafened);

    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isDeafened: nextDeafened } : p))
    );

    if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
      wsRef.current.send(
        JSON.stringify({
          type: 'voice-state-update',
          channelId: currentVoiceChannelId,
          userId: currentUser.id,
          isDeafened: nextDeafened,
        })
      );
    }
  };

  const handleToggleScreenShare = async () => {
    if (isScreenSharing) {
      handleStopScreenShare();
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) {
      pushNotificationToast(
        'Captura de Tela Indisponível',
        'Seu navegador atual não suporta a API de seleção nativa de janelas/telas.',
        'message'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
        },
        audio: true,
      });

      setScreenMediaStream(stream);
      setIsScreenSharing(true);
      soundEngine.playScreenShareStart();
      pushNotificationToast(
        'Transmissão ao Vivo Iniciada',
        'Sua tela selecionada está sendo compartilhada em 60FPS HD.',
        'stream_start'
      );

      // Listen for when the user clicks the browser's native floating "Stop sharing" bar
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopScreenShare();
        };
      }

      setVoiceParticipants((prev) =>
        prev.map((p) => (p.userId === currentUser.id ? { ...p, isScreenSharing: true } : p))
      );

      if (wsRef.current?.readyState === WebSocket.OPEN && currentVoiceChannelId) {
        wsRef.current.send(
          JSON.stringify({
            type: 'start-screen-share',
            channelId: currentVoiceChannelId,
            userId: currentUser.id,
            userName: currentUser.name,
          })
        );
      }
    } catch (err: any) {
      // User cancelled picker dialog or denied permission
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        console.warn('Screen share error:', err);
        pushNotificationToast(
          'Erro ao Compartilhar Tela',
          `Não foi possível iniciar a captura: ${err.message || 'Verifique as permissões'}`,
          'message'
        );
      }
    }
  };

  const handleChangeScreenSource = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getDisplayMedia) return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
        },
        audio: true,
      });

      if (screenMediaStream) {
        screenMediaStream.getTracks().forEach((track) => track.stop());
      }

      setScreenMediaStream(stream);
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.onended = () => {
          handleStopScreenShare();
        };
      }
    } catch (err: any) {
      if (err.name !== 'NotAllowedError' && err.name !== 'AbortError') {
        console.warn('Change screen error:', err);
      }
    }
  };

  const handleToggleCamera = () => {
    setIsCameraOn(!isCameraOn);
    setVoiceParticipants((prev) =>
      prev.map((p) => (p.userId === currentUser.id ? { ...p, isCameraOn: !isCameraOn } : p))
    );
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

  // 7. Manual Sync Outbox
  const handleSyncOutbox = async () => {
    const outbox = await offlineStorage.getOutboxMessages();
    if (outbox.length === 0) return;

    for (const msg of outbox) {
      await firebaseDb.sendMessage({ ...msg, pendingSync: false });
    }

    await offlineStorage.clearOutbox();
    setPendingSyncCount(0);
    soundEngine.playMessage();
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

  const handleCreateChannel = async (name: string, type: ChannelType, isE2EE: boolean, categoryId?: string) => {
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

    const updatedServer = {
      ...currentServer,
      channels: [...currentServer.channels, newChannel],
    };

    setServers((prev) => prev.map((s) => (s.id === currentServer.id ? updatedServer : s)));
    setActiveChannelId(newChanId);
    await firebaseDb.saveServer(updatedServer);
  };

  const handleSignOut = async () => {
    await signOut(auth);
    setFirebaseUser(null);
  };

  const isVoiceActiveChannel = currentChannel.type === 'voice' || currentChannel.type === 'stage';

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
          />

          {/* 2. Channels Sidebar */}
          <ChannelNav
            server={currentServer}
            activeChannelId={activeChannelId}
            onSelectChannel={(chan) => {
              setActiveChannelId(chan.id);
              setMobileNavOpen(false);
            }}
            voiceParticipants={voiceParticipants}
            currentVoiceChannelId={currentVoiceChannelId}
            onJoinVoice={(cId) => {
              handleJoinVoice(cId);
              setMobileNavOpen(false);
            }}
            onLeaveVoice={handleLeaveVoice}
            onOpenServerSettings={() => {
              setMobileNavOpen(false);
              setShowServerSettings(true);
            }}
            onOpenCreateChannel={(catId) => {
              setMobileNavOpen(false);
              setCreateModal({ open: true, mode: 'channel', categoryId: catId });
            }}
            currentUser={currentUser}
            onOpenUserSettings={() => {
              setMobileNavOpen(false);
              setShowUserSettings(true);
            }}
            onToggleMute={handleToggleMute}
            onToggleDeafen={handleToggleDeafen}
            isMuted={isMuted}
            isDeafened={isDeafened}
          />
        </div>

        {/* 3. Center Main Stage / Chat View */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          {isVoiceActiveChannel ? (
            <VoiceRoomStage
              channel={currentChannel}
              participants={voiceParticipants.filter((p) => p.channelId === currentChannel.id)}
              currentUser={currentUser}
              onWatchStream={handleWatchStream}
              isWatchingStreamId={isWatchingStreamId}
              onStopWatchingStream={() => setIsWatchingStreamId(null)}
              onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
              screenMediaStream={screenMediaStream}
              onChangeScreenSource={handleChangeScreenSource}
              onToggleScreenShare={handleToggleScreenShare}
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
              onOpenE2EESecurityModal={() => setShowUserSettings(true)}
              onToggleMobileNav={() => setMobileNavOpen(!mobileNavOpen)}
            />
          )}

          {/* Active Voice Connection Bar at bottom when connected in voice */}
          {currentVoiceChannelId && (
            <VoiceControlsBar
              currentChannel={
                currentServer?.channels.find((c) => c.id === currentVoiceChannelId) || currentChannel
              }
              participants={voiceParticipants.filter((p) => p.channelId === currentVoiceChannelId)}
              isMuted={isMuted}
              isDeafened={isDeafened}
              isScreenSharing={isScreenSharing}
              isCameraOn={isCameraOn}
              onToggleMute={handleToggleMute}
              onToggleDeafen={handleToggleDeafen}
              onToggleScreenShare={handleToggleScreenShare}
              onToggleCamera={handleToggleCamera}
              onLeaveVoice={handleLeaveVoice}
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
        />
      )}

      {showUserSettings && (
        <UserSettingsModal
          currentUser={currentUser}
          onClose={() => setShowUserSettings(false)}
          onUpdateUser={async (updated) => {
            const next = { ...currentUser, ...updated };
            setCurrentUser(next);
            if (firebaseUser) {
              await firebaseDb.updateUserProfile(firebaseUser.uid, updated);
            }
          }}
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
    </div>
  );
}
