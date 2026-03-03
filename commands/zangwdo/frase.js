const { SlashCommandBuilder } = require('discord.js');

const frases = [
  'A calma é só um intervalo técnico entre surtos organizados.',
  'Nem todo caos é problema. Às vezes é assinatura.',
  'Quem entendeu, entendeu. Quem não entendeu, o Zangwdo complica mais.',
  'Hoje eu escolhi paz. A paz escolheu outra pessoa.',
  'Energia baixa? Ative o modo Zangwdo.',
  'Se deu errado, pelo menos ficou memorável.',
  'Disciplina e caos podem dividir o mesmo quarto.'
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('frase-zangwdo')
    .setDescription('Receba uma frase aleatória do Zangwdo'),

  async execute(interaction) {
    const frase = frases[Math.floor(Math.random() * frases.length)];
    await interaction.reply(`✨ **Frase do Zangwdo:** ${frase}`);
  }
};
