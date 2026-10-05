import { readBoot, mountThumb, api, toast } from './render.js';
import { TEMPLATES, buildPresentation } from './templates.js';
import { presCard } from './lib-card.js';

const boot = readBoot();
const photos = boot.templatePhotos || {};

async function create(templateId) {
  try {
    const { title, data } = buildPresentation(templateId, photos);
    const { id } = await api('POST', '/api/presentations', { title, data });
    location.href = `/editor/${id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

document.getElementById('novo').addEventListener('click', () => create('branco'));

const grid = document.getElementById('templates');
for (const t of TEMPLATES) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'tpl-card';
  card.innerHTML = '<div class="thumb"></div><div class="meta"><strong></strong><span></span></div>';
  card.querySelector('strong').textContent = t.name;
  card.querySelector('span').textContent = `${t.tagline} · ${t.build('').length} slides`;
  card.setAttribute('aria-label', `Criar a partir do modelo ${t.name}`);
  mountThumb(card.querySelector('.thumb'), t.build(photos[t.id] || '')[0]);
  card.addEventListener('click', () => create(t.id));
  grid.appendChild(card);
}

if (boot.recent && boot.recent.length) {
  document.getElementById('recent-wrap').hidden = false;
  const recent = document.getElementById('recent');
  boot.recent.forEach((p) => recent.appendChild(presCard(p)));
}

if (location.hash === '#novo') document.getElementById('novo').focus();
