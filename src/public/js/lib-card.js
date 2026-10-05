// Cartão de apresentação (Biblioteca e "Continuar de onde parou").
import { ICONS } from '/js/icons.js';
import { mountThumb, fmtDate, api, toast } from './render.js';

const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n]}</svg>`;

export function presCard(p, { team = false, onChange = () => {} } = {}) {
  const card = document.createElement('article');
  card.className = 'lib-card';
  const href = team ? `/apresentar/${p.id}` : `/editor/${p.id}`;
  card.innerHTML = `
    <a class="open" href="${href}"><div class="thumb"></div>
      <div class="meta"><strong></strong><span></span></div></a>
    <div class="actions"></div>`;
  card.querySelector('strong').textContent = p.title;
  const badges = [p.team_visible ? 'Equipe' : '', p.share_token ? 'Link público' : ''].filter(Boolean);
  card.querySelector('strong').insertAdjacentHTML('beforeend', badges.map((b) => `<span class="badge">${b}</span>`).join(''));
  const who = team ? `${p.owner_name} · ` : '';
  card.querySelector('.meta span').textContent = `${who}${p.slideCount} slide${p.slideCount === 1 ? '' : 's'} · ${fmtDate(p.updated_at)}`;
  if (p.firstSlide) mountThumb(card.querySelector('.thumb'), p.firstSlide);

  const actions = card.querySelector('.actions');
  const btn = (label, icon, fn, cls = '') => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-sm ${cls}`;
    b.innerHTML = `${ic(icon)} ${label}`;
    b.addEventListener('click', fn);
    actions.appendChild(b);
  };

  if (team) {
    btn('Apresentar', 'play', () => (location.href = `/apresentar/${p.id}`));
    btn('Fazer uma cópia', 'copy', async () => {
      const { id } = await api('POST', `/api/presentations/${p.id}/copy`, {});
      location.href = `/editor/${id}`;
    });
    return card;
  }
  btn('Abrir', 'edit', () => (location.href = href));
  btn('Renomear', 'textBox', async () => {
    const title = prompt('Novo nome da apresentação:', p.title);
    if (!title || title === p.title) return;
    try {
      await api('PUT', `/api/presentations/${p.id}`, { title });
      p.title = title;
      onChange();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  btn('Duplicar', 'copy', async () => {
    try {
      await api('POST', `/api/presentations/${p.id}/copy`, {});
      location.reload();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  btn('Excluir', 'trash', async () => {
    if (!confirm(`Excluir "${p.title}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api('DELETE', `/api/presentations/${p.id}`);
      card.remove();
      toast('Apresentação excluída.');
    } catch (e) {
      toast(e.message, 'error');
    }
  }, 'btn-danger');
  return card;
}
