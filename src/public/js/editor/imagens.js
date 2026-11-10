// Editor do Estúdio PADAP — Seletor de imagens (Banco de imagens, Portfólio, Minhas imagens).
// Parte de editor.js (núcleo): estado, palco e comandos ficam lá.
import { api, toast } from '../render.js';
import { $, boot, insertImage } from '../editor.js';
import { ic, modal } from './ui.js';

// ---- Seletor de imagens (Banco, Portfólio, Minhas imagens) ------------------

const PICKER_TABS = [
  ['banco', 'Banco de imagens'],
  ['portfolio', 'Portfólio'],
  ['user', 'Minhas imagens'],
];

export function openPicker(category, onPick = insertImage) {
  const m = modal('Inserir imagem', { wide: true });
  m.body.innerHTML = `<div class="picker-tabs"></div><div class="picker-filters" hidden></div><div class="picker-grid"></div>`;
  const filters = m.body.querySelector('.picker-filters');
  filters.innerHTML = `
    <select class="text-input" data-f="kind" aria-label="Tipo"><option value="">Tudo</option><option value="produto">Produtos</option><option value="logo">Logos das marcas</option><option value="pagina">Páginas do portfólio</option></select>
    <select class="text-input" data-f="brand" aria-label="Marca"><option value="">Todas as marcas</option></select>
    <label class="check"><input type="checkbox" data-f="withText" checked> Inserir produto com nome e descrição</label>
    <select class="text-input" data-f="theme" aria-label="Tema"><option value="">Todos os temas</option></select>`;
  const fKind = filters.querySelector('[data-f=kind]');
  const fBrand = filters.querySelector('[data-f=brand]');
  const fText = filters.querySelector('[data-f=withText]');
  fKind.addEventListener('change', () => draw());
  fBrand.addEventListener('change', () => draw());
  const fTheme = filters.querySelector('[data-f=theme]');
  fTheme.addEventListener('change', () => draw());
  const tabs = m.body.querySelector('.picker-tabs');
  const grid = m.body.querySelector('.picker-grid');
  let cat = category;
  let items = [];

  const search = document.createElement('input');
  search.className = 'text-input';
  search.type = 'search';
  search.placeholder = 'Buscar…';
  search.style.cssText = 'max-width:220px;height:36px;margin-left:auto';
  const upload = document.createElement('button');
  upload.type = 'button';
  upload.className = 'btn btn-sm btn-primary';
  upload.innerHTML = `${ic('upload')} Enviar do computador`;

  function drawTabs() {
    tabs.replaceChildren();
    for (const [k, label] of PICKER_TABS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn btn-sm${k === cat ? ' btn-dark' : ''}`;
      b.textContent = label;
      b.addEventListener('click', () => {
        cat = k;
        load();
      });
      tabs.appendChild(b);
    }
    tabs.append(search, upload);
    upload.hidden = cat !== 'user' && !boot.isAdmin;
  }

  function draw() {
    const q = search.value.trim().toLowerCase();
    grid.replaceChildren();
    const isPf = cat === 'portfolio';
    const themes = cat === 'banco' && items.some((a) => a.theme);
    filters.hidden = !isPf && !themes;
    [fKind, fBrand, fText.parentElement].forEach((el) => (el.hidden = !isPf));
    fTheme.hidden = !themes;
    grid.classList.toggle('contain', isPf);
    const list = items.filter(
      (a) =>
        (!q || `${a.title} ${a.description || ''}`.toLowerCase().includes(q)) &&
        (!isPf || !fKind.value || (a.kind || 'produto') === fKind.value) &&
        (!isPf || !fBrand.value || a.brand === fBrand.value) &&
        (!themes || !fTheme.value || a.theme === fTheme.value)
    );
    if (!list.length) {
      const msg =
        cat === 'user'
          ? 'Você ainda não enviou imagens. Use “Enviar do computador”.'
          : `Nenhuma imagem no ${cat === 'banco' ? 'Banco de imagens' : 'Portfólio'} ainda.${boot.isAdmin ? ' Envie pelo botão ao lado ou pelo menu Imagens.' : ' Peça ao administrador para enviar.'}`;
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1">${msg}</div>`;
      return;
    }
    for (const a of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = '<img loading="lazy" alt=""><span></span>';
      b.querySelector('img').src = a.thumb || a.url;
      b.querySelector('span').textContent = a.title || 'Sem título';
      if (a.description) b.title = `${a.name}: ${a.description}`;
      b.addEventListener('click', () => {
        m.close();
        onPick(a.url, a, cat === 'portfolio' && fText.checked);
      });
      grid.appendChild(b);
    }
  }

  async function load() {
    drawTabs();
    grid.innerHTML = '<div class="muted">Carregando…</div>';
    try {
      items = (await api('GET', `/api/assets?category=${cat}`)).assets;
      const brands = [...new Set(items.map((a) => a.brand).filter(Boolean))].sort((x, y) => x.localeCompare(y, 'pt-BR'));
      fBrand.replaceChildren(new Option('Todas as marcas', ''), ...brands.map((b) => new Option(b, b)));
      const themes = [...new Set(items.map((a) => a.theme).filter(Boolean))];
      fTheme.replaceChildren(new Option('Todos os temas', ''), ...themes.map((t) => new Option(t, t)));
    } catch (e) {
      items = [];
      toast(e.message, 'error');
    }
    draw();
  }

  search.addEventListener('input', draw);
  upload.addEventListener('click', () => {
    const input = $('#file-input');
    input.value = '';
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      const fd = new FormData();
      fd.append('category', cat);
      fd.append('title', file.name);
      fd.append('image', file);
      upload.disabled = true;
      upload.textContent = 'Enviando…';
      try {
        const { asset } = await api('POST', '/api/assets', fd);
        m.close();
        onPick(asset.url);
      } catch (e) {
        toast(e.message, 'error');
        upload.disabled = false;
        upload.innerHTML = `${ic('upload')} Enviar do computador`;
      }
    };
    input.click();
  });
  load();
}
