require('dotenv').config();

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Partials,
  Events,
  ActivityType
} = require('discord.js');

console.log('🚀 Iniciando Zangwdo...');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN não encontrado no .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

client.commands = new Collection();

// Carregar comandos
try {
  const commandsPath = path.join(__dirname, 'commands');

  if (!fs.existsSync(commandsPath)) {
    console.warn('⚠️ Pasta commands não encontrada.');
  } else {
    const folders = fs.readdirSync(commandsPath);
    console.log('📂 Pastas de comandos:', folders);

    for (const folder of folders) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);

        if (command.data && command.execute) {
          client.commands.set(command.data.name, command);
        } else {
          console.warn(`⚠️ Comando inválido (sem data/execute): ${filePath}`);
        }
      }
    }

    console.log(`🧠 ${client.commands.size} comandos carregados.`);
  }
} catch (err) {
  console.error('❌ Erro ao carregar comandos:', err);
}

client.once(Events.ClientReady, c => {
  console.log(`✅ Zangwdo online como ${c.user.tag}`);

  c.user.setPresence({
    activities: [{ name: 'a energia do caos 👁️', type: ActivityType.Watching }],
    status: 'online'
  });
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction, client);
  } catch (error) {
    console.error(`❌ Erro no comando /${interaction.commandName}:`, error);

    const msg = { content: '❌ O Zangwdo tropeçou nesse comando.', ephemeral: true };

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(msg).catch(() => {});
    } else {
      await interaction.reply(msg).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔐 Login enviado ao Discord...'))
  .catch(err => {
    console.error('❌ Falha no login:', err);
    process.exit(1);
  });
