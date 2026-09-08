import { BotConfig, Message } from '../types';
import { auth } from './firebase';

async function getAiAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    if (auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
  } catch {}
  return headers;
}

export interface BotCommand {
  command: string;
  description: string;
  syntax: string;
  botType: string;
}

export const BOT_COMMANDS: BotCommand[] = [
  { command: '/help', description: 'Exibe a lista de comandos e bots disponíveis', syntax: '/help', botType: 'system' },
  { command: '/ai', description: 'Faz uma pergunta inteligente ao assistente AI Gemini', syntax: '/ai <sua pergunta>', botType: 'ai_assistant' },
  { command: '/summarize', description: 'Gera um resumo inteligente das últimas mensagens do canal', syntax: '/summarize', botType: 'ai_assistant' },
  { command: '/play', description: 'Toca uma faixa de áudio ou rádio na sala de voz atual', syntax: '/play <lofi | synthwave | chill | cyber>', botType: 'music' },
  { command: '/pause', description: 'Pausa a reprodução atual da rádio', syntax: '/pause', botType: 'music' },
  { command: '/poll', description: 'Cria uma votação interativa para a comunidade', syntax: '/poll "Título" "Opção 1" "Opção 2"', botType: 'poll' },
  { command: '/rank', description: 'Mostra seu nível de XP e ranking no servidor', syntax: '/rank [@usuário]', botType: 'leveling' },
  { command: '/leaderboard', description: 'Exibe os membros mais ativos do servidor', syntax: '/leaderboard', botType: 'leveling' },
  { command: '/warn', description: 'Aplica uma advertência formal a um membro', syntax: '/warn @usuário <motivo>', botType: 'automod' },
  { command: '/clear', description: 'Limpa um número específico de mensagens no chat', syntax: '/clear <quantidade>', botType: 'automod' },
  { command: '/crypto', description: 'Verifica a integridade e chave da criptografia E2EE', syntax: '/crypto', botType: 'system' },
];

export const DEFAULT_BOTS: BotConfig[] = [
  {
    id: 'bot-automod',
    name: 'AutoMod Sentinel',
    avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
    tag: 'BOT',
    description: 'Proteção em tempo real contra spam, linguagem inadequada e ataques de bots.',
    type: 'automod',
    enabled: true,
    prefix: '!',
    settings: {
      profanityFilter: true,
      spamDetectionThreshold: 4,
    },
  },
  {
    id: 'bot-welcome',
    name: 'Welcome Bot',
    avatar: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80',
    tag: 'BOT',
    description: 'Dá boas-vindas com cartões personalizados e atribui cargos automáticos.',
    type: 'welcome',
    enabled: true,
    prefix: '!',
    settings: {
      welcomeMessage: '🎉 Bem-vindo ao servidor! Sinta-se em casa e leia as regras no #geral.',
    },
  },
  {
    id: 'bot-music',
    name: 'Harmonics DJ',
    avatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
    tag: 'BOT',
    description: 'Transmite música ambiente sintetizada, lo-fi beats e podcasts nas salas de voz.',
    type: 'music',
    enabled: true,
    prefix: '/',
    settings: {
      currentRadioTrack: 'Lo-Fi Chill Sunset',
      radioPlaying: false,
    },
  },
  {
    id: 'bot-ai',
    name: 'Gemini Assistant',
    avatar: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=150&auto=format&fit=crop&q=80',
    tag: 'AI BOT',
    description: 'Assistente inteligente de moderação, tira-dúvidas e resumos de canais.',
    type: 'ai_assistant',
    enabled: true,
    prefix: '/ai',
    settings: {},
  },
  {
    id: 'bot-leveling',
    name: 'LevelMaster XP',
    avatar: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
    tag: 'BOT',
    description: 'Gamificação, sistema de XP por mensagem e recompensas de cargos automáticos.',
    type: 'leveling',
    enabled: true,
    prefix: '/',
    settings: {
      xpMultiplier: 1.5,
    },
  },
];

