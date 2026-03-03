const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('limpar')
    .setDescription('Apaga mensagens do canal')
    .addIntegerOption(option =>
      option.setName('quantidade')
        .setDescription('Quantidade de mensagens (1 a 100)')
        .setRequired(true)
        .setMinValue(1)
        .setMaxValue(100)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction) {
    const amount = interaction.options.getInteger('quantidade');

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({
        content: '🚫 Você não tem permissão para usar este comando.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);

    if (!deleted) {
      return interaction.editReply(
        '❌ Não consegui apagar as mensagens (mensagens antigas demais não podem ser apagadas em massa).'
      );
    }

    await interaction.editReply(`🧹 O Zangwdo limpou **${deleted.size}** mensagens.`);
  }
};
