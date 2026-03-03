const { SlashCommandBuilder } = require('discord.js');
const { updateUser } = require('../../utils/economy');

const DAILY_COOLDOWN = 24 * 60 * 60 * 1000;

function msToTime(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Receba sua recompensa diária do Zangwdo'),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    let claimed = false;
    let remaining = 0;
    let reward = null;

    updateUser(guildId, userId, user => {
      const current = Date.now();
      const diff = current - (user.lastDailyAt || 0);

      if (diff < DAILY_COOLDOWN) {
        remaining = DAILY_COOLDOWN - diff;
        return;
      }

      const coins = 80 + Math.floor(Math.random() * 71);
      const affinity = 8 + Math.floor(Math.random() * 8);
      const xp = 25 + Math.floor(Math.random() * 16);

      user.coins += coins;
      user.affinity += affinity;
      user.xp += xp;
      user.dailies += 1;
      user.lastDailyAt = current;

      claimed = true;
      reward = { coins, affinity, xp };
    });

    if (!claimed) {
      return interaction.reply({
        content: `⏳ Você já pegou seu daily. Volte em **${msToTime(remaining)}**.`,
        ephemeral: true
      });
    }

    await interaction.reply(
      `🎁 **Daily do Zangwdo recebido!**\n` +
      `🪙 +${reward.coins} moedas\n` +
      `🧬 +${reward.affinity} afinidade\n` +
      `✨ +${reward.xp} XP`
    );
  }
};