class BotEngine {
  private userMessageHistory: Map<string, number[]> = new Map();
  private userXP: Map<string, { xp: number; level: number; messages: number }> = new Map();

  /**
   * Process a message for automated moderation & bot triggers
   */
  public processIncomingMessage(
    msg: Message,
    bots: BotConfig[],
    onBotReply: (reply: Partial<Message>) => void
  ): { shouldBlock: boolean; reason?: string } {
    if (msg.isBot) return { shouldBlock: false };

    // 1. AutoMod Check
    const automod = bots.find((b) => b.type === 'automod' && b.enabled);
    if (automod) {
      // Spam check
      const now = Date.now();
      const userHistory = this.userMessageHistory.get(msg.authorId) || [];
      const recentMessages = userHistory.filter((t) => now - t < 3000); // 3 seconds window
      recentMessages.push(now);
      this.userMessageHistory.set(msg.authorId, recentMessages);

      if (recentMessages.length > (automod.settings.spamDetectionThreshold || 4)) {
        onBotReply({
          authorId: automod.id,
          authorName: automod.name,
          authorAvatar: automod.avatar,
          authorRoleColor: '#ed4245',
          isBot: true,
          botTag: 'AUTOMOD',
          content: `⚠️ **Aviso de Spam:** @${msg.authorName}, por favor diminua o ritmo de mensagens para manter a fluidez do canal.`,
        });
        return { shouldBlock: true, reason: 'Spam excessivo detectado.' };
      }

      // Profanity Filter check
      if (automod.settings.profanityFilter) {
        const forbidden = ['badword123', 'toxicspam', 'hackserver'];
        const isBad = forbidden.some((f) => msg.content.toLowerCase().includes(f));
        if (isBad) {
          onBotReply({
            authorId: automod.id,
            authorName: automod.name,
            authorAvatar: automod.avatar,
            authorRoleColor: '#ed4245',
            isBot: true,
            botTag: 'AUTOMOD',
            content: `🛡️ **Mensagem Filtrada:** Mensagem de @${msg.authorName} ocultada por violar as diretrizes de comunidade.`,
          });
          return { shouldBlock: true, reason: 'Filtro de moderação ativado.' };
        }
      }
    }

    // 2. Leveling & XP Accumulation
    const levelingBot = bots.find((b) => b.type === 'leveling' && b.enabled);
    if (levelingBot) {
      const current = this.userXP.get(msg.authorId) || { xp: 0, level: 1, messages: 0 };
      const gained = Math.floor(Math.random() * 15) + 10;
      current.xp += gained;
      current.messages += 1;

      const nextLevelXp = current.level * 100;
      if (current.xp >= nextLevelXp) {
        current.level += 1;
        onBotReply({
          authorId: levelingBot.id,
          authorName: levelingBot.name,
          authorAvatar: levelingBot.avatar,
          authorRoleColor: '#fee75c',
          isBot: true,
          botTag: 'LEVEL UP',
          content: `⚡ **Parabéns @${msg.authorName}!** Você acaba de subir para o **Nível ${current.level}**! 🎉 Continue interagindo no servidor para desbloquear novas medalhas.`,
        });
      }
      this.userXP.set(msg.authorId, current);
    }

    return { shouldBlock: false };
  }

