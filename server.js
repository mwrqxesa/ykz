require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_BOT_TOKEN = process.env.BOT_TOKEN; // token do seu bot
const TARGET_USER_ID = process.env.TARGET_USER_ID || '826501596702965850'; // seu ID

app.use(express.static('public'));

function getAvatarUrl(user) {
  if (!user?.avatar) return `https://cdn.discordapp.com/embed/avatars/${(Number(user.discriminator || 0) % 5)}.png`;
  const isAnimated = user.avatar.startsWith('a_');
  const ext = isAnimated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=1024`;
}

function getBannerUrl(user) {
  if (!user?.banner) return null;
  const isAnimated = user.banner.startsWith('a_');
  const ext = isAnimated ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=2048`;
}

app.get('/api/profile', async (req, res) => {
  try {
    if (!DISCORD_BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN não configurado no .env' });
    }

    const response = await fetch(`https://discord.com/api/v10/users/${TARGET_USER_ID}`, {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        error: 'Falha ao consultar Discord API',
        details: text
      });
    }

    const user = await response.json();

    const payload = {
      id: user.id,
      username: user.username,
      global_name: user.global_name || null,
      avatarUrl: getAvatarUrl(user),
      bannerUrl: getBannerUrl(user),
      accent_color: user.accent_color || null,
      // personalize seus links aqui
      links: [
        { label: 'Discord', icon: '💬', url: 'https://discord.com/users/826501596702965850' },
        { label: 'Instagram', icon: '📸', url: 'https://instagram.com/' },
        { label: 'GitHub', icon: '💻', url: 'https://github.com/' }
      ]
    };

    res.json(payload);
  } catch (err) {
    console.error('Erro /api/profile:', err);
    res.status(500).json({ error: 'Erro interno ao buscar perfil' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Site rodando em http://localhost:${PORT}`);
});
