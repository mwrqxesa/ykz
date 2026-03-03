require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

(async () => {
  try {
    console.log('🚀 Iniciando registro de comandos...');

    if (!process.env.DISCORD_TOKEN) throw new Error('DISCORD_TOKEN não encontrado no .env');
    if (!process.env.CLIENT_ID) throw new Error('CLIENT_ID não encontrado no .env');
    if (!process.env.GUILD_ID) throw new Error('GUILD_ID não encontrado no .env');

    const folders = fs.readdirSync(commandsPath);
    console.log('📂 Pastas encontradas:', folders);

    for (const folder of folders) {
      const folderPath = path.join(commandsPath, folder);
      if (!fs.statSync(folderPath).isDirectory()) continue;

      const commandFiles = fs.readdirSync(folderPath).filter(f => f.endsWith('.js'));
      console.log(`📁 ${folder}:`, commandFiles);

      for (const file of commandFiles) {
        const filePath = path.join(folderPath, file);
        const command = require(filePath);

        if (command.data && command.execute) {
          commands.push(command.data.toJSON());
        } else {
          console.warn(`⚠️ Comando inválido (sem data/execute): ${filePath}`);
        }
      }
    }

    console.log('🧠 Comandos coletados:', commands.map(c => c.name));

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    console.log(`🔄 Registrando ${commands.length} comandos na guild ${process.env.GUILD_ID}...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );

    console.log('✅ Comandos registrados com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao registrar comandos:');
    console.error(error);
  }
})();
