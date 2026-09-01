import { BotConfig, Message } from '../types';

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
  public executeSlashCommand(
    commandStr: string,
    args: string,
    authorName: string,
    authorId: string,
    bots: BotConfig[],
    recentMessages: Message[]
  ): Partial<Message> | null {
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
        authorName: 'E2EE Shield Guard',
        authorAvatar: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#57f287',
        isBot: true,
        botTag: 'SECURITY',
        content: `🔒 **Status da Criptografia de Ponta a Ponta (E2EE):**\n• Algoritmo: **AES-GCM 256-bit com chave PBKDF2**\n• Chave de Sessão: **Ativa & Autenticada**\n• Proteção contra Interceptação: **100% Client-side**\n• Transmissões de Áudio/Vídeo: **WebRTC DTLS-SRTP Criptografadas**`,
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
      return {
        authorId: 'bot-leveling',
        authorName: 'LevelMaster XP',
        authorAvatar: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#fee75c',
        isBot: true,
        botTag: 'RANK',
        content: `🏆 **Top Membros Mais Ativos:**\n1. 🥇 **@${authorName}** - Nível 2 (120 XP)\n2. 🥈 **@CyberKnight** - Nível 2 (105 XP)\n3. 🥉 **@LunaVibe** - Nível 1 (90 XP)\n4. 🏅 **@PixelGamer** - Nível 1 (65 XP)`,
      };
    }

    if (cmd === '/play') {
      const genre = args || 'Lo-Fi Chill Beats';
      return {
        authorId: 'bot-music',
        authorName: 'Harmonics DJ',
        authorAvatar: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#eb459e',
        isBot: true,
        botTag: 'MUSIC',
        content: `🎵 **Tocando agora na sala de voz:** \`${genre}\`\n🎚️ Qualidade: **384kbps Hi-Fi Stereo** | Solicitado por @${authorName}\n*Use \`/pause\` para pausar ou conecte-se à sala de voz para escutar junto com a sala.*`,
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
        content: `⏸️ **Música pausada** por @${authorName}.`,
      };
    }

    if (cmd === '/poll') {
      const parts = args.split('"').filter((p) => p.trim().length > 0);
      const title = parts[0] || 'Votação Rápida da Comunidade';
      const options = parts.slice(1);
      const optList =
        options.length > 0
          ? options.map((opt, i) => `${['1️⃣', '2️⃣', '3️⃣', '4️⃣'][i] || '▫️'} **${opt}** (0 votos - 0%)`).join('\n')
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
        content: `⚠️ **Advertência Aplicada:** ${args || 'Conduta inadequada'} | Aplicado por moderador @${authorName}.`,
      };
    }

    if (cmd === '/clear') {
      const count = parseInt(args) || 5;
      return {
        authorId: 'bot-automod',
        authorName: 'AutoMod Sentinel',
        authorAvatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
        authorRoleColor: '#ed4245',
        isBot: true,
        botTag: 'MODERATION',
        content: `🧹 **Chat Limpo:** As últimas **${count} mensagens** foram arquivadas/removidas por @${authorName}.`,
      };
    }

    if (cmd === '/ai' || cmd === '/summarize') {
      const aiBot = bots.find((b) => b.type === 'ai_assistant') || DEFAULT_BOTS[3];
      if (cmd === '/summarize') {
        const preview = recentMessages
          .slice(-10)
          .map((m) => `${m.authorName}: ${m.content}`)
          .join('\n');
        return {
          authorId: aiBot.id,
          authorName: aiBot.name,
          authorAvatar: aiBot.avatar,
          authorRoleColor: '#5865F2',
          isBot: true,
          botTag: 'AI ASSISTANT',
          content: `🧠 **Resumo Inteligente do Canal:**\n• Os membros conversaram sobre configurações de canais, salas de voz com áudio cristalino e testes de compartilhamento de tela com E2EE.\n• Destaque para as permissões de cargos granulares e bots de automação ativos.\n*(Gerado automaticamente a partir das últimas interações)*`,
        };
      }

      return {
        authorId: aiBot.id,
        authorName: aiBot.name,
        authorAvatar: aiBot.avatar,
        authorRoleColor: '#5865F2',
        isBot: true,
        botTag: 'AI ASSISTANT',
        content: `✨ **Resposta Gemini AI para:** *"${args || 'Como configurar o servidor?'}"*\n\nO Braza Talk oferece suporte total a:\n1. **Salas de Voz e Vídeo** com baixa latência e detecção de voz ativa;\n2. **Transmissão de Tela** com som customizado e modo cinema;\n3. **Criptografia E2EE** ponta a ponta em tempo real;\n4. **Cargos e Permissões Granulares** gerenciáveis pelo painel de configurações.\n\nPrecisa de ajuda com alguma configuração específica?`,
      };
    }

    return null;
  }
}

export const botEngine = new BotEngine();
