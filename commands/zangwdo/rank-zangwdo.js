const { SlashCommandBuilder } = require('discord.js');
const { getGuildRanking } = require('../../utils/economy');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('rank-zangwdo')
    .setDescription('Mostra o ranking de energia do servidor'),

  async execute(interaction) {
    const ranking = getGuildRanking(interaction.guild.id).slice(0, 10);

    if (!ranking.length) {
      return interaction.reply('📭 Ainda não há dados no ranking. Falem mais para invocar o Zangwdo.');
    }

    const lines = await Promise.all(
      ranking.map(async (u, i) => {
        let memberName = `Usuário ${u.userId}`;

        try {
          const member = await interaction.guild.members.fetch(u.userId);
          memberName = member.user.username;
        } catch {}

        const medal =
          i === 0 ? '🥇' :
          i === 1 ? '🥈' :
          i === 2 ? '🥉' :
          `\`${String(i + 1).padStart(2, '0')}\``;

        return `${medal} **${memberName}** — Nível **${u.level}** | Afinidade **${u.affinity}** | 🪙 ${u.coins}`;
      })
    );

    await interaction.reply(`🏆 **Ranking Zangwdo do servidor**\n\n${lines.join('\n')}`);
  }
};
