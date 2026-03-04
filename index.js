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
} = require('discord.js');

console.log('🚀 Iniciando Zangwdo...');

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
if (!TOKEN) {
  console.error('❌ Token não encontrado. Defina DISCORD_TOKEN (ou BOT_TOKEN) no Railway/.env');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel],
});

client.commands = new Collection();

/**
 * Carrega comandos recursivamente dentro de /commands
 * Espera que cada arquivo exporte: { data, execute }
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
      // Evita cache em reload (não é obrigatório, mas ajuda em dev)
      delete require.cache[require.resolve(fullPath)];
      const command = require(fullPath);

      if (!command?.data || !command?.execute) {
        console.warn(`⚠️ Comando inválido (sem data/execute): ${fullPath}`);
        continue;
      }

      const name = command.data?.name;
      if (!name) {
        console.warn(`⚠️ Comando sem nome (data.name): ${fullPath}`);
        continue;
      }

      client.commands.set(name, command);
      console.log(`✅ Comando carregado: /${name}  (${path.relative(__dirname, fullPath)})`);
    } catch (err) {
      console.error(`❌ Erro ao carregar comando ${fullPath}:`, err);
    }
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
client.once(Events.ClientReady, (c) => {
  console.log(`✅ Zangwdo online como ${c.user.tag}`);

  c.user.setPresence({
    activities: [{ name: 'a energia do caos 👁️', type: ActivityType.Watching }],
    status: 'online',
  });
});

/**
 * Interactions (Slash Commands)
 */
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    console.log(
      `➡️ Slash recebido: /${interaction.commandName} | user=${interaction.user.tag} | guild=${interaction.guildId}`
    );

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

    // Evita "This interaction failed" se o comando demorar
    // (só não defere se o comando já respondeu por conta própria muito rápido)
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: false }).catch(() => {});
    }

    await command.execute(interaction, client);
  } catch (error) {
    console.error(`❌ Erro ao processar interação /${interaction?.commandName}:`, error);

    const msg = { content: '❌ O Zangwdo tropeçou nesse comando.', ephemeral: true };

    // Se já foi deferido, edita; se já respondeu, followUp; se não, reply.
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
 * Erros gerais (não deixa o processo morrer sem log)
 */
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

/**
 * Login
 */
client
  .login(TOKEN)
  .then(() => console.log('🔐 Login enviado ao Discord...'))
  .catch((err) => {
    console.error('❌ Falha no login:', err);
    process.exit(1);
  });
