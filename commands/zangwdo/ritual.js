const { SlashCommandBuilder } = require('discord.js');
const { updateUser } = require('../../utils/economy');

const RITUAL_COOLDOWN = 6 * 60 * 60 * 1000;

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
    .setName('ritual')
    .setDescription('Realiza um ritual do Zangwdo e recebe recompensa'),

  async execute(interaction) {
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;

    const outcomes = [
      { text: 'As velas tremeram. O caos aprovou.', mult: 1 },
      { text: 'Um portal abriu e fechou na mesma hora. Bom sinal?', mult: 1.2 },
      { text: 'O Zangwdo observou em silêncio. Isso vale muito.', mult: 1.4 },
      { text: 'Ritual raro! Energia lendária momentânea.', mult: 2.0 }
    ];

    let claimed = false;
    let remaining = 0;
    let result = null;

    updateUser(guildId, userId, user => {
      const current = Date.now();
      const diff = current - (user.lastRitualAt || 0);

      if (diff < RITUAL_COOLDOWN) {
        remaining = RITUAL_COOLDOWN - diff;
        return;
      }

      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];

      const baseCoins = 35 + Math.floor(Math.random() * 26);
      const baseXp = 15 + Math.floor(Math.random() * 16);
      const baseAffinity = 10 + Math.floor(Math.random() * 11);

      const coins = Math.floor(baseCoins * outcome.mult);
      const xp = Math.floor(baseXp * outcome.mult);
      const affinity = Math.floor(baseAffinity * outcome.mult);

      user.coins += coins;
      user.xp += xp;
      user.affinity += affinity;
      user.rituals += 1;
      user.lastRitualAt = current;

      claimed = true;
      result = { outcome, coins, xp, affinity };
    });

    if (!claimed) {
      return interaction.reply({
        content: `🕯️ O ritual ainda está em recarga. Tente novamente em **${msToTime(remaining)}**.`,
        ephemeral: true
      });
    }

    await interaction.reply(
      `🕯️ **Ritual concluído!**\n` +
      `_${result.outcome.text}_\n\n` +
      `🪙 +${result.coins} moedas\n` +
      `✨ +${result.xp} XP\n` +
      `🧬 +${result.affinity} afinidade`
    );
  }
};
