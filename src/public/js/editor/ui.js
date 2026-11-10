// Editor do Estúdio PADAP — Menus suspensos, janelas (modal), paleta e grade de layouts. Sem estado do editor.
// Parte de editor.js (núcleo): estado, palco e comandos ficam lá.
import { mountThumb } from '../render.js';
import { FUNDOS_LAYOUT_ORDER, LAYOUTS, LAYOUT_ORDER, PADAP_LAYOUT_ORDER } from '../templates.js';
import { ICONS } from '/js/icons.js';

export const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n]}</svg>`;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const PALETTE = ['#072B35', '#0F4C4F', '#1DBD2C', '#169A23', '#BFEFC5', '#E8F8EA', '#FFFFFF', '#F3F7F8', '#C7D3D7', '#5A6E76', '#0B2530', '#000000'];
// ============================================================================
// Menus suspensos e janelas
// ============================================================================

let menuEl = null;
export function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}
document.addEventListener('pointerdown', (e) => {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-cmd]')) closeMenu();
});

export function showMenu(anchor, build) {
  if (menuEl && menuEl._anchor === anchor) return closeMenu();
  closeMenu();
  const m = document.createElement('div');
  m.className = 'menu';
  m.setAttribute('role', 'menu');
  m._anchor = anchor;
  // Não roubar o foco do texto em edição (mantém a seleção).
  m.addEventListener('mousedown', (e) => {
    if (!e.target.closest('input, select, textarea')) e.preventDefault();
  });
  build(m);
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mr = m.getBoundingClientRect();
  m.style.left = `${clamp(r.left, 8, window.innerWidth - mr.width - 8)}px`;
  const top = r.bottom + 4;
  m.style.top = `${top + mr.height > window.innerHeight - 8 ? Math.max(8, r.top - mr.height - 4) : top}px`;
  menuEl = m;
  return m;
}

export function mi(m, label, action, { icon, checked, disabled } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `mi${checked ? ' checked' : ''}`;
  b.setAttribute('role', 'menuitem');
  b.disabled = !!disabled;
  b.innerHTML = `${icon ? ic(icon) : ''}<span></span>`;
  b.querySelector('span').textContent = label;
  b.addEventListener('click', () => {
    closeMenu();
    action();
  });
  m.appendChild(b);
}
export const msep = (m) => m.appendChild(Object.assign(document.createElement('div'), { className: 'msep' }));
export const mhead = (m, t) => m.appendChild(Object.assign(document.createElement('div'), { className: 'mhead', textContent: t }));

export function swatches(m, onPick, { none = false, custom = true, current } = {}) {
  const box = document.createElement('div');
  box.className = 'swatches';
  if (none) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'none';
    b.title = 'Sem cor';
    b.addEventListener('click', () => {
      closeMenu();
      onPick('none');
    });
    box.appendChild(b);
  }
  for (const c of PALETTE) {
    const b = document.createElement('button');
    b.type = 'button';
    b.style.background = c;
    b.title = c;
    b.addEventListener('click', () => {
      closeMenu();
      onPick(c);
    });
    box.appendChild(b);
  }
  m.appendChild(box);
  if (custom) {
    const row = document.createElement('label');
    row.className = 'custom-color';
    row.innerHTML = '<input type="color"> Outra cor…';
    const input = row.querySelector('input');
    input.value = current && current.startsWith('#') && current.length === 7 ? current : '#1DBD2C';
    input.addEventListener('change', () => {
      closeMenu();
      onPick(input.value.toUpperCase());
    });
    m.appendChild(row);
  }
}

const layoutCache = {};
export function layoutGrid(m, onPick) {
  for (const [title, keys] of [['Modelos PADAP', PADAP_LAYOUT_ORDER], ['Fundos PADAP', FUNDOS_LAYOUT_ORDER], ['Layouts básicos', LAYOUT_ORDER]]) {
    mhead(m, title);
    layoutSection(m, keys, onPick);
  }
}

function layoutSection(m, keys, onPick) {
  const grid = document.createElement('div');
  grid.className = 'layout-grid';
  for (const key of keys) {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = '<div class="thumb"></div><span></span>';
    b.querySelector('span').textContent = LAYOUTS[key].name;
    layoutCache[key] = layoutCache[key] || LAYOUTS[key].build({});
    mountThumb(b.querySelector('.thumb'), layoutCache[key]);
    b.addEventListener('click', () => {
      closeMenu();
      onPick(key);
    });
    grid.appendChild(b);
  }
  m.appendChild(grid);
}

export function modal(title, { wide = false } = {}) {
  closeMenu();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">
    <header><h2></h2><button class="icon-btn" type="button" data-close aria-label="Fechar">${ic('x')}</button></header>
    <div class="body"></div></div>`;
  bd.querySelector('h2').textContent = title;
  const close = () => bd.remove();
  bd.addEventListener('pointerdown', (e) => e.target === bd && close());
  bd.querySelector('[data-close]').addEventListener('click', close);
  document.body.appendChild(bd);
  return { body: bd.querySelector('.body'), modal: bd.querySelector('.modal'), close, root: bd };
}
