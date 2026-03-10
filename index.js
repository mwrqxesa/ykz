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

/**
 * Carrega comandos recursivamente dentro de /commands
 * Espera export: { data: SlashCommandBuilder, execute: Function }
 */
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

/**
 * Coleta commands JSON para registrar no Discord
 */
function buildCommandsJSON() {
  return [...client.commands.values()].map((cmd) => cmd.data.toJSON());
}

/**
 * Registra slash na guild
 */
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

/**
 * Conecta o bot na call fixa
 */
async function connectToFixedVoiceChannel() {
  try {
    if (!VOICE_GUILD_ID || !VOICE_CHANNEL_ID) {
      console.warn('⚠️ VOICE_GUILD_ID ou VOICE_CHANNEL_ID não definidos. Pulando conexão de voz.');
      return;
    }

    const guild = await client.guilds.fetch(VOICE_GUILD_ID).catch(() => null);
    if (!guild) {
      console.error('❌ Guild da call não encontrada.');
      return;
    }

    const channel = await guild.channels.fetch(VOICE_CHANNEL_ID).catch(() => null);
    if (!channel) {
      console.error('❌ Canal de voz não encontrado.');
      return;
    }

    if (
      channel.type !== ChannelType.GuildVoice &&
      channel.type !== ChannelType.GuildStageVoice
    ) {
      console.error('❌ O VOICE_CHANNEL_ID informado não é um canal de voz.');
      return;
    }

    const existing = getVoiceConnection(guild.id);
    if (existing) {
      if (existing.joinConfig.channelId === channel.id) {
        console.log('✅ Bot já está na call correta.');
        return;
      }

      console.log('🔁 Bot estava em outra call. Reconectando...');
      existing.destroy();
    }

    console.log(`🔊 Entrando na call fixa: ${channel.name} (${channel.id})`);

    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: guild.id,
      adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    connection.on('stateChange', async (_, newState) => {
      console.log(`🎤 Voice state: ${newState.status}`);

      if (newState.status === VoiceConnectionStatus.Disconnected) {
        console.warn('⚠️ Bot desconectado da call. Tentando voltar...');
        setTimeout(() => {
          connectToFixedVoiceChannel().catch(console.error);
        }, 5000);
      }
    });

    await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    console.log('✅ Bot conectado na call fixa com sucesso.');
  } catch (err) {
    console.error('❌ Erro ao conectar na call fixa:', err);

    setTimeout(() => {
      connectToFixedVoiceChannel().catch(console.error);
    }, 10000);
  }
}

/**
 * Boot: load commands
 */
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

/**
 * Ready
 */
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

  try {
    await connectToFixedVoiceChannel();
  } catch (e) {
    console.error('❌ Falha ao conectar na call fixa:', e);
  }
});

/**
 * Se moverem, expulsarem ou desconectarem o bot da call, ele volta
 */
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!client.user) return;

    const botId = client.user.id;
    if (oldState.id !== botId && newState.id !== botId) return;

    if (newState.channelId !== VOICE_CHANNEL_ID) {
      console.warn('⚠️ Tiraram o bot da call fixa. Voltando...');
      setTimeout(() => {
        connectToFixedVoiceChannel().catch(console.error);
      }, 3000);
    }
  } catch (err) {
    console.error('❌ Erro no VoiceStateUpdate:', err);
  }
});

/**
 * Interactions (Slash Commands)
 */
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

/**
 * Erros gerais
 */
process.on('unhandledRejection', (reason) => console.error('❌ Unhandled Rejection:', reason));
process.on('uncaughtException', (error) => console.error('❌ Uncaught Exception:', error));

/**
 * Login
 */
client.login(TOKEN)
  .then(() => console.log('🔐 Login enviado ao Discord...'))
  .catch((err) => {
    console.error('❌ Falha no login:', err);
    process.exit(1);
  });
