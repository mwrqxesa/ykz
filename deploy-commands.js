// deploy-commands.js
require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN) {
  console.error('❌ DISCORD_TOKEN ou BOT_TOKEN não encontrado nas variables (.env/Railway).');
  process.exit(1);
}
if (!CLIENT_ID) {
  console.error('❌ CLIENT_ID não encontrado nas variables (.env/Railway).');
  process.exit(1);
}
if (!GUILD_ID) {
  console.error('❌ GUILD_ID não encontrado nas variables (.env/Railway).');
  process.exit(1);
}

const commands = [];
const commandsRoot = path.join(__dirname, 'commands');

/**
 * Coleta comandos recursivamente em /commands
 * Espera export: { data, execute }
 */
function collectCommands(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      collectCommands(fullPath);
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    try {
      delete require.cache[require.resolve(fullPath)];
      const command = require(fullPath);

      if (!command?.data || !command?.execute) {
        console.warn(`⚠️ Comando inválido (sem data/execute): ${fullPath}`);
        continue;
      }

      commands.push(command.data.toJSON());
      console.log(`✅ Coletado: /${command.data.name} (${path.relative(__dirname, fullPath)})`);
    } catch (err) {
      console.error(`❌ Erro ao importar ${fullPath}:`, err);
    }
  }
}

(async () => {
  try {
    console.log('🚀 Iniciando registro de comandos...');
    console.log('📌 CLIENT_ID:', CLIENT_ID);
    console.log('📌 GUILD_ID :', GUILD_ID);
    console.log('📌 commandsRoot:', commandsRoot);

    if (!fs.existsSync(commandsRoot)) {
      throw new Error(`Pasta commands não encontrada em: ${commandsRoot}`);
    }

    collectCommands(commandsRoot);

    console.log(`🧠 Total coletado: ${commands.length}`);
    console.log('🧾 Nomes:', commands.map(c => c.name).join(', '));

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    // (Opcional) limpar antes: rode "node deploy-commands.js --clear"
    if (process.argv.includes('--clear')) {
      console.log('🧹 Limpando comandos da guild...');
      await rest.put(
        Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
        { body: [] }
      );
      console.log('✅ Guild limpa.');
    }

    console.log('🔄 Registrando comandos na guild...');
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commands }
    );

    console.log(`✅ Sucesso! Registrados na guild: ${data.length}`);
    console.log('📌 Confirmados pelo Discord:', data.map(c => c.name).join(', '));
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:');
    console.error(error);
    process.exit(1);
  }
})();
