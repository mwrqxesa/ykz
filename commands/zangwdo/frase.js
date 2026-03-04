const { SlashCommandBuilder } = require('discord.js');
const OpenAI = require('openai');

const ai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// fallback se IA não estiver configurada ou der erro
const frasesFallback = [
  'A calma é só um intervalo técnico entre surtos organizados.',
  'Nem todo caos é problema. Às vezes é assinatura.',
  'Hoje eu escolhi paz. A paz escolheu outra pessoa.',
  'Energia baixa? Ative o modo Zangwdo.',
  'Se deu errado, pelo menos ficou memorável.',
  'Disciplina e caos podem dividir o mesmo quarto.',
];

const temas = [
  { label: 'Mush', hints: 'MushMC, lobby, rank, build, clã, call, treta, evolução' },
  { label: 'Minecraft', hints: 'Nether, portal, mineração, creeper, construção, sobrevivência, redstone' },
  { label: 'Jogos', hints: 'grind, foco, tilt, vitória, derrota, treino, constância, evolução' },
  { label: 'Discord/Call', hints: 'call, madrugada, amizade, silêncio, presença, resenha' },
  { label: 'Zangwdo', hints: 'caos, disciplina, ironia leve, respeito, presença, lenda' },
];

function pickTema() {
  return temas[Math.floor(Math.random() * temas.length)];
}

// anti-repetição (enquanto o bot estiver ligado)
const lastPhrases = [];
const MAX_LAST = 30;

function remember(phrase) {
  lastPhrases.push(phrase);
  while (lastPhrases.length > MAX_LAST) lastPhrases.shift();
}
function wasRecentlyUsed(phrase) {
  return lastPhrases.includes(phrase);
}

async function gerarFraseIA() {
  if (!ai) return null;

  const tema = pickTema();

  const system = `
Você é "Zangwdo": cria frases curtas, reflexivas, com humor sutil gamer.
Regras:
- Gere APENAS 1 frase (uma linha).
- 10 a 20 palavras.
- Português do Brasil.
- Sem palavrão pesado, sem hate, sem política.
- Não use aspas.
- Deve soar original a cada execução.
`.trim();

  const user = `
Crie uma frase reflexiva com o tema ${tema.label}.
Use referências sutis de: ${tema.hints}.
Misture caos + disciplina + maturidade + vibe gamer.
`.trim();

  // tenta até 3 vezes pra evitar repetir
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await ai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 1.15,
      max_tokens: 60,
    });

    const text = (res.choices?.[0]?.message?.content || '').trim();
    if (!text) continue;

    // garante 1 linha
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
    // IA pode demorar; evita "This interaction failed"
    await interaction.deferReply();

    try {
      const fraseIA = await gerarFraseIA();

      if (fraseIA) {
        return interaction.editReply(`✨ **Frase do Zangwdo:** ${fraseIA}`);
      }

      // fallback
      const frase = frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${frase}`);
    } catch (err) {
      console.error('Erro no frase-zangwdo (IA):', err);

      const frase = frasesFallback[Math.floor(Math.random() * frasesFallback.length)];
      return interaction.editReply(`✨ **Frase do Zangwdo:** ${frase}`);
    }
  }
};
