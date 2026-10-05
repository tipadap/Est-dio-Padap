import { readBoot, api, toast } from './render.js';
import { TEMPLATES } from './templates.js';

const boot = readBoot();
const state = { banco: boot.banco, portfolio: boot.portfolio, settings: boot.settings || {}, cat: 'banco' };

const USES = [
  ['login_bg', 'Fundo da tela de login'],
  ['home_banner', 'Banner da Página Inicial'],
  ...TEMPLATES.map((t) => [`tpl:${t.id}`, `Capa do modelo “${t.name}”`]),
];
const useLabel = Object.fromEntries(USES);

const grid = document.getElementById('assets');

function draw() {
  const list = state[state.cat];
  grid.replaceChildren();
  if (!list.length) {
    grid.innerHTML = '<div class="empty" style="grid-column:1/-1">Nenhuma imagem enviada ainda.</div>';
    return;
  }
  for (const a of list) {
    const card = document.createElement('div');
    card.className = 'asset';
    const usedFor = Object.entries(state.settings).filter(([, v]) => v === a.url).map(([k]) => k);
    card.innerHTML = `
      <img loading="lazy" alt="">
      <div class="body">
        <input class="text-input" aria-label="Título da imagem">
        <div class="tags"></div>
        <select class="text-input" aria-label="Usar esta imagem como"><option value="">Usar como…</option></select>
        <button class="btn btn-sm btn-danger" type="button">Excluir</button>
      </div>`;
    card.querySelector('img').src = a.url;
    const title = card.querySelector('input');
    title.value = a.title;
    title.addEventListener('change', async () => {
      try {
        await api('PATCH', `/api/assets/${a.id}`, { title: title.value });
        a.title = title.value;
        toast('Título salvo.');
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    card.querySelector('.tags').innerHTML = usedFor.map((k) => `<span class="badge" title="Clique para remover">✓ ${useLabel[k]}</span>`).join('');
    card.querySelectorAll('.badge').forEach((b, i) =>
      b.addEventListener('click', () => setUse(usedFor[i], null))
    );
    const sel = card.querySelector('select');
    for (const [k, label] of USES) sel.add(new Option(label, k));
    sel.addEventListener('change', () => sel.value && setUse(sel.value, a.url));
    card.querySelector('.btn-danger').addEventListener('click', async () => {
      if (!confirm('Excluir esta imagem? Apresentações que a usam mostrarão um espaço vazio.')) return;
      try {
        await api('DELETE', `/api/assets/${a.id}`);
        state[state.cat] = state[state.cat].filter((x) => x.id !== a.id);
        Object.keys(state.settings).forEach((k) => state.settings[k] === a.url && delete state.settings[k]);
        draw();
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    grid.appendChild(card);
  }
}

async function setUse(key, value) {
  try {
    const res = await api('POST', '/api/settings', { key, value });
    state.settings = res.settings;
    toast(value ? `Definida como: ${useLabel[key]}.` : 'Uso removido.');
    draw();
  } catch (e) {
    toast(e.message, 'error');
  }
}

document.querySelectorAll('.tab').forEach((b) =>
  b.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === b));
    state.cat = b.dataset.cat;
    draw();
  })
);

const form = document.getElementById('upload-form');
const status = document.getElementById('upload-status');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const files = [...form.image.files];
  const category = form.category.value;
  let ok = 0;
  for (const [i, file] of files.entries()) {
    status.textContent = `Enviando ${i + 1} de ${files.length}…`;
    const fd = new FormData();
    fd.append('category', category);
    fd.append('title', files.length === 1 && form.title.value ? form.title.value : file.name);
    fd.append('image', file);
    try {
      const { asset } = await api('POST', '/api/assets', fd);
      state[category].unshift(asset);
      ok += 1;
    } catch (err) {
      toast(`${file.name}: ${err.message}`, 'error');
    }
  }
  status.textContent = ok ? `${ok} imagem(ns) enviada(s).` : '';
  form.reset();
  form.category.value = category;
  document.querySelector(`.tab[data-cat="${category}"]`).click();
});

draw();
