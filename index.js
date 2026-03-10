require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType,
  REST,
  Routes,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');

const {
  joinVoiceChannel,
  getVoiceConnection,
  VoiceConnectionStatus,
  entersState,
} = require('@discordjs/voice');

console.log('🚀 Iniciando Zangwdo...');

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const VOICE_GUILD_ID = process.env.VOICE_GUILD_ID;
const VOICE_CHANNEL_ID = process.env.VOICE_CHANNEL_ID;

let reconnectTimeout = null;
let voiceWatchdogInterval = null;
let isConnectingVoice = false;
let currentConnectAttempt = 0;
let consecutiveMissingChecks = 0;
let consecutiveBadStateChecks = 0;

if (!TOKEN) {
  console.error('❌ Token não encontrado. Defina DISCORD_TOKEN ou BOT_TOKEN.');
  process.exit(1);
}

if (!CLIENT_ID || !GUILD_ID) {
  console.warn('⚠️ CLIENT_ID ou GUILD_ID não definidos. Slash não será registrado automaticamente.');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();

function clearReconnectTimer() {
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
}

function scheduleReconnect(delay = 5000, reason = 'motivo não informado', force = false) {
  if (reconnectTimeout) return;

  console.log(`🔁 Reconexão agendada em ${delay}ms | motivo: ${reason} | force=${force}`);

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;

    if (force) {
      await forceReconnectToFixedChannel(reason);
    } else {
      await connectToFixedVoiceChannel(reason);
    }
  }, delay);
}

function loadCommandsRecursively(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      loadCommandsRecursively(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    try {
      delete require.cache[require.resolve(fullPath)];
      const command = require(fullPath);

      if (!command?.data || !command?.execute) {
        console.warn(`⚠️ Comando inválido: ${path.relative(__dirname, fullPath)}`);
        continue;
      }

      const name = command.data?.name;
      if (!name) {
        console.warn(`⚠️ Comando sem nome: ${path.relative(__dirname, fullPath)}`);
        continue;
      }

      client.commands.set(name, command);
      console.log(`✅ Comando carregado: /${name} (${path.relative(__dirname, fullPath)})`);
    } catch (err) {
      console.error(`❌ Erro ao carregar ${path.relative(__dirname, fullPath)}:`, err);
    }
  }
}

function buildCommandsJSON() {
  return [...client.commands.values()].map((cmd) => cmd.data.toJSON());
}

async function registerSlashCommands() {
  if (!CLIENT_ID || !GUILD_ID) return;

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  const body = buildCommandsJSON();

  console.log(`🔄 Registrando ${body.length} slash command(s) na guild ${GUILD_ID}...`);

  const data = await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body }
  );

  console.log(`✅ Slash registrados! Discord confirmou: ${data.length}`);
  console.log('📌 Confirmados:', data.map((c) => c.name).join(', '));
}

async function getTargetGuildAndChannel() {
  const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
  if (!guild) {
    console.error('❌ Guild da call não encontrada.');
    return {};
  }

  const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
  if (!channel) {
    console.error('❌ Canal de voz não encontrado.');
    return { guild };
  }

  if (
    channel.type !== ChannelType.GuildVoice &&
    channel.type !== ChannelType.GuildStageVoice
  ) {
    console.error('❌ O VOICE_CHANNEL_ID informado não é um canal de voz.');
    return { guild };
  }

  return { guild, channel };
}

async function hasVoicePermissions(channel) {
  const me = channel.guild.members.me ?? await channel.guild.members.fetchMe().catch(() => null);
  if (!me) return false;

  const perms = channel.permissionsFor(me);
  if (!perms) return false;

  return (
    perms.has(PermissionsBitField.Flags.ViewChannel) &&
    perms.has(PermissionsBitField.Flags.Connect)
  );
}

function destroyExistingConnection(guildId, label = 'sem label') {
  const existing = getVoiceConnection(guildId);
  if (!existing) return;

  console.log(`🧨 Destruindo conexão antiga | motivo: ${label} | estado: ${existing.state.status}`);

  try {
    existing.removeAllListeners();
    existing.destroy();
  } catch (err) {
    console.error('❌ Erro ao destruir conexão antiga:', err);
  }
}

async function forceReconnectToFixedChannel(reason = 'forçado') {
  try {
    const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
    if (guild) {
      destroyExistingConnection(guild.id, `force reconnect: ${reason}`);
    }
  } catch (err) {
    console.error('❌ Erro ao forçar destruição da conexão:', err);
  }

  isConnectingVoice = false;
  await connectToFixedVoiceChannel(reason);
}

