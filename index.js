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
let isConnectingVoice = false;

if (!TOKEN) {
  console.error('❌ Token não encontrado. Defina DISCORD_TOKEN (ou BOT_TOKEN) nas Variables do Railway.');
  process.exit(1);
}

if (!CLIENT_ID || !GUILD_ID) {
  console.warn('⚠️ CLIENT_ID ou GUILD_ID não definidos. Slash NÃO será registrado automaticamente.');
  console.warn('⚠️ Defina CLIENT_ID e GUILD_ID nas Variables do Railway para aparecer no "/".');
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

function scheduleReconnect(delay = 5000, reason = 'sem motivo informado') {
  if (reconnectTimeout) return;

  console.log(`🔁 Agendando reconexão em ${delay}ms | motivo: ${reason}`);

  reconnectTimeout = setTimeout(async () => {
    reconnectTimeout = null;
    await connectToFixedVoiceChannel(reason);
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
        console.warn(`⚠️ Comando inválido (sem data/execute): ${path.relative(__dirname, fullPath)}`);
        continue;
      }

      const name = command.data?.name;
      if (!name) {
        console.warn(`⚠️ Comando sem name (data.name): ${path.relative(__dirname, fullPath)}`);
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

function attachConnectionListeners(connection) {
  connection.on('stateChange', (oldState, newState) => {
    console.log(`🎤 Voice state: ${oldState.status} -> ${newState.status}`);
  });

  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log('✅ VoiceConnection entrou em READY.');
    clearReconnectTimer();
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    console.warn('⚠️ VoiceConnection entrou em DISCONNECTED.');

    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);

      console.log('🔄 A conexão está tentando se recuperar sozinha.');
    } catch {
      console.warn('❌ Desconexão real detectada. Destruindo conexão e reconectando...');
      try {
        connection.destroy();
      } catch (err) {
        console.error('❌ Erro ao destruir conexão antiga:', err);
      }

      scheduleReconnect(3000, 'desconexão real');
    }
  });

  connection.on(VoiceConnectionStatus.Destroyed, () => {
    console.warn('⚠️ VoiceConnection foi destruída.');
    scheduleReconnect(3000, 'connection destroyed');
  });
}

async function connectToFixedVoiceChannel(reason = 'inicialização') {
  if (isConnectingVoice) {
    console.log(`⏳ Já existe tentativa de conexão em andamento. Motivo novo: ${reason}`);
    return;
  }

  isConnectingVoice = true;

  try {
    if (!VOICE_GUILD_ID || !VOICE_CHANNEL_ID) {
      console.warn('⚠️ VOICE_GUILD_ID ou VOICE_CHANNEL_ID não definidos.');
      return;
    }

    if (!client.isReady()) {
      console.warn('⚠️ Cliente ainda não está pronto para conectar na call.');
      scheduleReconnect(5000, 'client ainda não pronto');
      return;
    }

    const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
    if (!guild) {
      console.error('❌ Guild da call não encontrada.');
      scheduleReconnect(8000, 'guild não encontrada');
      return;
    }

    const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error('❌ Canal de voz não encontrado.');
      scheduleReconnect(8000, 'canal não encontrado');
      return;
    }

    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      console.error('❌ O VOICE_CHANNEL_ID informado não é um canal de voz.');
      return;
    }

    const me = guild.members.me ?? await guild.members.fetchMe().catch(() => null);
    if (!me) {
      console.error('❌ Não consegui obter o membro do bot na guild.');
      scheduleReconnect(8000, 'guild.members.me indisponível');
      return;
    }

    const permissions = channel.permissionsFor(me);
    if (!permissions?.has('ViewChannel') || !permissions?.has('Connect')) {
      console.error('❌ O bot não tem permissão para ver/conectar nesse canal.');
      return;
    }

    const existing = getVoiceConnection(guild.id);

    if (existing && existing.state.status !== VoiceConnectionStatus.Destroyed) {
      const sameChannel = existing.joinConfig.channelId === channel.id;
      const inGoodState =
        existing.state.status === VoiceConnectionStatus.Ready ||
        existing.state.status === VoiceConnectionStatus.Connecting ||
        existing.state.status === VoiceConnectionStatus.Signalling;

      if (sameChannel && inGoodState) {
        console.log(`✅ Conexão já existe na call correta. Estado: ${existing.state.status}`);
        clearReconnectTimer();
        return;
      }

      console.log(`🔁 Limpando conexão antiga. Estado atual: ${existing.state.status}`);
      try {
        existing.destroy();
      } catch (err) {
        console.error('❌ Erro ao destruir conexão existente:', err);
      }
    }

    console.log(`🔊 Conectando na call fixa: ${channel.name} (${channel.id}) | motivo: ${reason}`);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    attachConnectionListeners(connection);

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    console.log('✅ Bot conectado na call fixa com sucesso.');
    clearReconnectTimer();
  } catch (err) {
    console.error('❌ Erro ao conectar na call fixa:', err);
    scheduleReconnect(5000, 'erro no connectToFixedVoiceChannel');
  } finally {
    isConnectingVoice = false;
  }
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
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!client.user) return;

    const botId = client.user.id;
    if (oldState.id !== botId && newState.id !== botId) return;

    console.log(`🤖 Bot mudou de voz: ${oldState.channelId || 'null'} -> ${newState.channelId || 'null'}`);

    if (newState.channelId !== VOICE_CHANNEL_ID) {
      console.warn('⚠️ Bot saiu da call fixa. Tentando voltar...');
      scheduleReconnect(2000, 'voice state fora da call fixa');
    } else {
      clearReconnectTimer();
    }
  } catch (err) {
    console.error('❌ Erro no VoiceStateUpdate:', err);
  }
});

client.on(Events.GuildCreate, async (guild) => {
  if (guild.id === VOICE_GUILD_ID) {
    console.log('📥 Bot entrou/confirmou presença na guild da call fixa.');
    scheduleReconnect(2000, 'guild create');
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    console.log(`➡️ Slash recebido: /${interaction.commandName} | user=${interaction.user.tag} | guild=${interaction.guildId}`);

    const command = client.commands.get(interaction.commandName);

    if (!command) {
      console.warn(`⚠️ Comando não encontrado no runtime: /${interaction.commandName}`);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '⚠️ Esse comando não foi encontrado no bot (runtime).',
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
