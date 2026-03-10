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

function scheduleReconnect(delay = 5000, reason = 'motivo não informado') {
  if (reconnectTimeout) return;

  console.log(`🔁 Reconexão agendada em ${delay}ms | motivo: ${reason}`);

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    await forceReconnectToFixedChannel(reason);
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

function attachConnectionListeners(connection, guildId, channelId, attemptId) {
  connection.on('stateChange', (oldState, newState) => {
    console.log(`🎤 Voice state [tentativa ${attemptId}]: ${oldState.status} -> ${newState.status}`);
  });

  connection.on('error', (error) => {
    console.error(`❌ Voice connection error [tentativa ${attemptId}]:`, error);
    destroyExistingConnection(guildId, 'voice connection error');
    scheduleReconnect(3000, 'voice connection error');
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log(`✅ Voice READY [tentativa ${attemptId}]`);
    clearReconnectTimer();
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn(`⚠️ Voice DISCONNECTED [tentativa ${attemptId}]`);

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5000),
      ]);

      console.log('🔄 A lib tentou recuperar a conexão sozinha.');
    } catch {
      destroyExistingConnection(guildId, 'disconnected sem recuperação');
      scheduleReconnect(3000, 'disconnected sem recuperação');
    }
  });

  const bootTimeout = setTimeout(() => {
    const current = getVoiceConnection(guildId);
    if (!current) return;

    const stuck =
      current.joinConfig.channelId === channelId &&
      (
        current.state.status === VoiceConnectionStatus.Signalling ||
        current.state.status === VoiceConnectionStatus.Connecting
      );

    if (stuck) {
      console.warn(`⚠️ Conexão travada em ${current.state.status}. Forçando recriação...`);
      destroyExistingConnection(guildId, 'travada em signalling/connecting');
      scheduleReconnect(2500, 'travou no boot da voz');
    }
  }, 15000);

  connection.on(VoiceConnectionStatus.Ready, () => clearTimeout(bootTimeout));
  connection.on(VoiceConnectionStatus.Destroyed, () => clearTimeout(bootTimeout));
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
      scheduleReconnect(5000, 'client ainda não pronto');
      return;
    }

    const { guild, channel } = await getTargetGuildAndChannel();
    if (!guild || !channel) {
      scheduleReconnect(7000, 'guild/canal indisponível');
      return;
    }

    const canJoin = await hasVoicePermissions(channel);
    if (!canJoin) {
      console.error('❌ O bot não tem permissão para ver/conectar na call.');
      return;
    }

    const existing = getVoiceConnection(guild.id);

    if (existing) {
      const sameChannel = existing.joinConfig.channelId === channel.id;

      if (sameChannel && existing.state.status === VoiceConnectionStatus.Ready) {
        console.log('✅ Bot já está pronto na call correta.');
        clearReconnectTimer();
        return;
      }

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

    attachConnectionListeners(connection, guild.id, channel.id, attemptId);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 15000);
      console.log(`✅ Bot conectado na call fixa com sucesso. [tentativa ${attemptId}]`);
      clearReconnectTimer();
    } catch (err) {
      console.error(`❌ Não chegou em READY [tentativa ${attemptId}]:`, err);
      destroyExistingConnection(guild.id, 'timeout aguardando ready');
      scheduleReconnect(3000, 'timeout aguardando ready');
    }
  } catch (err) {
    console.error('❌ Erro ao conectar na call fixa:', err);
    scheduleReconnect(5000, 'erro geral ao conectar');
  } finally {
    isConnectingVoice = false;
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

  await connectToFixedVoiceChannel(reason);
}

function startVoiceWatchdog() {
  if (voiceWatchdogInterval) clearInterval(voiceWatchdogInterval);

  voiceWatchdogInterval = setInterval(async () => {
    try {
      if (!client.isReady()) return;
      if (!VOICE_GUILD_ID || !VOICE_CHANNEL_ID) return;

      const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
      if (!guild) return;

      const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
      if (!me) return;

      const currentChannelId = me.voice?.channelId ?? null;
      const connection = getVoiceConnection(guild.id);

      if (currentChannelId !== VOICE_CHANNEL_ID) {
        console.warn(`⚠️ Watchdog: bot fora da call fixa. Atual=${currentChannelId} Esperado=${VOICE_CHANNEL_ID}`);
        scheduleReconnect(1000, 'watchdog detectou bot fora da call');
        return;
      }

      if (!connection) {
        console.warn('⚠️ Watchdog: sem VoiceConnection ativa.');
        scheduleReconnect(1000, 'watchdog sem voice connection');
        return;
      }

      if (connection.state.status !== VoiceConnectionStatus.Ready) {
        console.warn(`⚠️ Watchdog: conexão não está READY (${connection.state.status}).`);
        destroyExistingConnection(guild.id, `watchdog estado ${connection.state.status}`);
        scheduleReconnect(1500, 'watchdog conexão não ready');
      }
    } catch (err) {
      console.error('❌ Erro no watchdog de voz:', err);
    }
  }, 20000);
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
      console.warn('⚠️ Bot saiu da call fixa. Tentando voltar...');
      scheduleReconnect(1500, 'voice state fora da call fixa');
    } else {
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
