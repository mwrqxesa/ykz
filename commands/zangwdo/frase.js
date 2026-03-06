const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const fallback = [
  'Às vezes o silêncio ensina mais que mil argumentos.',
  'Disciplina é continuar mesmo quando a motivação saiu da call.',
  'Nem todo caos é erro; às vezes é só crescimento acontecendo.',
  'Crescer também é aprender a não reagir a tudo.',
  'Algumas batalhas se vencem simplesmente ficando em pé.'
];

const recent = [];

function remember(p) {
  recent.push(p);
  if (recent.length > 25) recent.shift();
}

function used(p) {
  return recent.includes(p);
}

async function gerarFrase() {

  const prompt = `
Você é Zangwdo.

Crie UMA frase reflexiva curta.

Regras:
- apenas 1 frase
- 8 a 20 palavras
- português do Brasil
- escolha sozinho o tema
- pode ter vibe gamer, amizade, disciplina, caos ou maturidade
- não use aspas
- não explique
`;

  for (let i = 0; i < 3; i++) {

    const res = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt
    });

    const frase = res.output_text
      ?.trim()
      ?.split("\n")[0]
      ?.replace(/["']/g, "");

    if (!frase) continue;
    if (used(frase)) continue;

    remember(frase);
    return frase;
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('frase-zangwdo')
    .setDescription('Receba uma frase aleatória criada pela IA'),

  async execute(interaction) {

    await interaction.deferReply();

    try {

      const frase = await gerarFrase();

      if (frase) {
        return interaction.editReply(`✨ **Frase do Zangwdo:** ${frase}`);
      }

      const f = fallback[Math.floor(Math.random()*fallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${f}`);

    } catch (err) {

      console.error(err);

      const f = fallback[Math.floor(Math.random()*fallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${f}`);

    }
  }
};
