const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUser, xpNeeded } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('perfil')
    .setDescription('Mostra seu perfil Zangwdo')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Ver perfil de outro usuário')
        .setRequired(false)
    ),

  async execute(interaction) {
    const target = interaction.options.getUser('usuario') || interaction.user;
    const data = getUser(interaction.guild.id, target.id);

    const needed = xpNeeded(data.level);
    const progress = ((data.xp / needed) * 100).toFixed(1);

    const embed = new EmbedBuilder()
      .setTitle(`👤 Perfil Zangwdo — ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ size: 256 }))
      .addFields(
        { name: '📈 Nível', value: String(data.level), inline: true },
        { name: '✨ XP', value: `${data.xp}/${needed} (${progress}%)`, inline: true },
        { name: '🪙 Moedas', value: String(data.coins), inline: true },
        { name: '🧬 Afinidade', value: String(data.affinity), inline: true },
        { name: '💬 Mensagens', value: String(data.messages), inline: true },
        { name: '🕯️ Rituais', value: String(data.rituals), inline: true }
      )
      .setFooter({ text: 'Zangwdo • perfil de energia' });

    await interaction.reply({ embeds: [embed] });
  }
};
