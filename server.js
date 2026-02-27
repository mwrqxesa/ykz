require('dotenv').config();
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const DISCORD_BOT_TOKEN = process.env.BOT_TOKEN;
const TARGET_USER_ID = process.env.TARGET_USER_ID || '826501596702965850';

app.use(express.static('public'));

function getAvatarUrl(user) {
  if (!user?.avatar) {
    return `https://cdn.discordapp.com/embed/avatars/${Math.floor(Math.random() * 5)}.png`;
  }
  const ext = user.avatar.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${ext}?size=1024`;
}

function getBannerUrl(user) {
  if (!user?.banner) return null;
  const ext = user.banner.startsWith('a_') ? 'gif' : 'png';
  return `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${ext}?size=2048`;
}

app.get('/api/profile', async (_req, res) => {
  try {
    if (!DISCORD_BOT_TOKEN) {
      return res.status(500).json({ error: 'BOT_TOKEN não configurado.' });
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

    res.json({
      id: user.id,
      username: user.username,
      globalName: user.global_name || null,
      avatarUrl: getAvatarUrl(user),
      bannerUrl: getBannerUrl(user),
      accentColor: user.accent_color || null,

      // 👇 edite seus links aqui
      links: [
        {
          label: 'Discord',
          icon: '💬',
          url: `https://discord.com/users/${user.id}`
        },
        {
          label: 'Instagram',
          icon: '📸',
          url: 'https://instagram.com/'
        },
        {
          label: 'GitHub',
          icon: '💻',
          url: 'https://github.com/'
        }
      ]
    });
  } catch (error) {
    console.error('Erro /api/profile:', error);
    res.status(500).json({ error: 'Erro interno ao buscar perfil.' });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Site rodando na porta ${PORT}`);
});