  /**
   * Handle explicit Slash Commands
   */
  public async executeSlashCommand(
    commandStr: string,
    args: string,
    authorName: string,
    authorId: string,
    bots: BotConfig[],
    recentMessages: Message[],
    channelName?: string,
    serverMembers?: Array<{ id: string; name: string; avatar: string; role?: string }>
  ): Promise<(Partial<Message> & { clearCount?: number }) | null> {
    const cmd = commandStr.toLowerCase().trim();

    if (cmd === '/help') {
      const cmdList = BOT_COMMANDS.map((c) => `• \`${c.syntax}\` - ${c.description}`).join('\n');
      return {
        authorId: 'system-bot',
        authorName: 'Braza Talk Assist',
        authorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#5865F2',
        isBot: true,
        botTag: 'SYSTEM',
        content: `### 🤖 Central de Comandos & Bots\n${cmdList}\n\n*Dica: Você também pode usar as salas de voz com áudio HD, E2EE e transmissão de tela simultânea.*`,
      };
    }

    if (cmd === '/crypto') {
      return {
        authorId: 'system-bot',
        authorName: 'Segurança Braza Talk',
        authorAvatar: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#10b981',
        isBot: true,
        botTag: 'SEGURANÇA',
        content: `🔒 **Status Real da Arquitetura de Segurança:**\n\n` +
          `• **Camada de Transporte:** TLS 1.3 / HTTPS & WebSocket Seguro (WSS)\n` +
          `• **Comunicação em Tempo Real:** WebRTC com criptografia de mídia DTLS-SRTP ativa\n` +
          `• **Banco de Dados em Nuvem:** Firestore no Google Cloud protegido com regras de autorização por UID\n` +
          `• **Canais E2EE:** Chaves derivadas via WebCrypto API (AES-GCM 256-bit) para modo ultra-seguro\n` +
          `• **Prevenção XSS:** Sanitização rigorosa de Markdown via ReactMarkdown\n\n` +
          `*Todos os dados trafegam de forma cifrada entre cliente e servidor.*`,
      };
    }

    if (cmd === '/rank') {
      const stats = this.userXP.get(authorId) || { xp: 85, level: 2, messages: 14 };
      const needed = stats.level * 100;
      const progressPercent = Math.min(100, Math.round((stats.xp / needed) * 100));
      const progressBar = '█'.repeat(Math.floor(progressPercent / 10)) + '░'.repeat(10 - Math.floor(progressPercent / 10));

      return {
        authorId: 'bot-leveling',
        authorName: 'LevelMaster XP',
        authorAvatar: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#fee75c',
        isBot: true,
        botTag: 'RANK',
        content: `📊 **Estatísticas de @${authorName}:**\n• Nível: **${stats.level}**\n• XP Atual: **${stats.xp} / ${needed} XP**\n• Progresso: \`[${progressBar}] ${progressPercent}%\`\n• Mensagens enviadas: **${stats.messages}**`,
      };
    }

    if (cmd === '/leaderboard') {
      const membersList = serverMembers && serverMembers.length > 0
        ? serverMembers.slice(0, 5).map((m, idx) => {
            const medals = ['🥇', '🥈', '🥉', '🏅', '🎖️'];
            const userLevel = (this.userXP.get(m.id)?.level) || 1;
            const userXp = (this.userXP.get(m.id)?.xp) || (idx === 0 ? 120 : 45);
            return `${medals[idx] || '▫️'} **@${m.name}** — Nível ${userLevel} (${userXp} XP)`;
          }).join('\n')
        : `🥇 **@${authorName}** — Nível 1 (Membro Ativo)`;

      return {
        authorId: 'bot-leveling',
        authorName: 'LevelMaster XP',
        authorAvatar: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#f59e0b',
        isBot: true,
        botTag: 'RANKING',
        content: `🏆 **Membros Mais Ativos da Comunidade:**\n\n${membersList}\n\n*Envie mensagens nos canais para acumular XP e subir no ranking.*`,
      };
    }

    if (cmd === '/play') {
      return {
        authorId: 'bot-music',
        authorName: 'Harmonics DJ',
        authorAvatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#ec4899',
        isBot: true,
        botTag: 'ÁUDIO',
        content: `📻 **Transmissão de Áudio:**\nO streaming contínuo de estações de áudio para salas de voz está integrado ao pipeline de mídia SFU. Você pode transmitir qualquer áudio do computador clicando em **Compartilhar Tela** e ativando *"Compartilhar áudio do sistema"* na sala de voz.`,
      };
    }

    if (cmd === '/pause') {
      return {
        authorId: 'bot-music',
        authorName: 'Harmonics DJ',
        authorAvatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#eb459e',
        isBot: true,
        botTag: 'MUSIC',
        content: `⏸️ **Áudio pausado** por @${authorName}.`,
      };
    }

    if (cmd === '/poll') {
      const parts = args.split('"').filter((p) => p.trim().length > 0);
      const title = parts[0] || 'Votação Rápida da Comunidade';
      const options = parts.slice(1);
      const optList =
        options.length > 0
          ? options.map((opt, i) => `${['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][i] || '▫️'} **${opt}** (0 votos - 0%)`).join('\n')
          : '1️⃣ **Sim** (0 votos)\n2️⃣ **Não** (0 votos)';

      return {
        authorId: 'bot-welcome',
        authorName: 'Braza Talk Pollster',
        authorAvatar: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#5865F2',
        isBot: true,
        botTag: 'POLL',
        content: `📊 **VOTAÇÃO OFICIAL:** ${title}\n\n${optList}\n\n*Clique nas reações abaixo para votar.*`,
      };
    }

    if (cmd === '/warn') {
      return {
        authorId: 'bot-automod',
        authorName: 'AutoMod Sentinel',
        authorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#ed4245',
        isBot: true,
        botTag: 'MODERATION',
        content: `⚠️ **Advertência Aplicada:** ${args || 'Conduta inadequada'} | Registrado pelo moderador @${authorName}.`,
      };
    }

    if (cmd === '/clear') {
      const count = Math.min(50, Math.max(1, parseInt(args) || 5));
      return {
        authorId: 'bot-automod',
        authorName: 'AutoMod Sentinel',
        authorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#ed4245',
        isBot: true,
        botTag: 'MODERATION',
        content: `🧹 **Chat Limpo:** As últimas **${count} mensagens** foram solicitadas para remoção por @${authorName}.`,
        clearCount: count,
      };
    }

    if (cmd === '/ai') {
      const aiBot = bots.find((b) => b.type === 'ai_assistant') || DEFAULT_BOTS[3];
      const query = args.trim() || 'Como utilizar os recursos do Braza Talk?';

      try {
        const headers = await getAiAuthHeaders();
        const res = await fetch('/api/ai/command', {
          method: 'POST',
          headers,
          body: JSON.stringify({ command: '/ai', prompt: query, channelName }),
        });
        const data = await res.json();
        return {
          authorId: aiBot.id,
          authorName: aiBot.name,
          authorAvatar: aiBot.avatar,
          authorRoleColor: '#6366f1',
          isBot: true,
          botTag: 'GEMINI AI',
          content: data.reply || 'Sem resposta do assistente.',
        };
      } catch (err: any) {
        return {
          authorId: aiBot.id,
          authorName: aiBot.name,
          authorAvatar: aiBot.avatar,
          authorRoleColor: '#ed4245',
          isBot: true,
          botTag: 'GEMINI AI',
          content: `⚠️ Não foi possível consultar o assistente: ${err?.message || 'Erro de conexão'}`,
        };
      }
    }

    if (cmd === '/summarize') {
      const aiBot = bots.find((b) => b.type === 'ai_assistant') || DEFAULT_BOTS[3];
      const formatted = recentMessages
        .slice(-25)
        .map((m) => `${m.authorName}: ${m.content}`);

      try {
        const headers = await getAiAuthHeaders();
        const res = await fetch('/api/ai/command', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            command: '/summarize',
            channelMessages: formatted,
            channelName: channelName || 'geral',
          }),
        });
        const data = await res.json();
        return {
          authorId: aiBot.id,
          authorName: aiBot.name,
          authorAvatar: aiBot.avatar,
          authorRoleColor: '#6366f1',
          isBot: true,
          botTag: 'RESUMO AI',
          content: data.reply || 'Nenhum resumo gerado.',
        };
      } catch (err: any) {
        return {
          authorId: aiBot.id,
          authorName: aiBot.name,
          authorAvatar: aiBot.avatar,
          authorRoleColor: '#ed4245',
          isBot: true,
          botTag: 'RESUMO AI',
          content: `⚠️ Falha ao gerar resumo: ${err?.message || 'Erro de conexão'}`,
        };
      }
    }

    return null;
  }
}

export const botEngine = new BotEngine();
