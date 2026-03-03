const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('zangwdo-status')
    .setDescription('Mostra o estado atual da energia do Zangwdo'),

  async execute(interaction) {
    const statusList = [
      { nome: 'Calma suspeita', emoji: '🌙', chance: 18 },
      { nome: 'Neutro observador', emoji: '🫧', chance: 24 },
      { nome: 'Caótico funcional', emoji: '⚡', chance: 28 },
      { nome: 'Surtado elegante', emoji: '🌪️', chance: 20 },
      { nome: 'Modo lendário', emoji: '👑', chance: 10 }
    ];

    let roll = Math.random() * 100;
    let acc = 0;
    let escolhido = statusList[0];

    for (const s of statusList) {
      acc += s.chance;
      if (roll <= acc) {
        escolhido = s;
        break;
      }
    }

    await interaction.reply(`${escolhido.emoji} **Status do Zangwdo:** ${escolhido.nome}`);
  }
};
