const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Mostra informações do servidor'),

  async execute(interaction) {
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setTitle(`🏠 ${guild.name}`)
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: '🆔 ID', value: guild.id, inline: false },
        { name: '👥 Membros', value: String(guild.memberCount), inline: true },
        { name: '📅 Criado em', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setFooter({ text: 'Zangwdo • servidor' });

    await interaction.reply({ embeds: [embed] });
  }
};
