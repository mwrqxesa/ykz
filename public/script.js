const avatarEl = document.getElementById('avatar');
const displayNameEl = document.getElementById('displayName');
const usernameEl = document.getElementById('username');
const linksEl = document.getElementById('links');
const updatedAtEl = document.getElementById('updatedAt');
const bgEl = document.getElementById('bg');

function renderLinks(links = []) {
  linksEl.innerHTML = '';

  for (const link of links) {
    const a = document.createElement('a');
    a.className = 'link';
    a.href = link.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.innerHTML = `<span>${link.icon || '🔗'}</span><span>${link.label || 'Link'}</span>`;
    linksEl.appendChild(a);
  }
}

async function loadProfile() {
  try {
    const res = await fetch('/api/profile', { cache: 'no-store' });
    if (!res.ok) throw new Error('Falha ao buscar perfil');
    const data = await res.json();

    avatarEl.src = data.avatarUrl;
    avatarEl.alt = data.username || 'Avatar';

    displayNameEl.textContent = data.globalName || data.username || 'Perfil';
    usernameEl.textContent = `@${data.username || 'usuario'}`;

    if (data.bannerUrl) {
      bgEl.style.backgroundImage = `
        linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.68)),
        url('${data.bannerUrl}')
      `;
      bgEl.style.backgroundSize = 'cover';
      bgEl.style.backgroundPosition = 'center';
    }

    renderLinks(data.links || []);

    updatedAtEl.textContent = `Última atualização: ${new Date().toLocaleTimeString('pt-BR')}`;
  } catch (error) {
    console.error(error);
    updatedAtEl.textContent = 'Erro ao atualizar perfil';
  }
}

// Carrega ao abrir
loadProfile();

// Atualiza automaticamente a cada 30s
setInterval(loadProfile, 30000);
