export type ChannelType = 'text' | 'voice' | 'announcement' | 'stage' | 'project';

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
  selectedMicId?: string; // ID do microfone selecionado
  selectedSpeakerId?: string; // ID do alto-falante/fone selecionado
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

export type ProjectLLMProvider = 'gemini' | 'openai' | 'claude' | 'groq' | 'deepseek' | 'custom';

export interface ProjectAgent {
  id: string;
  name: string;
  handle: string; // e.g. "@scriptmaster"
  avatar: string;
  role: string;
  color: string;
  skills: string[];
  systemPrompt: string;
  provider?: ProjectLLMProvider;
  model?: string;
}

export interface ProjectRagDoc {
  id: string;
  title: string;
  gameEngine?: string;
  tags: string[];
  content: string;
  uploadedAt: number;
}

export interface ProjectFile {
  id: string;
  name: string; // e.g. "fxmanifest.lua", "client.lua", "config.json", "index.html"
  path: string;
  content: string;
  language: 'lua' | 'json' | 'javascript' | 'typescript' | 'html' | 'css' | 'csharp' | 'python' | 'markdown' | 'yaml' | 'text';
  updatedAt: number;
  updatedBy: string; // user or agent name
  version: number;
}

export interface ProjectPlanStep {
  id: string;
  order: number;
  title: string;
  description: string;
  assignedAgentHandle: string; // e.g. "@scriptmaster"
  status: 'pending' | 'in_progress' | 'waiting_user_input' | 'completed' | 'failed';
  questionToUser?: string; // if agent paused to ask user
  userAnswer?: string;
  outputSummary?: string;
  filesTouched?: string[];
  updatedAt?: number;
}

export interface ProjectActionPlan {
  id: string;
  goal: string;
  status: 'idle' | 'running' | 'waiting_user' | 'completed' | 'paused';
  currentStepIndex: number;
  steps: ProjectPlanStep[];
  startedAt?: number;
  updatedAt?: number;
}

export interface InterAgentMessage {
  id: string;
  senderHandle: string;
  senderName: string;
  senderAvatar: string;
  senderColor: string;
  recipientHandle?: string; // e.g. "@auditor" or "all"
  actionType: 'thought' | 'proposal' | 'critique' | 'code_review' | 'question_user' | 'approval';
  content: string;
  timestamp: number;
  relatedStepId?: string;
  relatedFileName?: string;
}

export interface ProjectAgentActivity {
  agentHandle: string;
  status: 'idle' | 'thinking' | 'coding' | 'reviewing' | 'waiting_user';
  currentTask?: string;
  thought?: string;
  lastActiveAt: number;
}

export interface ProjectPendingQuestion {
  stepId: string;
  agentHandle: string;
  agentName: string;
  agentAvatar: string;
  agentColor?: string;
  question: string;
  suggestedOptions?: string[];
  timestamp: number;
}

export interface ProjectRoomState {
  channelId: string;
  serverId?: string;
  projectName: string;
  gameEngine: string; // e.g. "GTA FiveM / Lua", "Minecraft / Fabric", "Unity / C#", "Unreal Engine / C++", "Skyrim / Papyrus", "Web / React"
  targetDescription: string;
  guardrails: string;
  selectedProvider: ProjectLLMProvider;
  selectedModel: string;
  customApiKey?: string;
  customBaseUrl?: string;
  agents: ProjectAgent[];
  ragDocs: ProjectRagDoc[];
  files: ProjectFile[];
  activeFileId?: string;
  testConsoleLogs?: string[];
  actionPlan?: ProjectActionPlan;
  agenticActivities?: Record<string, ProjectAgentActivity>;
  interAgentDialogues?: InterAgentMessage[];
  pendingUserQuestion?: ProjectPendingQuestion | null;
  updatedAt?: number;
}

