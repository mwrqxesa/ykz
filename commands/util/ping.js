const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Mostra a latência do bot'),

  async execute(interaction, client) {
    const msg = await interaction.reply({
      content: '🏓 Calculando...',
      fetchReply: true
    });

    const latency = msg.createdTimestamp - interaction.createdTimestamp;
    const apiPing = Math.round(client.ws.ping);

    await interaction.editReply(
      `🏓 Pong!\n📡 Latência: **${latency}ms**\n🌐 API: **${apiPing}ms**`
    );
  }
};
