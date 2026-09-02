export type ChannelType = 'text' | 'voice' | 'announcement' | 'stage';

export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export type SoundPack = 'braza_classic' | 'cyberpunk' | 'retro_8bit' | 'minimal_soft';

export enum Permission {
  ADMINISTRATOR = 'ADMINISTRATOR',
  MANAGE_SERVER = 'MANAGE_SERVER',
  MANAGE_CHANNELS = 'MANAGE_CHANNELS',
  MANAGE_ROLES = 'MANAGE_ROLES',
  MANAGE_MESSAGES = 'MANAGE_MESSAGES',
  KICK_MEMBERS = 'KICK_MEMBERS',
  BAN_MEMBERS = 'BAN_MEMBERS',
  SEND_MESSAGES = 'SEND_MESSAGES',
  ATTACH_FILES = 'ATTACH_FILES',
  CONNECT_VOICE = 'CONNECT_VOICE',
  SPEAK = 'SPEAK',
  STREAM_VIDEO = 'STREAM_VIDEO',
  MUTE_MEMBERS = 'MUTE_MEMBERS',
  DEAFEN_MEMBERS = 'DEAFEN_MEMBERS',
  MENTION_EVERYONE = 'MENTION_EVERYONE',
  MANAGE_BOTS = 'MANAGE_BOTS',
}

export interface Role {
  id: string;
  name: string;
  color: string;
  hoist: boolean; // Display role members separately
  position: number;
  permissions: Permission[];
}

export interface User {
  id: string;
  name: string;
  tag?: string; // e.g. #0001
  email?: string;
  avatar: string;
  banner?: string;
  status: UserStatus;
  customStatus?: string;
  bio?: string;
  isBot?: boolean;
  botType?: string;
  roles?: string[]; // role IDs in current server
  joinedAt: number;
  e2eePublicKey?: string;
  e2eeFingerprint?: string;
  // Voice Input Settings
  voiceInputMode?: 'open' | 'ptt'; // 'open' (Voz Aberta / Detecção Contínua) or 'ptt' (Push to Talk / Pressione para Falar)
  pttKey?: string; // Key code or name e.g. 'Space', 'KeyV', 'ControlLeft', 'AltLeft'
  pttReleaseDelay?: number; // Release delay in ms (default 200)
}

export interface Channel {
  id: string;
  serverId: string;
  name: string;
  type: ChannelType;
  topic?: string;
  categoryId?: string;
  isE2EE: boolean;
  isPrivate: boolean;
  allowedRoleIds?: string[];
  unreadCount?: number;
  rateLimitPerUser?: number; // seconds
}

export interface Category {
  id: string;
  serverId: string;
  name: string;
  collapsed?: boolean;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  users: string[]; // user IDs
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  type: 'image' | 'video' | 'audio' | 'file';
  size?: number;
}

export interface Message {
  id: string;
  channelId: string;
  serverId?: string;
  authorId: string;
  userId?: string;
  authorName: string;
  authorAvatar: string;
  authorRoleColor?: string;
  isBot?: boolean;
  botTag?: string;
  content: string;
  encryptedContent?: string;
  encryptionIv?: string;
  isEncrypted?: boolean;
  attachments?: MessageAttachment[];
  reactions: MessageReaction[];
  replyTo?: {
    id: string;
    authorName: string;
    content: string;
  };
  pinned?: boolean;
  timestamp: number;
  editedAt?: number;
  isVoiceNote?: boolean;
  voiceDuration?: number;
  pendingSync?: boolean; // For offline outbox
}

export interface VoiceParticipant {
  userId: string;
  userName: string;
  userAvatar: string;
  channelId: string;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  isCameraOn: boolean;
  screenStreamId?: string;
  streamTitle?: string;
  viewers: string[]; // user IDs currently viewing their stream
  joinedAt: number;
}

export interface BotConfig {
  id: string;
  name: string;
  avatar: string;
  tag: string;
  description: string;
  type: 'automod' | 'welcome' | 'music' | 'ai_assistant' | 'leveling' | 'poll';
  enabled: boolean;
  prefix: string;
  settings: {
    welcomeMessage?: string;
    welcomeChannelId?: string;
    autoAssignRoleId?: string;
    profanityFilter?: boolean;
    spamDetectionThreshold?: number;
    currentRadioTrack?: string;
    radioPlaying?: boolean;
    xpMultiplier?: number;
  };
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actorName: string;
  actorAvatar: string;
  targetName: string;
  details: string;
  timestamp: number;
}

export interface ServerSoundCustomization {
  userJoinSound: boolean;
  userLeaveSound: boolean;
  screenShareStartSound: boolean;
  screenShareEndSound: boolean;
  streamViewerSound: boolean;
  mentionSound: boolean;
  messageSound: boolean;
  pack: SoundPack;
  volume: number; // 0 to 1
}

export interface Server {
  id: string;
  name: string;
  icon: string;
  banner?: string;
  description: string;
  ownerId: string;
  roles: Role[];
  categories: Category[];
  channels: Channel[];
  members: User[];
  bots: BotConfig[];
  auditLogs: AuditLogEntry[];
  sounds: ServerSoundCustomization;
  createdAt: number;
  e2eeEnabled: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type: 'message' | 'mention' | 'voice_join' | 'stream_start' | 'stream_viewer' | 'bot_alert';
  serverId?: string;
  channelId?: string;
  timestamp: number;
  read: boolean;
}
