const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');

const clientAI = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// fallback (se IA estiver off/der erro)
const frasesFallback = [
  'A calma é só um intervalo técnico entre surtos organizados.',
  'Nem todo caos é problema. Às vezes é assinatura.',
  'Quem entendeu, entendeu. Quem não entendeu, o Zangwdo complica mais.',
  'Hoje eu escolhi paz. A paz escolheu outra pessoa.',
  'Energia baixa? Ative o modo Zangwdo.',
  'Se deu errado, pelo menos ficou memorável.',
  'Disciplina e caos podem dividir o mesmo quarto.'
];

// memória simples pra evitar repetição (enquanto o bot estiver ligado)
const lastPhrases = [];
const MAX_LAST = 25;

function remember(phrase) {
  lastPhrases.push(phrase);
  while (lastPhrases.length > MAX_LAST) lastPhrases.shift();
}
function wasRecentlyUsed(phrase) {
  return lastPhrases.includes(phrase);
}

const temas = [
  { id: 'mush', label: 'Mush', hints: 'MushMC, lobby, rank, build, treta, clã, call' },
  { id: 'minecraft', label: 'Minecraft', hints: 'minério, Nether, portal, creeper, construção, sobrevivência, redstone' },
  { id: 'jogos', label: 'Jogos', hints: 'grind, skill, derrota, vitória, tilt, foco, rotina, evolução' },
  { id: 'discord', label: 'Discord/Call', hints: 'call, voz, madrugada, amizade, silêncio, presença' },
  { id: 'zangwdo', label: 'Zangwdo', hints: 'caos, disciplina, ironia, respeito, lenda, presença' },
];

function pickTema() {
  return temas[Math.floor(Math.random() * temas.length)];
}

async function gerarFraseIA() {
  if (!clientAI) return null;

  const tema = pickTema();

  // prompt “curto e direto” pra manter o estilo
  const system = `
Você é "Zangwdo": frases curtas, reflexivas, com leve ironia, vibe gamer.
Regras:
- 1 frase apenas (uma linha).
- 10 a 20 palavras.
- Sem palavrão pesado, sem hate.
- Não use aspas.
- Português do Brasil.
- Deve soar diferente a cada geração.
`;

  const user = `
Crie UMA frase reflexiva inspirada no tema: ${tema.label}.
Sugestões do tema: ${tema.hints}.
Mantenha o estilo Zangwdo (caos + disciplina + humor sutil).
`;

  // tenta algumas vezes evitar repetição
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await clientAI.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system.trim() },
        { role: 'user', content: user.trim() }
      ],
      temperature: 1.1,
      max_tokens: 60
    });

    const text = (res.choices?.[0]?.message?.content || '').trim();
    if (!text) continue;

    // sanitiza (garante 1 linha)
    const frase = text.split('\n').map(s => s.trim()).filter(Boolean)[0];
    if (!frase) continue;

    if (!wasRecentlyUsed(frase)) {
      remember(frase);
      return frase;
    }
  }

  return null;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('frase-zangwdo')
    .setDescription('Receba uma frase reflexiva aleatória do Zangwdo (IA).'),

  async execute(interaction) {
    await interaction.deferReply(); // evita "interaction failed" se a IA demorar

    try {
      const fraseIA = await gerarFraseIA();

      if (fraseIA) {
        return interaction.editReply(`✨ **Frase do Zangwdo:** ${fraseIA}`);
      }

      // fallback
      const frase = frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${frase}`);
    } catch (err) {
      console.error('Erro IA frase-zangwdo:', err);

      const frase = frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${frase}`);
    }
  }
};