function attachConnectionListeners(connection, guildId, attemptId) {
  connection.on('stateChange', (oldState, newState) => {
    console.log(`🎤 Voice state [tentativa ${attemptId}]: ${oldState.status} -> ${newState.status}`);

    if (newState.status === VoiceConnectionStatus.Ready) {
      consecutiveBadStateChecks = 0;
      consecutiveMissingChecks = 0;
      clearReconnectTimer();
    }
  });

  connection.on('error', (error) => {
    console.error(`❌ Voice connection error [tentativa ${attemptId}]:`, error);
    isConnectingVoice = false;
    scheduleReconnect(5000, 'voice connection error', true);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn(`⚠️ Voice DISCONNECTED [tentativa ${attemptId}]`);

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);

      console.log('🔄 A lib tentou recuperar a conexão sozinha.');
    } catch {
      isConnectingVoice = false;
      scheduleReconnect(5000, 'disconnected sem recuperação', true);
    }
  });
}

async function connectToFixedVoiceChannel(reason = 'inicialização') {
  if (isConnectingVoice) {
    console.log(`⏳ Já existe conexão em andamento. Motivo novo ignorado: ${reason}`);
    return;
  }

  isConnectingVoice = true;
  currentConnectAttempt += 1;
  const attemptId = currentConnectAttempt;

  try {
    if (!VOICE_GUILD_ID || !VOICE_CHANNEL_ID) {
      console.warn('⚠️ VOICE_GUILD_ID ou VOICE_CHANNEL_ID não definidos.');
      return;
    }

    if (!client.isReady()) {
      scheduleReconnect(5000, 'client ainda não pronto', false);
      return;
    }

    const { guild, channel } = await getTargetGuildAndChannel();
    if (!guild || !channel) {
      scheduleReconnect(7000, 'guild/canal indisponível', false);
      return;
    }

    const canJoin = await hasVoicePermissions(channel);
    if (!canJoin) {
      console.error('❌ O bot não tem permissão para ver/conectar na call.');
      return;
    }

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    const currentChannelId = me?.voice?.channelId ?? null;
    const existing = getVoiceConnection(guild.id);

    if (
      existing &&
      currentChannelId === channel.id &&
      existing.joinConfig.channelId === channel.id &&
      existing.state.status === VoiceConnectionStatus.Ready
    ) {
      console.log('✅ Bot já está pronto na call correta.');
      clearReconnectTimer();
      consecutiveMissingChecks = 0;
      consecutiveBadStateChecks = 0;
      return;
    }

    if (existing) {
      destroyExistingConnection(guild.id, `recriar conexão | estado antigo: ${existing.state.status}`);
    }

    console.log(`🔊 Conectando na call fixa: ${channel.name} (${channel.id}) | motivo: ${reason} | tentativa: ${attemptId}`);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    attachConnectionListeners(connection, guild.id, attemptId);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
      console.log(`✅ Bot conectado na call fixa com sucesso. [tentativa ${attemptId}]`);
      clearReconnectTimer();
      consecutiveMissingChecks = 0;
      consecutiveBadStateChecks = 0;
    } catch (err) {
      console.error(`❌ Não chegou em READY [tentativa ${attemptId}]:`, err);
      isConnectingVoice = false;
      scheduleReconnect(8000, 'timeout aguardando ready', true);
      return;
    }
  } catch (err) {
    console.error('❌ Erro ao conectar na call fixa:', err);
    scheduleReconnect(8000, 'erro geral ao conectar', true);
  } finally {
    isConnectingVoice = false;
  }
}

function startVoiceWatchdog() {
  if (voiceWatchdogInterval) clearInterval(voiceWatchdogInterval);

  voiceWatchdogInterval = setInterval(async () => {
    try {
      if (!client.isReady()) return;
      if (!VOICE_GUILD_ID || !VOICE_CHANNEL_ID) return;
      if (isConnectingVoice) return;

      const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
      if (!guild) return;

      const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
      if (!me) return;

      const currentChannelId = me.voice?.channelId ?? null;
      const connection = getVoiceConnection(guild.id);

      if (currentChannelId !== VOICE_CHANNEL_ID) {
        consecutiveMissingChecks += 1;
        console.warn(`⚠️ Watchdog: bot fora da call fixa (${consecutiveMissingChecks}/3). Atual=${currentChannelId} Esperado=${VOICE_CHANNEL_ID}`);

        if (consecutiveMissingChecks >= 3) {
          consecutiveMissingChecks = 0;
          scheduleReconnect(2000, 'watchdog detectou bot fora da call por 3 checks', true);
        }
        return;
      }

      consecutiveMissingChecks = 0;

      if (!connection) {
        consecutiveBadStateChecks += 1;
        console.warn(`⚠️ Watchdog: sem VoiceConnection ativa (${consecutiveBadStateChecks}/3).`);

        if (consecutiveBadStateChecks >= 3) {
          consecutiveBadStateChecks = 0;
          scheduleReconnect(2000, 'watchdog sem voice connection por 3 checks', true);
        }
        return;
      }

      if (connection.joinConfig.channelId !== VOICE_CHANNEL_ID) {
        consecutiveBadStateChecks += 1;
        console.warn(`⚠️ Watchdog: conexão aponta para outro canal (${consecutiveBadStateChecks}/3).`);

        if (consecutiveBadStateChecks >= 3) {
          consecutiveBadStateChecks = 0;
          scheduleReconnect(2000, 'watchdog canal incorreto por 3 checks', true);
        }
        return;
      }

      if (
        connection.state.status !== VoiceConnectionStatus.Ready &&
        connection.state.status !== VoiceConnectionStatus.Connecting &&
        connection.state.status !== VoiceConnectionStatus.Signalling
      ) {
        consecutiveBadStateChecks += 1;
        console.warn(`⚠️ Watchdog: estado ruim ${connection.state.status} (${consecutiveBadStateChecks}/3).`);

        if (consecutiveBadStateChecks >= 3) {
          consecutiveBadStateChecks = 0;
          scheduleReconnect(2000, `watchdog estado ${connection.state.status} por 3 checks`, true);
        }
        return;
      }

      consecutiveBadStateChecks = 0;
    } catch (err) {
      console.error('❌ Erro no watchdog de voz:', err);
    }
  }, 10000);
}

(function bootstrap() {
  try {
    const commandsRoot = path.join(__dirname, 'commands');

    if (!fs.existsSync(commandsRoot)) {
      console.warn('⚠️ Pasta "commands" não encontrada. Nenhum comando será carregado.');
      return;
    }

    loadCommandsRecursively(commandsRoot);

    console.log(`🧠 Total de comandos carregados: ${client.commands.size}`);
    if (client.commands.size > 0) {
      console.log('🧾 Lista:', [...client.commands.keys()].join(', '));
    }
  } catch (err) {
    console.error('❌ Erro geral ao carregar comandos:', err);
  }
})();

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Zangwdo online como ${c.user.tag}`);

  c.user.setPresence({
    activities: [{ name: 'a energia do caos 👁️', type: ActivityType.Watching }],
    status: 'online',
  });

  try {
    await registerSlashCommands();
  } catch (e) {
    console.error('❌ Falha ao registrar slash commands:', e);
  }

  await connectToFixedVoiceChannel('client ready');
  startVoiceWatchdog();
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!client.user) return;

    const botId = client.user.id;
    if (oldState.id !== botId && newState.id !== botId) return;

    console.log(`🤖 Bot mudou de voz: ${oldState.channelId || 'null'} -> ${newState.channelId || 'null'}`);

    if (newState.channelId !== VOICE_CHANNEL_ID) {
      scheduleReconnect(4000, 'voice state fora da call fixa', true);
    } else {
      consecutiveMissingChecks = 0;
      clearReconnectTimer();
    }
  } catch (err) {
    console.error('❌ Erro no VoiceStateUpdate:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    console.log(`➡️ Slash recebido: /${interaction.commandName} | user=${interaction.user.tag} | guild=${interaction.guildId}`);

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ Esse comando não foi encontrado no bot.',
          ephemeral: true,
        });
      }
      return;
    }

    await command.execute(interaction, client);
  } catch (error) {
    console.error(`❌ Erro no comando /${interaction?.commandName}:`, error);

    const msg = { content: '❌ O Zangwdo tropeçou nesse comando.', ephemeral: true };

    if (interaction?.deferred) {
      await interaction.editReply(msg).catch(() => {});
    } else if (interaction?.replied) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Uncaught Exception:', error));

client.login(TOKEN)
  .then(() => console.log('🔐 Login enviado ao Discord...'))
  .catch((err) => {
    console.error('❌ Falha no login:', err);
    process.exit(1);
  });
