// Editor de apresentações do Estúdio PADAP.
import { ICONS } from '/js/icons.js';
import { W, H, BRAND, uid, renderSlide, renderElement, mountThumb, readBoot, api, toast, hasText, shapeSvg, fmtDate } from './render.js';
import { LAYOUTS, LAYOUT_ORDER, PADAP_LAYOUT_ORDER, buildPresentation } from './templates.js';
import { present } from './present.js';
import { exportPptx } from './pptx.js';
import { exportPdf } from './pdf.js';

const boot = readBoot();
// Rascunho (/editor/novo): monta o modelo aqui; só vira registro no primeiro salvamento.
if (!boot.id) Object.assign(boot, buildPresentation(boot.template || 'branco', boot.templatePhotos || {}));
const pres = { id: boot.id, title: boot.title, data: boot.data };
// sel = elemento selecionado (um); group = ids quando há vários selecionados (sel fica null)
const S = { cur: 0, sel: null, group: [], editing: null, zoom: 'fit', view: 'normal', lang: 'pt-BR', clipboard: null };

const $ = (s) => document.querySelector(s);
const ic = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n]}</svg>`;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const stage = $('#stage');
const scroller = $('#stage-scroll');
const panel = $('#slides');

const slides = () => pres.data.slides;
const curSlide = () => slides()[S.cur];
const findEl = (id) => curSlide().elements.find((e) => e.id === id);
const selEl = () => (S.sel ? findEl(S.sel) : null);
const groupEls = () => S.group.map(findEl).filter(Boolean);
/** Elementos selecionados (um ou vários). */
const selection = () => (S.group.length ? groupEls() : selEl() ? [selEl()] : []);
const nodeOf = (id) => stage.querySelector(`.el[data-id="${CSS.escape(id)}"]`);
const clone = (o) => JSON.parse(JSON.stringify(o));

const PALETTE = ['#072B35', '#0F4C4F', '#1DBD2C', '#169A23', '#BFEFC5', '#E8F8EA', '#FFFFFF', '#F3F7F8', '#C7D3D7', '#5A6E76', '#0B2530', '#000000'];

// ============================================================================
// Histórico (desfazer/refazer) e salvamento automático
// ============================================================================

let lastSnap = JSON.stringify(slides());
const undoStack = [];
const redoStack = [];

function commit() {
  const s = JSON.stringify(slides());
  if (s === lastSnap) return;
  undoStack.push({ s: lastSnap, cur: S.cur });
  if (undoStack.length > 150) undoStack.shift();
  redoStack.length = 0;
  lastSnap = s;
  scheduleSave();
  refreshThumb(S.cur);
  updateUndoButtons();
}

function restore(st) {
  lastSnap = st.s;
  pres.data.slides = JSON.parse(st.s);
  S.cur = clamp(st.cur, 0, slides().length - 1);
  S.sel = null;
  S.group = [];
  renderAll();
  scheduleSave();
  updateUndoButtons();
}

function undo() {
  exitEdit();
  if (!undoStack.length) return;
  redoStack.push({ s: lastSnap, cur: S.cur });
  restore(undoStack.pop());
}

function redo() {
  exitEdit();
  if (!redoStack.length) return;
  undoStack.push({ s: lastSnap, cur: S.cur });
  restore(redoStack.pop());
}

function updateUndoButtons() {
  document.querySelector('[data-cmd="undo"]').disabled = !undoStack.length;
  document.querySelector('[data-cmd="redo"]').disabled = !redoStack.length;
}

let saveTimer;
let saving = false;
let pending = false;
const statusEl = $('#save-status');

function setStatus(msg, err = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('err', err);
}

function scheduleSave(delay = 900) {
  pending = true;
  setStatus('Alterações não salvas');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, delay);
}

async function save() {
  if (saving) {
    saveTimer = setTimeout(save, 400);
    return;
  }
  if (!pending) return;
  saving = true;
  pending = false;
  setStatus('Salvando…');
  try {
    if (!pres.id) {
      // primeira edição do rascunho: cria a apresentação e passa a usar o endereço dela
      const { id } = await api('POST', '/api/presentations', { title: pres.title, data: pres.data });
      pres.id = id;
      boot.id = id;
      history.replaceState(null, '', `/editor/${id}`);
      document.title = `${pres.title} · Estúdio PADAP`;
    } else {
      await api('PUT', `/api/presentations/${pres.id}`, { title: pres.title, data: pres.data });
    }
    setStatus(pending ? 'Alterações não salvas' : 'Todas as alterações foram salvas');
  } catch (e) {
    pending = true;
    setStatus('Erro ao salvar — tentando de novo', true);
    toast(e.message, 'error');
    saveTimer = setTimeout(save, 5000);
  } finally {
    saving = false;
  }
}

/** Garante que a apresentação exista no banco (rascunho é salvo antes de compartilhar/imprimir). */
async function ensureSaved() {
  if (!pres.id) pending = true;
  await flush();
  return !!pres.id;
}

async function flush() {
  if (S.editing) exitEdit();
  clearTimeout(saveTimer);
  while (saving) await new Promise((r) => setTimeout(r, 100));
  if (pending) await save();
  return !pending;
}

window.addEventListener('beforeunload', (e) => {
  if (pending || saving) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// ============================================================================
// Renderização
// ============================================================================

function zoom() {
  if (S.zoom !== 'fit') return S.zoom;
  const w = scroller.clientWidth - 68;
  const h = scroller.clientHeight - 68;
  return clamp(Math.min(w / W, h / H), 0.1, 1.5);
}

function applyZoom() {
  const z = zoom();
  stage.style.width = `${W * z}px`;
  stage.style.height = `${H * z}px`;
  const sl = stage.querySelector('.slide');
  if (sl) sl.style.transform = `scale(${z})`;
  $('#zoom').value = Math.round(z * 100);
  drawSelection();
}

function renderStage() {
  const node = renderSlide(curSlide(), { editing: true });
  node.lang = S.lang;
  stage.replaceChildren(node);
  for (const el of curSlide().elements) if (el.type === 'text' && !hasText(el.html)) nodeOf(el.id)?.classList.add('hint');
  applyZoom();
  $('#notes-text').value = curSlide().notes || '';
  syncToolbar();
}

function rerenderEl(el) {
  const old = nodeOf(el.id);
  if (!old) return;
  const fresh = renderElement(el, { editing: true });
  if (el.type === 'text' && !hasText(el.html)) fresh.classList.add('hint');
  old.replaceWith(fresh);
  drawSelection();
}

function drawSelection() {
  stage.querySelectorAll('.sel-box').forEach((b) => b.remove());
  const z = zoom();
  if (S.group.length) {
    const els = groupEls();
    for (const g of els) {
      const b = document.createElement('div');
      b.className = 'sel-box multi';
      Object.assign(b.style, { left: `${g.x * z}px`, top: `${g.y * z}px`, width: `${g.w * z}px`, height: `${g.h * z}px` });
      stage.appendChild(b);
    }
    const bb = bbox(els);
    const b = document.createElement('div');
    b.className = 'sel-box group';
    Object.assign(b.style, { left: `${bb.x * z - 6}px`, top: `${bb.y * z - 6}px`, width: `${bb.w * z + 12}px`, height: `${bb.h * z + 12}px` });
    stage.appendChild(b);
    return;
  }
  const el = selEl();
  if (!el) return;
  const box = document.createElement('div');
  box.className = `sel-box${S.editing ? ' editing' : ''}`;
  Object.assign(box.style, { left: `${el.x * z}px`, top: `${el.y * z}px`, width: `${el.w * z}px`, height: `${el.h * z}px` });
  for (const h of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    const d = document.createElement('div');
    d.className = `h h-${h}`;
    d.dataset.h = h;
    box.appendChild(d);
  }
  stage.appendChild(box);
}

function renderPanel() {
  panel.replaceChildren();
  slides().forEach((s, i) => {
    const item = document.createElement('div');
    item.className = `sthumb${i === S.cur ? ' active' : ''}`;
    item.draggable = true;
    item.dataset.i = i;
    item.tabIndex = 0;
    item.setAttribute('aria-label', `Slide ${i + 1}`);
    item.innerHTML = `<span class="num">${i + 1}</span><div class="thumb"></div>
      <div class="tools"><button type="button" data-t="dup" title="Duplicar slide">${ic('copy')}</button>
      <button type="button" data-t="del" title="Excluir slide">${ic('trash')}</button></div>`;
    mountThumb(item.querySelector('.thumb'), s);
    panel.appendChild(item);
  });
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'add-slide';
  add.title = 'Adicionar slide';
  add.innerHTML = ic('plus');
  add.addEventListener('click', () => addSlide());
  panel.appendChild(add);
  panel.querySelector('.sthumb.active')?.scrollIntoView({ block: 'nearest' });
}

function refreshThumb(i) {
  const item = panel.querySelector(`.sthumb[data-i="${i}"] .thumb`);
  if (item && slides()[i]) mountThumb(item, slides()[i]);
}
let thumbTimer;
const thumbSoon = () => {
  clearTimeout(thumbTimer);
  thumbTimer = setTimeout(() => refreshThumb(S.cur), 400);
};

function renderSorter() {
  const box = $('#sorter');
  box.replaceChildren();
  slides().forEach((s, i) => {
    const item = document.createElement('div');
    item.className = `item${i === S.cur ? ' active' : ''}`;
    item.innerHTML = `<div class="thumb"></div><span>${i + 1}</span>`;
    mountThumb(item.querySelector('.thumb'), s);
    item.addEventListener('click', () => {
      selectSlide(i);
      setView('normal');
    });
    box.appendChild(item);
  });
}

function updateStatus() {
  $('#slide-count').textContent = `Slide ${S.cur + 1} de ${slides().length}`;
}

function renderAll() {
  renderPanel();
  renderStage();
  updateStatus();
  if (S.view === 'sorter') renderSorter();
}

// ============================================================================
// Seleção, mover, redimensionar
// ============================================================================

function bbox(els) {
  const x = Math.min(...els.map((g) => g.x));
  const y = Math.min(...els.map((g) => g.y));
  return { x, y, w: Math.max(...els.map((g) => g.x + g.w)) - x, h: Math.max(...els.map((g) => g.y + g.h)) - y };
}

/** Seleciona vários (1 id = seleção simples; 0 = nada). */
function setGroup(ids) {
  if (S.editing) exitEdit();
  const uniq = [...new Set(ids)].filter((id) => findEl(id));
  S.group = uniq.length > 1 ? uniq : [];
  S.sel = uniq.length === 1 ? uniq[0] : null;
  drawSelection();
  syncToolbar();
}

function select(id) {
  if (S.sel === id && !S.group.length) return;
  S.group = [];
  if (S.editing && S.editing !== id) exitEdit();
  S.sel = id;
  drawSelection();
  syncToolbar();
}

function selectSlide(i) {
  exitEdit();
  S.cur = clamp(i, 0, slides().length - 1);
  S.sel = null;
  S.group = [];
  panel.querySelectorAll('.sthumb').forEach((n) => n.classList.toggle('active', Number(n.dataset.i) === S.cur));
  panel.querySelector('.sthumb.active')?.scrollIntoView({ block: 'nearest' });
  renderStage();
  updateStatus();
}

function clearGuides() {
  stage.querySelectorAll('.guide').forEach((g) => g.remove());
}

function guide(kind, pos) {
  const g = document.createElement('div');
  g.className = `guide ${kind}`;
  g.style[kind === 'v' ? 'left' : 'top'] = `${pos * zoom()}px`;
  stage.appendChild(g);
}

/** Encaixe nas bordas/centro do slide e dos outros elementos. */
function snapPos(el, x, y) {
  clearGuides();
  const th = 8 / zoom();
  const others = curSlide().elements.filter((o) => o.id !== el.id && !o.locked);
  const tx = [0, W / 2, W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
  const ty = [0, H / 2, H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
  const best = (pos, size, targets) => {
    let r = null;
    for (const off of [0, size / 2, size]) {
      for (const t of targets) {
        const d = Math.abs(pos + off - t);
        if (d < th && (!r || d < r.d)) r = { d, v: t - off, t };
      }
    }
    return r;
  };
  const bx = best(x, el.w, tx);
  const by = best(y, el.h, ty);
  if (bx) guide('v', bx.t);
  if (by) guide('h', by.t);
  return { x: bx ? bx.v : x, y: by ? by.v : y };
}

function startMove(e, id, wasSelected) {
  const el = findEl(id);
  const sx = e.clientX;
  const sy = e.clientY;
  const ox = el.x;
  const oy = el.y;
  const z = zoom();
  const node = nodeOf(id);
  let moved = false;
  const move = (ev) => {
    const dx = (ev.clientX - sx) / z;
    const dy = (ev.clientY - sy) / z;
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    moved = true;
    let p = { x: ox + dx, y: oy + dy };
    if (!ev.altKey) p = snapPos(el, p.x, p.y);
    el.x = Math.round(p.x);
    el.y = Math.round(p.y);
    node.style.left = `${el.x}px`;
    node.style.top = `${el.y}px`;
    drawSelection();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    clearGuides();
    if (moved) commit();
    else if (wasSelected && el.type === 'text') enterEdit(id, true);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startGroupMove(e) {
  const els = groupEls();
  const orig = els.map((g) => ({ g, x: g.x, y: g.y }));
  const sx = e.clientX;
  const sy = e.clientY;
  const z = zoom();
  let moved = false;
  const move = (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
    moved = true;
    const dx = Math.round((ev.clientX - sx) / z);
    const dy = Math.round((ev.clientY - sy) / z);
    for (const o of orig) {
      o.g.x = o.x + dx;
      o.g.y = o.y + dy;
      const n = nodeOf(o.g.id);
      n.style.left = `${o.g.x}px`;
      n.style.top = `${o.g.y}px`;
    }
    drawSelection();
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    if (moved) commit();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

/** Retângulo de seleção: arrastar numa área vazia seleciona o que ele tocar. */
function startMarquee(e) {
  const rect = stage.getBoundingClientRect();
  const z = zoom();
  const p0 = { x: (e.clientX - rect.left) / z, y: (e.clientY - rect.top) / z };
  const base = e.shiftKey ? selection().map((g) => g.id) : [];
  const box = document.createElement('div');
  box.className = 'marquee';
  stage.appendChild(box);
  let r = null;
  const move = (ev) => {
    const p = { x: (ev.clientX - rect.left) / z, y: (ev.clientY - rect.top) / z };
    r = { x: Math.min(p0.x, p.x), y: Math.min(p0.y, p.y), w: Math.abs(p.x - p0.x), h: Math.abs(p.y - p0.y) };
    Object.assign(box.style, { left: `${r.x * z}px`, top: `${r.y * z}px`, width: `${r.w * z}px`, height: `${r.h * z}px` });
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    box.remove();
    if (!r || r.w * z < 4 || r.h * z < 4) {
      if (!e.shiftKey) select(null);
      return;
    }
    const hit = curSlide().elements.filter((g) => !g.locked && g.x < r.x + r.w && g.x + g.w > r.x && g.y < r.y + r.h && g.y + g.h > r.y);
    setGroup([...base, ...hit.map((g) => g.id)]);
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function startResize(e, dir) {
  e.preventDefault();
  e.stopPropagation();
  const el = selEl();
  if (!el) return;
  const z = zoom();
  const sx = e.clientX;
  const sy = e.clientY;
  const o = { x: el.x, y: el.y, w: el.w, h: el.h };
  const ratio = o.w / o.h;
  const corner = dir.length === 2;
  const move = (ev) => {
    const dx = (ev.clientX - sx) / z;
    const dy = (ev.clientY - sy) / z;
    let { x, y, w, h } = o;
    if (dir.includes('e')) w = o.w + dx;
    if (dir.includes('w')) {
      w = o.w - dx;
      x = o.x + dx;
    }
    if (dir.includes('s')) h = o.h + dy;
    if (dir.includes('n')) {
      h = o.h - dy;
      y = o.y + dy;
    }
    if (w < 10) {
      if (dir.includes('w')) x -= 10 - w;
      w = 10;
    }
    if (h < 4) {
      if (dir.includes('n')) y -= 4 - h;
      h = 4;
    }
    const keep = corner && (ev.shiftKey || (el.type === 'image' && el.src) || el.shape === 'symbol' || el.shape === 'symbolOutline');
    if (keep) {
      if (w / h > ratio) {
        const nh = w / ratio;
        if (dir.includes('n')) y -= nh - h;
        h = nh;
      } else {
        const nw = h * ratio;
        if (dir.includes('w')) x -= nw - w;
        w = nw;
      }
    }
    Object.assign(el, { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    rerenderEl(el);
  };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    commit();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

stage.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  const h = e.target.closest('.h');
  if (h) return startResize(e, h.dataset.h);
  const node = e.target.closest('.el');
  if (S.editing && node && node.dataset.id === S.editing) return; // cursor de texto
  if (S.editing) exitEdit();
  e.preventDefault();
  if (!node) return startMarquee(e);
  const id = node.dataset.id;
  if (e.shiftKey) {
    // Shift + clique: adiciona/remove da seleção
    const cur = selection().map((g) => g.id);
    setGroup(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]);
    return undefined;
  }
  if (S.group.includes(id)) return startGroupMove(e);
  const was = S.sel === id;
  select(id);
  startMove(e, id, was);
  return undefined;
});

scroller.addEventListener('pointerdown', (e) => {
  if (e.target === scroller) {
    exitEdit();
    select(null);
  }
});

stage.addEventListener('dblclick', (e) => {
  const node = e.target.closest('.el');
  if (!node) return;
  const el = findEl(node.dataset.id);
  if (el.type === 'text') enterEdit(el.id, true);
  else if (el.type === 'image') openPicker('banco', (url) => setImage(el, url));
  else if (el.type === 'chart') openChartEditor(el);
  else if (el.type === 'table') openTableEditor(el);
});

new ResizeObserver(() => S.zoom === 'fit' && applyZoom()).observe(scroller);

// ============================================================================
// Edição de texto
// ============================================================================

let savedRange = null;

function txtNode() {
  return S.editing ? nodeOf(S.editing)?.querySelector('.txt') : null;
}

function enterEdit(id, keepCaret = false) {
  const el = findEl(id);
  if (!el || el.type !== 'text') return;
  if (S.editing === id) return;
  exitEdit();
  S.sel = id;
  S.editing = id;
  const node = nodeOf(id);
  node.classList.add('editing');
  node.classList.remove('hint');
  const txt = node.querySelector('.txt');
  txt.contentEditable = 'true';
  txt.spellcheck = true;
  txt.lang = S.lang;
  txt.focus();
  const sel = getSelection();
  if (!keepCaret || !sel.rangeCount || !txt.contains(sel.anchorNode)) {
    const r = document.createRange();
    r.selectNodeContents(txt);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
  }
  txt.addEventListener('input', onTextInput);
  txt.addEventListener('paste', onPaste);
  drawSelection();
}

function onTextInput() {
  const el = findEl(S.editing);
  if (el) el.html = txtNode().innerHTML;
  scheduleSave(1500);
  thumbSoon();
}

// Colar sempre como texto simples (evita trazer estilos de outros programas).
function onPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

function exitEdit() {
  if (!S.editing) return;
  const id = S.editing;
  const el = findEl(id);
  const node = nodeOf(id);
  S.editing = null;
  savedRange = null;
  if (node && el) {
    const txt = node.querySelector('.txt');
    txt.removeEventListener('input', onTextInput);
    txt.removeEventListener('paste', onPaste);
    txt.contentEditable = 'false';
    node.classList.remove('editing');
    el.html = hasText(txt.innerHTML) ? txt.innerHTML : '';
    if (!el.html) {
      txt.innerHTML = '';
      node.classList.add('hint');
    }
  }
  getSelection()?.removeAllRanges();
  drawSelection();
  commit();
}

document.addEventListener('selectionchange', () => {
  const txt = txtNode();
  const s = getSelection();
  if (txt && s.rangeCount && txt.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange();
});

function restoreRange() {
  const txt = txtNode();
  if (!txt) return false;
  txt.focus();
  if (savedRange) {
    const s = getSelection();
    s.removeAllRanges();
    s.addRange(savedRange);
  }
  return true;
}

const hasRangeSelection = () => S.editing && savedRange && !savedRange.collapsed;

/**
 * Executa um comando de formatação. Editando: vale para o trecho selecionado.
 * Só com a caixa selecionada: vale para o texto inteiro.
 */
function formatText(fn) {
  const el = selEl();
  if (!el || el.type !== 'text') return false;
  if (S.editing) {
    restoreRange();
    fn();
    findEl(S.editing).html = txtNode().innerHTML;
    scheduleSave(1200);
    thumbSoon();
    return true;
  }
  const node = nodeOf(el.id);
  const txt = node.querySelector('.txt');
  txt.contentEditable = 'true';
  txt.focus();
  const r = document.createRange();
  r.selectNodeContents(txt);
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(r);
  fn();
  el.html = txt.innerHTML;
  txt.contentEditable = 'false';
  s.removeAllRanges();
  commit();
  return true;
}

function exec(cmd, val = null, css = true) {
  document.execCommand('styleWithCSS', false, css);
  document.execCommand(cmd, false, val);
}

/** Troca <font size=7>/<font face> gerados pelo execCommand por <span style>. */
function spanify(selector, prop, value) {
  const txt = txtNode();
  txt.querySelectorAll(selector).forEach((f) => {
    const sp = document.createElement('span');
    sp.style[prop] = value;
    sp.append(...f.childNodes);
    f.replaceWith(sp);
  });
  findEl(S.editing).html = txt.innerHTML;
  scheduleSave(1200);
  thumbSoon();
}

function stripInline(html, props) {
  const d = document.createElement('div');
  d.innerHTML = html;
  d.querySelectorAll('[style]').forEach((n) => {
    props.forEach((p) => n.style.removeProperty(p));
    if (!n.getAttribute('style')) n.removeAttribute('style');
  });
  if (props.includes('color')) d.querySelectorAll('font[color]').forEach((f) => f.removeAttribute('color'));
  if (props.includes('font-family')) d.querySelectorAll('font[face]').forEach((f) => f.removeAttribute('face'));
  if (props.includes('font-size')) d.querySelectorAll('font[size]').forEach((f) => f.removeAttribute('size'));
  return d.innerHTML;
}

function setFontSize(px) {
  const el = selEl();
  if (!el || el.type !== 'text' || !Number.isFinite(px)) return;
  px = clamp(Math.round(px), 6, 400);
  if (hasRangeSelection()) {
    restoreRange();
    exec('fontSize', '7', false);
    spanify('font[size="7"]', 'fontSize', `${px}px`);
    return;
  }
  exitEdit();
  el.style.fontSize = px;
  el.html = stripInline(el.html, ['font-size']);
  rerenderEl(el);
  commit();
  syncToolbar();
}

function setFontFamily(name) {
  const el = selEl();
  if (!el || el.type !== 'text') return;
  if (hasRangeSelection()) {
    restoreRange();
    exec('fontName', name, false);
    spanify('font[face]', 'fontFamily', `'${name}'`);
    return;
  }
  exitEdit();
  el.style.fontFamily = name;
  el.html = stripInline(el.html, ['font-family']);
  rerenderEl(el);
  commit();
}

function toggleInline(cmd) {
  const el = selEl();
  if (!el || el.type !== 'text') return;
  if (!S.editing && !hasText(el.html)) {
    if (cmd === 'bold') {
      el.style.bold = !el.style.bold;
      rerenderEl(el);
      commit();
    }
    return;
  }
  formatText(() => exec(cmd));
}

function setAlign(a) {
  const el = selEl();
  if (!el || el.type !== 'text') return toast('Selecione uma caixa de texto.');
  const editing = S.editing;
  if (editing) exitEdit();
  el.style.align = a;
  el.html = stripInline(el.html, ['text-align']);
  rerenderEl(el);
  commit();
  if (editing) enterEdit(editing);
  return undefined;
}

// ============================================================================
// Cores
// ============================================================================

function applyColor(c) {
  const el = selEl();
  if (!el) {
    curSlide().bg = c;
    renderStage();
    commit();
    return;
  }
  if (el.type === 'text') {
    if (hasRangeSelection()) {
      formatText(() => exec('foreColor', c));
      return;
    }
    exitEdit();
    el.style.color = c;
    el.html = stripInline(el.html, ['color']);
  } else if (el.type === 'shape') {
    el.fill = c;
    delete el.fill2;
    if (el.shape === 'line' || el.shape === 'symbolOutline') el.stroke = c === 'none' ? BRAND.green : c;
  } else return;
  rerenderEl(el);
  commit();
  syncToolbar();
}

function applyStroke(c, width) {
  const el = selEl();
  if (!el || el.type !== 'shape') return;
  if (c !== undefined) el.stroke = c;
  if (width !== undefined) el.strokeWidth = width;
  if (el.stroke !== 'none' && !el.strokeWidth) el.strokeWidth = 4;
  rerenderEl(el);
  commit();
}

function applyHighlight(c) {
  if (!formatText(() => exec('hiliteColor', c))) toast('Selecione um texto.');
}

// ============================================================================
// Elementos: inserir, imagem, ordem
// ============================================================================

function addElement(el, edit = false) {
  exitEdit();
  curSlide().elements.push(el);
  renderStage();
  S.sel = el.id;
  drawSelection();
  commit();
  if (edit) enterEdit(el.id);
}

function addText() {
  addElement(
    {
      id: uid(),
      type: 'text',
      x: 560,
      y: 470,
      w: 800,
      h: 140,
      html: '',
      placeholder: 'Digite seu texto',
      style: { fontFamily: 'Space Grotesk', fontSize: 48, color: BRAND.teal, align: 'left', valign: 'top', lineHeight: 1.25, bold: false },
    },
    true
  );
}

const SHAPES = [
  ['rect', 'Retângulo', 500, 320],
  ['round', 'Retângulo arredondado', 500, 320],
  ['ellipse', 'Elipse', 400, 400],
  ['triangle', 'Triângulo', 400, 360],
  ['leaf', 'Folha PADAP', 420, 420],
  ['leafAlt', 'Folha PADAP (invertida)', 420, 420],
  ['arc', 'Quarto de círculo', 360, 360],
  ['arrow', 'Seta', 500, 200],
  ['line', 'Linha', 600, 12],
  ['symbol', 'Símbolo PADAP', 300, 348],
  ['symbolOutline', 'Símbolo PADAP (contorno)', 300, 348],
];

function addShape(kind) {
  const [, , w, h] = SHAPES.find((s) => s[0] === kind);
  const el = { id: uid(), type: 'shape', shape: kind, x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, fill: BRAND.green, stroke: 'none', strokeWidth: 0 };
  if (kind === 'line') Object.assign(el, { stroke: BRAND.green, strokeWidth: 6 });
  if (kind === 'symbolOutline') Object.assign(el, { stroke: BRAND.green, strokeWidth: 6 });
  addElement(el);
}

function loadSize(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => resolve({ w: 1600, h: 1200 });
    img.src = url;
  });
}

function setImage(el, url) {
  el.src = url;
  rerenderEl(el);
  commit();
}

async function insertImage(url, asset = null, withText = false) {
  const el = selEl();
  if (el && el.type === 'image') return setImage(el, url);
  if (withText && asset && asset.kind === 'produto') return insertProduct(url, asset);
  const nat = await loadSize(url);
  const k = Math.min(1000 / nat.w, 700 / nat.h, 1);
  const w = Math.round(nat.w * k);
  const h = Math.round(nat.h * k);
  addElement({ id: uid(), type: 'image', x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, src: url, mask: 'none', fit: 'cover', placeholder: '' });
  return undefined;
}

/** Produto do portfólio: foto + nome + descrição, centralizados no slide. */
async function insertProduct(url, asset) {
  exitEdit();
  const nat = await loadSize(url);
  const k = Math.min(560 / nat.w, 560 / nat.h);
  const w = Math.round(nat.w * k);
  const h = Math.round(nat.h * k);
  const y = 150;
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  // Texto claro em slide escuro, escuro em slide claro.
  const bg = (curSlide().bg || '#FFFFFF').replace('#', '');
  const lum = (0.299 * parseInt(bg.slice(0, 2), 16) + 0.587 * parseInt(bg.slice(2, 4), 16) + 0.114 * parseInt(bg.slice(4, 6), 16)) / 255;
  const dark = lum < 0.5;
  const img = { id: uid(), type: 'image', x: Math.round((W - w) / 2), y, w, h, src: url, mask: 'none', fit: 'contain', placeholder: '' };
  const name = {
    id: uid(), type: 'text', x: 360, y: y + h + 30, w: 1200, h: 80,
    html: esc(asset.name), placeholder: 'Nome do produto',
    style: { fontFamily: 'Space Grotesk', fontSize: 56, color: dark ? BRAND.white : BRAND.teal, align: 'center', valign: 'top', lineHeight: 1.1, bold: true },
  };
  const desc = {
    id: uid(), type: 'text', x: 410, y: y + h + 115, w: 1100, h: 150,
    html: esc(asset.description || ''), placeholder: 'Descrição do produto',
    style: { fontFamily: 'Space Grotesk', fontSize: 32, color: dark ? BRAND.greenSoft : BRAND.teal2, align: 'center', valign: 'top', lineHeight: 1.35, bold: false },
  };
  curSlide().elements.push(img, name, desc);
  renderStage();
  S.sel = img.id;
  drawSelection();
  commit();
}

// ---- Gráficos e tabelas ------------------------------------------------------

const SERIES_COLORS = ['#1DBD2C', '#0F4C4F', '#9BB7BD', '#F2A33A', '#5BC0EB', '#7D3C98'];

function isDarkBg() {
  const bg = (curSlide().bg || '#FFFFFF').replace('#', '');
  return (0.299 * parseInt(bg.slice(0, 2), 16) + 0.587 * parseInt(bg.slice(2, 4), 16) + 0.114 * parseInt(bg.slice(4, 6), 16)) / 255 < 0.5;
}

function addChart(chartType) {
  const dark = isDarkBg();
  const el = {
    id: uid(), type: 'chart', chartType, x: 360, y: 260, w: 1200, h: 640, title: '',
    categories: ['Safra 23/24', 'Safra 24/25', 'Safra 25/26'],
    series: [
      { name: 'Testemunha', color: dark ? '#9BB7BD' : '#B8C7CB', values: [62, 65, 63] },
      { name: 'Programa PADAP', color: '#1DBD2C', values: [71, 76, 79] },
    ],
    showValues: true, showLegend: true, textColor: dark ? '#FFFFFF' : '#0F252F', gridColor: dark ? '#2C5A5E' : '#D9E2E6',
  };
  addElement(el);
  openChartEditor(el);
}

// ---- Preços e indicadores (Admin > Preços) -----------------------------------

const brl = (v) => (v === null || v === undefined ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const dataBR = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

async function priceRows() {
  const d = await api('GET', '/api/precos');
  if (!d.rows.length) {
    toast('A tabela de preços ainda está vazia. Um administrador pode preenchê-la em Preços.', 'error');
    return null;
  }
  return [['Produto', 'Marca', 'Embalagem', 'Preço (R$)', 'Prazo'], ...d.rows.map((r) => [r.produto, r.marca, r.embalagem, brl(r.preco), r.prazo])];
}

async function addPriceTable() {
  const rows = await priceRows();
  if (!rows) return;
  const h = Math.min(760, 64 * rows.length);
  addElement({
    id: uid(), type: 'table', x: 160, y: 240, w: 1600, h,
    rows, colWidths: [0.3, 0.18, 0.2, 0.18, 0.14], align: ['left', 'left', 'left', 'right', 'center'], header: true, fontSize: 26,
  });
  toast(`Tabela com ${rows.length - 1} produto(s) da tabela de preços.`);
}

async function addMarketIndicators() {
  const d = await api('GET', '/api/precos');
  const m = d.market || {};
  const linhas = [];
  if (d.ptax) linhas.push(`<b>Dólar (PTAX):</b> R$ ${d.ptax.valor.toLocaleString('pt-BR', { minimumFractionDigits: 4 })} <span style="color:#5A6E76">(${dataBR(d.ptax.data)})</span>`);
  if (m.ureia !== null && m.ureia !== undefined) linhas.push(`<b>Ureia:</b> US$ ${brl(m.ureia)}/t`);
  if (m.map !== null && m.map !== undefined) linhas.push(`<b>MAP:</b> US$ ${brl(m.map)}/t`);
  if (m.kcl !== null && m.kcl !== undefined) linhas.push(`<b>KCl:</b> US$ ${brl(m.kcl)}/t`);
  if (!linhas.length) return toast('Sem indicadores cadastrados ainda (Admin > Preços).', 'error');
  const fonte = [m.fonte, m.data ? `ref. ${dataBR(m.data)}` : ''].filter(Boolean).join(' · ');
  const dark = isDarkBg();
  addElement({
    id: uid(), type: 'text', x: 160, y: 300, w: 900, h: 60 * linhas.length + 60,
    html: linhas.map((l) => `<div>${l}</div>`).join('') + (fonte ? `<div style="font-size:20px;color:${dark ? '#9BB7BD' : '#5A6E76'}">Fonte: ${fonte.replace(/</g, '&lt;')}</div>` : ''),
    placeholder: 'Indicadores', style: { fontFamily: 'Space Grotesk', fontSize: 36, color: dark ? '#FFFFFF' : BRAND.teal, align: 'left', valign: 'top', lineHeight: 1.5, bold: false },
  });
  return undefined;
}

function addTable() {
  addElement({
    id: uid(), type: 'table', x: 160, y: 300, w: 1600, h: 420,
    rows: [['Produto', 'Marca', 'Embalagem', 'Preço (R$)'], ['', '', '', ''], ['', '', '', ''], ['', '', '', '']],
    colWidths: [0.34, 0.22, 0.24, 0.2], align: ['left', 'left', 'left', 'right'], header: true, fontSize: 26,
  });
  openTableEditor(selEl());
}

function cellInput(value, onInput, attrs = '') {
  const i = document.createElement('input');
  i.className = 'text-input';
  i.value = value;
  if (attrs) i.setAttribute('inputmode', attrs);
  i.addEventListener('input', () => onInput(i.value));
  return i;
}

function openChartEditor(el) {
  const work = clone(el);
  const m = modal('Dados do gráfico', { wide: true });
  m.body.innerHTML = `<div class="data-opts">
      <label>Tipo <select class="text-input" data-o="type"><option value="bar">Barras</option><option value="line">Linhas</option></select></label>
      <label style="flex:1">Título <input class="text-input" data-o="title" placeholder="(opcional)"></label>
      <label class="check"><input type="checkbox" data-o="values"> Mostrar valores</label>
      <label class="check"><input type="checkbox" data-o="legend"> Mostrar legenda</label>
    </div>
    <div class="data-grid-wrap"><table class="data-grid"></table></div>
    <div class="data-actions">
      <button class="btn btn-sm" type="button" data-a="addCat">+ Categoria (linha)</button>
      <button class="btn btn-sm" type="button" data-a="addSer">+ Série (coluna)</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm" type="button" data-a="cancel">Cancelar</button>
      <button class="btn btn-sm btn-primary" type="button" data-a="ok">Aplicar</button>
    </div>`;
  const q = (s) => m.body.querySelector(s);
  q('[data-o=type]').value = work.chartType;
  q('[data-o=title]').value = work.title || '';
  q('[data-o=values]').checked = work.showValues !== false;
  q('[data-o=legend]').checked = work.showLegend !== false;
  const grid = q('.data-grid');
  const draw = () => {
    grid.replaceChildren();
    const head = grid.insertRow();
    head.insertCell().textContent = 'Categoria';
    work.series.forEach((s, si) => {
      const td = head.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const color = document.createElement('input');
      color.type = 'color';
      color.value = s.color;
      color.addEventListener('input', () => (s.color = color.value.toUpperCase()));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover série';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.series.length > 1) work.series.splice(si, 1);
        draw();
      });
      wrap.append(color, cellInput(s.name, (v) => (s.name = v)), del);
      td.appendChild(wrap);
    });
    work.categories.forEach((c, ci) => {
      const tr = grid.insertRow();
      const td0 = tr.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover categoria';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.categories.length > 1) {
          work.categories.splice(ci, 1);
          work.series.forEach((s) => s.values.splice(ci, 1));
        }
        draw();
      });
      wrap.append(cellInput(c, (v) => (work.categories[ci] = v)), del);
      td0.appendChild(wrap);
      work.series.forEach((s) => {
        tr.insertCell().appendChild(cellInput(String(s.values[ci] ?? 0).replace('.', ','), (v) => (s.values[ci] = Number(v.replace(/\./g, '').replace(',', '.')) || 0), 'decimal'));
      });
    });
  };
  draw();
  m.body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'addCat') {
      work.categories.push(`Item ${work.categories.length + 1}`);
      work.series.forEach((s) => s.values.push(0));
      draw();
    } else if (a === 'addSer') {
      work.series.push({ name: `Série ${work.series.length + 1}`, color: SERIES_COLORS[work.series.length % SERIES_COLORS.length], values: work.categories.map(() => 0) });
      draw();
    } else if (a === 'cancel') m.close();
    else if (a === 'ok') {
      Object.assign(el, work, {
        chartType: q('[data-o=type]').value,
        title: q('[data-o=title]').value.trim(),
        showValues: q('[data-o=values]').checked,
        showLegend: q('[data-o=legend]').checked,
      });
      rerenderEl(el);
      commit();
      m.close();
    }
  });
}

function openTableEditor(el) {
  const work = clone(el);
  const m = modal('Dados da tabela', { wide: true });
  m.body.innerHTML = `<div class="data-opts">
      <label class="check"><input type="checkbox" data-o="header"> 1ª linha é cabeçalho</label>
      <label>Tamanho do texto <input class="text-input" data-o="fs" type="number" min="8" max="120" style="width:90px"></label>
    </div>
    <div class="data-grid-wrap"><table class="data-grid"></table></div>
    <div class="data-actions">
      <button class="btn btn-sm" type="button" data-a="addRow">+ Linha</button>
      <button class="btn btn-sm" type="button" data-a="addCol">+ Coluna</button>
      <button class="btn btn-sm" type="button" data-a="prices">Preencher com a tabela de preços</button>
      <span style="flex:1"></span>
      <button class="btn btn-sm" type="button" data-a="cancel">Cancelar</button>
      <button class="btn btn-sm btn-primary" type="button" data-a="ok">Aplicar</button>
    </div>`;
  const q = (s) => m.body.querySelector(s);
  q('[data-o=header]').checked = work.header !== false;
  q('[data-o=fs]').value = work.fontSize || 24;
  const grid = q('.data-grid');
  const cols = () => Math.max(1, ...work.rows.map((r) => r.length));
  const draw = () => {
    grid.replaceChildren();
    const n = cols();
    work.align = Array.from({ length: n }, (_, i) => (work.align && work.align[i]) || 'left');
    const ctrl = grid.insertRow();
    for (let c = 0; c < n; c++) {
      const td = ctrl.insertCell();
      const wrap = document.createElement('div');
      wrap.className = 'ser-head';
      const sel = document.createElement('select');
      sel.className = 'text-input';
      sel.title = 'Alinhamento da coluna';
      [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']].forEach(([v, t]) => sel.add(new Option(t, v)));
      sel.value = work.align[c];
      sel.addEventListener('change', () => (work.align[c] = sel.value));
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover coluna';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (n > 1) {
          work.rows.forEach((r) => r.splice(c, 1));
          work.align.splice(c, 1);
          if (work.colWidths) {
            work.colWidths.splice(c, 1);
            const t = work.colWidths.reduce((a, b) => a + b, 0);
            work.colWidths = work.colWidths.map((w) => w / t);
          }
        }
        draw();
      });
      wrap.append(sel, del);
      td.appendChild(wrap);
    }
    ctrl.insertCell();
    work.rows.forEach((r, ri) => {
      const tr = grid.insertRow();
      for (let c = 0; c < n; c++) tr.insertCell().appendChild(cellInput(r[c] ?? '', (v) => (r[c] = v)));
      const td = tr.insertCell();
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn';
      del.title = 'Remover linha';
      del.innerHTML = ic('x');
      del.addEventListener('click', () => {
        if (work.rows.length > 1) work.rows.splice(ri, 1);
        draw();
      });
      td.appendChild(del);
    });
  };
  draw();
  m.body.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (a === 'addRow') {
      work.rows.push(Array(cols()).fill(''));
      draw();
    } else if (a === 'prices') {
      priceRows().then((rows) => {
        if (!rows) return;
        work.rows = rows;
        work.colWidths = [0.3, 0.18, 0.2, 0.18, 0.14];
        work.align = ['left', 'left', 'left', 'right', 'center'];
        draw();
      });
    } else if (a === 'addCol') {
      work.rows.forEach((r) => r.push(''));
      if (work.colWidths) {
        const n = work.colWidths.length + 1;
        work.colWidths = [...work.colWidths.map((w) => (w * (n - 1)) / n), 1 / n];
      }
      draw();
    } else if (a === 'cancel') m.close();
    else if (a === 'ok') {
      // cresce/encolhe a altura junto com o número de linhas
      const rowH = el.h / Math.max(1, el.rows.length);
      Object.assign(el, work, { header: q('[data-o=header]').checked, fontSize: Number(q('[data-o=fs]').value) || 24 });
      el.h = Math.round(rowH * el.rows.length);
      rerenderEl(el);
      commit();
      m.close();
    }
  });
}

function deleteSelected() {
  const ids = new Set(selection().map((g) => g.id));
  if (!ids.size) return;
  curSlide().elements = curSlide().elements.filter((g) => !ids.has(g.id));
  S.sel = null;
  S.group = [];
  S.editing = null;
  renderStage();
  commit();
}

function duplicateSelected() {
  pasteElements(selection());
}

/** Insere cópias (deslocadas 30 px) e seleciona as cópias. */
function pasteElements(els) {
  if (!els.length) return;
  exitEdit();
  const copies = els.map((g) => {
    const c = { ...clone(g), id: uid(), x: g.x + 30, y: g.y + 30 };
    delete c.locked;
    return c;
  });
  curSlide().elements.push(...copies);
  renderStage();
  setGroup(copies.map((c) => c.id));
  commit();
  return copies;
}

function reorder(how) {
  const list = curSlide().elements;
  const i = list.findIndex((e) => e.id === S.sel);
  if (i < 0) return;
  const [el] = list.splice(i, 1);
  const to = { front: list.length, back: 0, forward: Math.min(i + 1, list.length), backward: Math.max(i - 1, 0) }[how];
  list.splice(to, 0, el);
  renderStage();
  drawSelection();
  commit();
}

/** Vários selecionados: alinha entre si (pela caixa do grupo) ou distribui. */
function alignGroup(how) {
  const els = groupEls();
  if (els.length < 2) return;
  const b = bbox(els);
  if (how === 'distH' || how === 'distV') {
    const k = how === 'distH' ? ['x', 'w'] : ['y', 'h'];
    const sorted = [...els].sort((p, q) => p[k[0]] - q[k[0]]);
    const total = sorted.reduce((s, g) => s + g[k[1]], 0);
    const gap = ((how === 'distH' ? b.w : b.h) - total) / (sorted.length - 1);
    let pos = how === 'distH' ? b.x : b.y;
    for (const g of sorted) {
      g[k[0]] = Math.round(pos);
      pos += g[k[1]] + gap;
    }
  } else {
    for (const g of els) {
      if (how === 'left') g.x = b.x;
      if (how === 'hcenter') g.x = Math.round(b.x + (b.w - g.w) / 2);
      if (how === 'right') g.x = b.x + b.w - g.w;
      if (how === 'top') g.y = b.y;
      if (how === 'vcenter') g.y = Math.round(b.y + (b.h - g.h) / 2);
      if (how === 'bottom') g.y = b.y + b.h - g.h;
    }
  }
  renderStage();
  commit();
}

function alignOnSlide(how) {
  const el = selEl();
  if (!el) return;
  if (how === 'left') el.x = 0;
  if (how === 'hcenter') el.x = Math.round((W - el.w) / 2);
  if (how === 'right') el.x = W - el.w;
  if (how === 'top') el.y = 0;
  if (how === 'vcenter') el.y = Math.round((H - el.h) / 2);
  if (how === 'bottom') el.y = H - el.h;
  rerenderEl(el);
  commit();
}

function nudge(dx, dy) {
  const els = selection();
  if (!els.length) return;
  for (const el of els) {
    el.x += dx;
    el.y += dy;
    const n = nodeOf(el.id);
    n.style.left = `${el.x}px`;
    n.style.top = `${el.y}px`;
  }
  drawSelection();
  clearTimeout(nudge.t);
  nudge.t = setTimeout(commit, 400);
}

// ============================================================================
// Slides
// ============================================================================

function addSlide(layout = 'conteudo', at = S.cur + 1) {
  exitEdit();
  const s = LAYOUTS[layout].build({});
  slides().splice(at, 0, s);
  S.cur = at;
  S.sel = null;
  renderAll();
  commit();
}

function duplicateSlide(i) {
  exitEdit();
  const s = clone(slides()[i]);
  s.id = uid('s');
  s.elements.forEach((e) => (e.id = uid()));
  slides().splice(i + 1, 0, s);
  S.cur = i + 1;
  S.sel = null;
  renderAll();
  commit();
}

function deleteSlide(i) {
  if (slides().length <= 1) return toast('A apresentação precisa ter ao menos um slide.');
  exitEdit();
  slides().splice(i, 1);
  S.cur = clamp(S.cur >= i ? S.cur - 1 : S.cur, 0, slides().length - 1);
  S.sel = null;
  renderAll();
  commit();
  return undefined;
}

function moveSlide(from, to) {
  if (from === to) return;
  const [s] = slides().splice(from, 1);
  slides().splice(to, 0, s);
  S.cur = to;
  renderAll();
  commit();
}

function applyLayout(layout) {
  const s = curSlide();
  const userContent = s.elements.some((e) => !e.locked && ((e.type === 'text' && hasText(e.html)) || (e.type === 'image' && e.src && !e.src.startsWith('/static/'))));
  if (userContent && !confirm(`Aplicar o layout “${LAYOUTS[layout].name}”? O conteúdo atual deste slide será substituído.`)) return;
  exitEdit();
  const fresh = LAYOUTS[layout].build({});
  fresh.id = s.id;
  fresh.notes = s.notes;
  slides()[S.cur] = fresh;
  S.sel = null;
  renderStage();
  commit();
}

panel.addEventListener('click', (e) => {
  const item = e.target.closest('.sthumb');
  if (!item) return;
  const i = Number(item.dataset.i);
  const t = e.target.closest('[data-t]')?.dataset.t;
  if (t === 'dup') return duplicateSlide(i);
  if (t === 'del') return deleteSlide(i);
  return selectSlide(i);
});

let dragFrom = null;
panel.addEventListener('dragstart', (e) => {
  const item = e.target.closest('.sthumb');
  if (!item) return;
  dragFrom = Number(item.dataset.i);
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', String(dragFrom));
});
panel.addEventListener('dragover', (e) => {
  if (dragFrom === null) return;
  e.preventDefault();
  panel.querySelectorAll('.drop-before').forEach((n) => n.classList.remove('drop-before'));
  const item = e.target.closest('.sthumb');
  if (!item) return;
  const r = item.getBoundingClientRect();
  const after = e.clientY > r.top + r.height / 2;
  const target = after ? item.nextElementSibling : item;
  if (target?.classList.contains('sthumb')) target.classList.add('drop-before');
  else item.dataset.after = '1';
});
panel.addEventListener('drop', (e) => {
  e.preventDefault();
  if (dragFrom === null) return;
  const marked = panel.querySelector('.drop-before');
  let to = marked ? Number(marked.dataset.i) : slides().length;
  if (to > dragFrom) to -= 1;
  moveSlide(dragFrom, to);
});
panel.addEventListener('dragend', () => {
  dragFrom = null;
  panel.querySelectorAll('.drop-before, .dragging').forEach((n) => n.classList.remove('drop-before', 'dragging'));
});

// ============================================================================
// Menus suspensos e janelas
// ============================================================================

let menuEl = null;
function closeMenu() {
  menuEl?.remove();
  menuEl = null;
}
document.addEventListener('pointerdown', (e) => {
  if (menuEl && !menuEl.contains(e.target) && !e.target.closest('[data-cmd]')) closeMenu();
});

function showMenu(anchor, build) {
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

function mi(m, label, action, { icon, checked, disabled } = {}) {
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
const msep = (m) => m.appendChild(Object.assign(document.createElement('div'), { className: 'msep' }));
const mhead = (m, t) => m.appendChild(Object.assign(document.createElement('div'), { className: 'mhead', textContent: t }));

function swatches(m, onPick, { none = false, custom = true, current } = {}) {
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
function layoutGrid(m, onPick) {
  for (const [title, keys] of [['Modelos PADAP', PADAP_LAYOUT_ORDER], ['Layouts básicos', LAYOUT_ORDER]]) {
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

function modal(title, { wide = false } = {}) {
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

// ---- Seletor de imagens (Banco, Portfólio, Minhas imagens) ------------------

const PICKER_TABS = [
  ['banco', 'Banco de imagens'],
  ['portfolio', 'Portfólio'],
  ['user', 'Minhas imagens'],
];

function openPicker(category, onPick = insertImage) {
  const m = modal('Inserir imagem', { wide: true });
  m.body.innerHTML = `<div class="picker-tabs"></div><div class="picker-filters" hidden></div><div class="picker-grid"></div>`;
  const filters = m.body.querySelector('.picker-filters');
  filters.innerHTML = `
    <select class="text-input" data-f="kind" aria-label="Tipo"><option value="">Tudo</option><option value="produto">Produtos</option><option value="logo">Logos das marcas</option><option value="pagina">Páginas do portfólio</option></select>
    <select class="text-input" data-f="brand" aria-label="Marca"><option value="">Todas as marcas</option></select>
    <label class="check"><input type="checkbox" data-f="withText" checked> Inserir produto com nome e descrição</label>`;
  const fKind = filters.querySelector('[data-f=kind]');
  const fBrand = filters.querySelector('[data-f=brand]');
  const fText = filters.querySelector('[data-f=withText]');
  fKind.addEventListener('change', () => draw());
  fBrand.addEventListener('change', () => draw());
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
    filters.hidden = !isPf;
    grid.classList.toggle('contain', isPf);
    const list = items.filter(
      (a) =>
        (!q || `${a.title} ${a.description || ''}`.toLowerCase().includes(q)) &&
        (!isPf || !fKind.value || (a.kind || 'produto') === fKind.value) &&
        (!isPf || !fBrand.value || a.brand === fBrand.value)
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
      b.querySelector('img').src = a.url;
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

// ---- Compartilhar ---------------------------------------------------------

async function openShare() {
  if (!(await ensureSaved())) return;
  const m = modal('Compartilhar');
  const link = () => (boot.shareToken ? `${location.origin}/v/${boot.shareToken}` : '');
  m.body.innerHTML = `
    <div class="share-row"><input type="checkbox" id="sh-team" class="check"><label for="sh-team" class="txt">
      <strong>Visível para a equipe</strong><span>Todos os usuários do Estúdio veem na Biblioteca (aba “Compartilhadas pela equipe”), podem apresentar e fazer uma cópia. Só você edita.</span></label></div>
    <div class="share-row"><input type="checkbox" id="sh-public"><div class="txt" style="flex:1"><label for="sh-public">
      <strong>Link público de visualização</strong><span>Qualquer pessoa com o link pode assistir à apresentação, sem login (ex.: enviar a um cliente).</span></label>
      <div class="share-link" hidden><input class="text-input" readonly><button class="btn btn-sm" type="button">${ic('copy')} Copiar</button></div></div></div>`;
  const team = m.body.querySelector('#sh-team');
  const pub = m.body.querySelector('#sh-public');
  const linkBox = m.body.querySelector('.share-link');
  const linkInput = linkBox.querySelector('input');
  const draw = () => {
    team.checked = !!boot.teamVisible;
    pub.checked = !!boot.shareToken;
    linkBox.hidden = !boot.shareToken;
    linkInput.value = link();
  };
  const send = async (body) => {
    try {
      const r = await api('POST', `/api/presentations/${pres.id}/share`, body);
      boot.teamVisible = r.team;
      boot.shareToken = r.shareToken;
    } catch (e) {
      toast(e.message, 'error');
    }
    draw();
  };
  team.addEventListener('change', () => send({ team: team.checked }));
  pub.addEventListener('change', () => send({ public: pub.checked }));
  linkBox.querySelector('button').addEventListener('click', async () => {
    await flush();
    try {
      await navigator.clipboard.writeText(link());
      toast('Link copiado.');
    } catch (e) {
      linkInput.select();
    }
  });
  draw();
}

// ---- Exportar / salvar ----------------------------------------------------

async function doExportPptx() {
  await flush();
  toast('Gerando o arquivo do PowerPoint…');
  try {
    const warnings = await exportPptx(pres.title, slides(), (i, n) => setStatus(`Exportando slide ${i} de ${n}…`));
    setStatus('Todas as alterações foram salvas');
    toast(warnings.length ? `PowerPoint gerado, mas ${warnings.length} imagem(ns) não puderam ser incluídas.` : 'PowerPoint gerado.', warnings.length ? 'error' : '');
  } catch (e) {
    setStatus('Todas as alterações foram salvas');
    toast(e.message, 'error');
  }
}

// ---- Histórico de versões ----------------------------------------------------

async function openHistory() {
  if (!pres.id) return toast('Esta apresentação ainda não foi salva — não há versões anteriores.');
  await flush();
  const m = modal('Histórico de versões', { wide: true });
  m.body.innerHTML = `<p class="muted" style="margin-top:0">Uma cópia é guardada automaticamente a cada 10 minutos de edição (até as 50 mais recentes). Restaurar não apaga nada: a versão atual também fica guardada.</p>
    <div class="history"><div class="history-list"></div><div class="history-preview"><div class="muted">Escolha uma versão à esquerda.</div></div></div>`;
  const listBox = m.body.querySelector('.history-list');
  const prev = m.body.querySelector('.history-preview');
  let versions = [];
  try {
    versions = (await api('GET', `/api/presentations/${pres.id}/versions`)).versions;
  } catch (err) {
    toast(err.message, 'error');
  }
  if (!versions.length) {
    listBox.innerHTML = '<div class="empty">Ainda não há versões anteriores. Elas aparecem depois de alguns minutos de edição.</div>';
    return undefined;
  }
  for (const v of versions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'history-item';
    b.innerHTML = '<strong></strong><span></span>';
    b.querySelector('strong').textContent = fmtDate(v.created_at);
    b.querySelector('span').textContent = [v.reason === 'restore' ? 'Antes de uma restauração' : null, v.author_name, `${v.slide_count} slide${v.slide_count === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
    b.addEventListener('click', async () => {
      listBox.querySelectorAll('.history-item').forEach((x) => x.classList.toggle('on', x === b));
      prev.innerHTML = '<div class="muted">Carregando…</div>';
      try {
        const full = await api('GET', `/api/presentations/${pres.id}/versions/${v.id}`);
        prev.innerHTML = `<div class="history-head"><strong></strong><button class="btn btn-primary btn-sm" type="button">Restaurar esta versão</button></div><div class="history-thumbs"></div>`;
        prev.querySelector('strong').textContent = `${full.title} — ${fmtDate(full.created_at)}`;
        const thumbs = prev.querySelector('.history-thumbs');
        for (const s of full.data.slides) {
          const t = document.createElement('div');
          thumbs.appendChild(t);
          mountThumb(t, s);
        }
        prev.querySelector('button').addEventListener('click', async () => {
          if (!confirm('Restaurar esta versão? A versão atual será guardada no histórico.')) return;
          try {
            await api('POST', `/api/presentations/${pres.id}/versions/${v.id}/restore`);
            pending = false;
            location.reload();
          } catch (err) {
            toast(err.message, 'error');
          }
        });
      } catch (err) {
        prev.innerHTML = '';
        toast(err.message, 'error');
      }
    });
    listBox.appendChild(b);
  }
  return undefined;
}

async function doExportPdf() {
  await flush();
  toast('Gerando o PDF…');
  try {
    await exportPdf(pres.title, slides(), (i, n) => setStatus(`Gerando PDF: slide ${i} de ${n}…`));
    toast('PDF gerado.');
  } catch (err) {
    toast(err.message, 'error');
  }
  setStatus(pres.id ? 'Todas as alterações foram salvas' : 'Rascunho — será salvo na primeira edição');
}

async function openPrint(pdf) {
  if (!(await ensureSaved())) return;
  window.open(`/imprimir/${pres.id}?auto=1${pdf ? '&pdf=1' : ''}`, '_blank');
}

async function saveAs() {
  const title = prompt('Salvar uma cópia com o nome:', `${pres.title} (cópia)`);
  if (!title) return;
  if (!(await ensureSaved())) return;
  try {
    const { id } = await api('POST', `/api/presentations/${pres.id}/copy`, { title, data: pres.data });
    location.href = `/editor/${id}`;
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function saveNow() {
  pending = true;
  if (await flush()) toast('Apresentação salva.');
}

// ============================================================================
// Barra de ferramentas
// ============================================================================

function syncToolbar() {
  const el = selEl();
  const isText = el && el.type === 'text';
  $('#font-family').value = isText ? el.style.fontFamily : 'Space Grotesk';
  $('#font-size').value = isText ? el.style.fontSize : '';
  $('#font-family').disabled = !isText;
  $('#font-size').disabled = !isText;
  let c = curSlide().bg;
  if (isText) c = el.style.color;
  else if (el && el.type === 'shape') c = el.fill === 'none' ? el.stroke : el.fill;
  $('#color-bar').style.background = c && c !== 'none' ? c : '#fff';
}

const COMMANDS = {
  present: () => {
    exitEdit();
    present(slides(), { start: S.cur, fullscreen: true, onExit: (i) => selectSlide(i) });
  },
  share: openShare,
  export: (btn) =>
    showMenu(btn, (m) => {
      mi(m, 'PowerPoint (.pptx)', doExportPptx, { icon: 'download' });
      mi(m, 'PDF', doExportPdf, { icon: 'download' });
      msep(m);
      mi(m, 'Salvar (Ctrl+S)', saveNow, { icon: 'save' });
      mi(m, 'Salvar como… (fazer uma cópia)', saveAs, { icon: 'saveAs' });
      mi(m, 'Imprimir', () => openPrint(false), { icon: 'printer' });
      msep(m);
      mi(m, 'Histórico de versões', openHistory, { icon: 'undo' });
    }),
  undo,
  redo,
  newSlide: () => addSlide(),
  newSlideMenu: (btn) => showMenu(btn, (m) => layoutGrid(m, (k) => addSlide(k))),
  layoutMenu: (btn) => showMenu(btn, (m) => layoutGrid(m, applyLayout)),
  addText,
  pickBanco: () => openPicker('banco'),
  pickPortfolio: () => openPicker('portfolio'),
  bold: () => toggleInline('bold'),
  italic: () => toggleInline('italic'),
  underline: () => toggleInline('underline'),
  fontGrow: () => selEl()?.type === 'text' && setFontSize(Math.round(selEl().style.fontSize * 1.15)),
  fontShrink: () => selEl()?.type === 'text' && setFontSize(Math.round(selEl().style.fontSize / 1.15)),
  highlightMenu: (btn) =>
    showMenu(btn, (m) => {
      mhead(m, 'Realce do texto');
      for (const [c, label] of [['#FFF59D', 'Amarelo'], ['#BFEFC5', 'Verde-claro'], ['#B3E5FC', 'Azul-claro'], ['transparent', 'Sem realce']]) {
        mi(m, label, () => applyHighlight(c));
      }
    }),
  colorMenu: (btn) =>
    showMenu(btn, (m) => {
      const el = selEl();
      if (!el) {
        mhead(m, 'Cor de fundo do slide');
        swatches(m, applyColor, { current: curSlide().bg });
      } else if (el.type === 'text') {
        mhead(m, hasRangeSelection() ? 'Cor do texto selecionado' : 'Cor do texto');
        swatches(m, applyColor, { current: el.style.color });
      } else if (el.type === 'shape') {
        mhead(m, 'Preenchimento');
        swatches(m, applyColor, { none: true, current: el.fill });
        mhead(m, 'Contorno');
        swatches(m, (c) => applyStroke(c), { none: true, custom: false });
        const row = document.createElement('div');
        row.className = 'swatches';
        row.style.gridTemplateColumns = 'repeat(4, auto)';
        for (const w of [2, 4, 8, 16]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-sm';
          b.style.cssText = 'width:auto;height:auto';
          b.textContent = `${w}px`;
          b.addEventListener('click', () => {
            closeMenu();
            applyStroke(undefined, w);
          });
          row.appendChild(b);
        }
        m.appendChild(row);
      } else {
        mhead(m, 'Imagens não têm cor');
        mi(m, 'Mudar a cor de fundo do slide', () => {
          select(null);
          COMMANDS.colorMenu(btn);
        });
      }
    }),
  listMenu: (btn) =>
    showMenu(btn, (m) => {
      if (selEl()?.type !== 'text') {
        mhead(m, 'Selecione uma caixa de texto');
        return;
      }
      mi(m, 'Marcadores', () => formatText(() => exec('insertUnorderedList')), { icon: 'list' });
      mi(m, 'Numeração', () => formatText(() => exec('insertOrderedList')), { icon: 'listOrdered' });
      mi(m, 'Sem lista', () =>
        formatText(() => {
          if (document.queryCommandState('insertUnorderedList')) exec('insertUnorderedList');
          if (document.queryCommandState('insertOrderedList')) exec('insertOrderedList');
        })
      );
    }),
  alignLeft: () => setAlign('left'),
  alignCenter: () => setAlign('center'),
  alignRight: () => setAlign('right'),
  alignJustify: () => setAlign('justify'),
  valignMenu: (btn) =>
    showMenu(btn, (m) => {
      const el = selEl();
      if (el?.type !== 'text') {
        mhead(m, 'Selecione uma caixa de texto');
        return;
      }
      const set = (k, v) => {
        exitEdit();
        el.style[k] = v;
        rerenderEl(el);
        commit();
      };
      mhead(m, 'Posição vertical');
      mi(m, 'Topo', () => set('valign', 'top'), { checked: el.style.valign === 'top' });
      mi(m, 'Meio', () => set('valign', 'middle'), { checked: el.style.valign === 'middle' });
      mi(m, 'Base', () => set('valign', 'bottom'), { checked: el.style.valign === 'bottom' });
      mhead(m, 'Espaçamento entre linhas');
      for (const v of [1, 1.15, 1.25, 1.5, 2]) mi(m, String(v).replace('.', ','), () => set('lineHeight', v), { checked: el.style.lineHeight === v });
    }),
  shapesMenu: (btn) =>
    showMenu(btn, (m) => {
      mhead(m, 'Dados');
      mi(m, 'Gráfico de barras', () => addChart('bar'), { icon: 'grid' });
      mi(m, 'Gráfico de linhas', () => addChart('line'), { icon: 'normalView' });
      mi(m, 'Tabela', addTable, { icon: 'layout' });
      mi(m, 'Tabela de cotação (preços atuais)', addPriceTable, { icon: 'grid' });
      mi(m, 'Indicadores de mercado (dólar, ureia, MAP, KCl)', addMarketIndicators, { icon: 'globe' });
      mhead(m, 'Inserir forma');
      const grid = document.createElement('div');
      grid.className = 'shape-grid';
      for (const [k, label, w, h] of SHAPES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.title = label;
        const k2 = 36 / Math.max(w, h);
        const prev = { shape: k, w: Math.max(4, w * k2), h: Math.max(4, h * k2), fill: BRAND.green, stroke: k === 'line' || k === 'symbolOutline' ? BRAND.green : 'none', strokeWidth: k === 'line' ? 3 : k === 'symbolOutline' ? 2 : 0 };
        b.innerHTML = shapeSvg(prev);
        b.addEventListener('click', () => {
          closeMenu();
          addShape(k);
        });
        grid.appendChild(b);
      }
      m.appendChild(grid);
      const el = selEl();
      if (el?.type === 'image') {
        msep(m);
        mhead(m, 'Formato da imagem selecionada');
        for (const [k, label] of [['none', 'Retangular'], ['leaf', 'Folha PADAP'], ['leafAlt', 'Folha PADAP (invertida)'], ['round', 'Cantos arredondados'], ['circle', 'Círculo'], ['arch', 'Arco']]) {
          mi(m, label, () => {
            el.mask = k;
            rerenderEl(el);
            commit();
          }, { checked: el.mask === k });
        }
      }
    }),
  arrangeMenu: (btn) =>
    showMenu(btn, (m) => {
      const el = selEl();
      const has = !!el;
      if (S.group.length) {
        mhead(m, `${S.group.length} elementos selecionados`);
        mhead(m, 'Alinhar entre si');
        mi(m, 'Alinhar à esquerda', () => alignGroup('left'));
        mi(m, 'Centralizar na horizontal', () => alignGroup('hcenter'));
        mi(m, 'Alinhar à direita', () => alignGroup('right'));
        mi(m, 'Alinhar ao topo', () => alignGroup('top'));
        mi(m, 'Centralizar na vertical', () => alignGroup('vcenter'));
        mi(m, 'Alinhar à base', () => alignGroup('bottom'));
        mhead(m, 'Distribuir');
        mi(m, 'Espaçar igualmente na horizontal', () => alignGroup('distH'), { disabled: S.group.length < 3 });
        mi(m, 'Espaçar igualmente na vertical', () => alignGroup('distV'), { disabled: S.group.length < 3 });
        msep(m);
        mi(m, 'Duplicar (Ctrl+D)', duplicateSelected, { icon: 'copy' });
        mi(m, 'Excluir (Delete)', deleteSelected, { icon: 'trash' });
        return;
      }
      mhead(m, 'Ordem');
      mi(m, 'Trazer para a frente', () => reorder('front'), { disabled: !has });
      mi(m, 'Avançar', () => reorder('forward'), { disabled: !has });
      mi(m, 'Recuar', () => reorder('backward'), { disabled: !has });
      mi(m, 'Enviar para trás', () => reorder('back'), { disabled: !has });
      mhead(m, 'Alinhar no slide');
      mi(m, 'Centralizar na horizontal', () => alignOnSlide('hcenter'), { disabled: !has });
      mi(m, 'Centralizar na vertical', () => alignOnSlide('vcenter'), { disabled: !has });
      mi(m, 'Encostar à esquerda', () => alignOnSlide('left'), { disabled: !has });
      mi(m, 'Encostar à direita', () => alignOnSlide('right'), { disabled: !has });
      if (el?.type === 'image') {
        mhead(m, 'Imagem');
        mi(m, 'Trocar imagem…', () => openPicker('banco', (url) => setImage(el, url)), { icon: 'image' });
        mi(m, 'Preencher o quadro (cortar)', () => {
          el.fit = 'cover';
          rerenderEl(el);
          commit();
        }, { checked: el.fit === 'cover' });
        mi(m, 'Caber no quadro (sem cortar)', () => {
          el.fit = 'contain';
          rerenderEl(el);
          commit();
        }, { checked: el.fit === 'contain' });
      }
      if (has) {
        mhead(m, 'Transparência');
        const cur = el.opacity ?? 1;
        for (const v of [1, 0.75, 0.5, 0.25]) {
          mi(m, `${Math.round((1 - v) * 100)}%`, () => {
            el.opacity = v;
            rerenderEl(el);
            commit();
          }, { checked: cur === v });
        }
      }
      msep(m);
      mi(m, 'Duplicar (Ctrl+D)', duplicateSelected, { icon: 'copy', disabled: !has });
      if (has) {
        mi(m, 'Bloquear (fica fixo no fundo)', () => {
          el.locked = true;
          S.sel = null;
          renderStage();
          commit();
        }, { icon: 'lock' });
      }
      const locked = curSlide().elements.filter((e) => e.locked).length;
      mi(m, `Desbloquear decorações deste slide (${locked})`, () => {
        curSlide().elements.forEach((e) => delete e.locked);
        renderStage();
        commit();
        toast('Agora as decorações podem ser movidas ou excluídas.');
      }, { icon: 'unlock', disabled: !locked });
      mi(m, 'Excluir (Delete)', deleteSelected, { icon: 'trash', disabled: !has });
    }),
  zoomIn: () => setZoom(zoom() + 0.1),
  zoomOut: () => setZoom(zoom() - 0.1),
};

function setZoom(z) {
  S.zoom = clamp(Math.round(z * 100) / 100, 0.1, 1.5);
  $('#zoom-select').value = ['0.25', '0.5', '0.75', '1'].includes(String(S.zoom)) ? String(S.zoom) : '';
  applyZoom();
}

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]');
  if (!b || b.disabled) return;
  e.stopPropagation();
  const fn = COMMANDS[b.dataset.cmd];
  if (fn) fn(b);
});

// Botões da faixa não tiram o foco do texto em edição (mantém a seleção).
document.querySelector('.ribbon').addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) e.preventDefault();
});

$('#font-family').addEventListener('change', (e) => setFontFamily(e.target.value));
$('#font-size').addEventListener('change', (e) => setFontSize(Number(e.target.value)));
// Enter confirma (via "change" ao perder o foco); o Enter não pode chegar ao texto.
$('#font-size').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  }
});

const titleInput = $('#title');
titleInput.value = pres.title;
titleInput.addEventListener('change', () => {
  pres.title = titleInput.value.trim() || 'Apresentação sem título';
  titleInput.value = pres.title;
  document.title = `${pres.title} · Estúdio PADAP`;
  scheduleSave(0);
});
titleInput.addEventListener('keydown', (e) => e.key === 'Enter' && titleInput.blur());

$('#notes-text').addEventListener('input', (e) => {
  curSlide().notes = e.target.value;
  scheduleSave(1500);
});
$('#notes-text').addEventListener('change', commit);

$('#lang').addEventListener('change', (e) => {
  S.lang = e.target.value;
  stage.querySelector('.slide').lang = S.lang;
});

$('#zoom').addEventListener('input', (e) => setZoom(Number(e.target.value) / 100));
$('#zoom-select').addEventListener('change', (e) => {
  if (e.target.value === 'fit') {
    S.zoom = 'fit';
    applyZoom();
  } else if (e.target.value) setZoom(Number(e.target.value));
});

function setView(v) {
  if (v === 'notes') {
    $('#notes').hidden = !$('#notes').hidden;
    document.querySelector('[data-view="notes"]').classList.toggle('on', !$('#notes').hidden);
    return;
  }
  S.view = v;
  $('#sorter').hidden = v !== 'sorter';
  $('#stage-scroll').hidden = v === 'sorter';
  document.querySelector('[data-view="sorter"]').classList.toggle('on', v === 'sorter');
  document.querySelector('[data-view="normal"]').classList.toggle('on', v === 'normal');
  if (v === 'sorter') {
    exitEdit();
    renderSorter();
  } else applyZoom();
}
document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));

// ============================================================================
// Teclado
// ============================================================================

document.addEventListener('keydown', (e) => {
  if (document.querySelector('.viewer')) return; // o modo apresentação trata as teclas
  const modalOpen = document.querySelector('.modal-backdrop');
  if (modalOpen) {
    if (e.key === 'Escape') modalOpen.remove();
    return;
  }
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 's') {
    e.preventDefault();
    saveNow();
    return;
  }
  if (e.key === 'F5') {
    e.preventDefault();
    COMMANDS.present();
    return;
  }
  if (e.key === 'Escape') {
    closeMenu();
    if (S.editing) exitEdit();
    else setGroup([]);
    return;
  }
  const inField = e.target.closest('input, select, textarea');
  if (S.editing || inField) return; // digitação normal

  if (mod && k === 'z') {
    e.preventDefault();
    if (e.shiftKey) redo();
    else undo();
  } else if (mod && k === 'y') {
    e.preventDefault();
    redo();
  } else if (mod && k === 'd') {
    e.preventDefault();
    duplicateSelected();
  } else if (mod && k === 'a') {
    e.preventDefault();
    setGroup(curSlide().elements.filter((g) => !g.locked).map((g) => g.id));
  } else if (mod && k === 'c' && selection().length) {
    S.clipboard = clone(selection());
  } else if (mod && k === 'x' && selection().length) {
    S.clipboard = clone(selection());
    deleteSelected();
  } else if (mod && k === 'v' && S.clipboard) {
    e.preventDefault();
    // cada colagem desloca mais 30 px (a próxima cópia não cai em cima)
    S.clipboard = clone(pasteElements(S.clipboard));
  } else if (mod && ['b', 'i', 'u'].includes(k) && selEl()?.type === 'text') {
    e.preventDefault();
    toggleInline({ b: 'bold', i: 'italic', u: 'underline' }[k]);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selection().length) deleteSelected();
    else if (document.activeElement?.closest('#slides')) deleteSlide(S.cur);
    else return;
    e.preventDefault();
  } else if (e.key.startsWith('Arrow')) {
    const step = e.shiftKey ? 10 : 1;
    if (selection().length) {
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      nudge(...d);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') selectSlide(S.cur + 1);
    else selectSlide(S.cur - 1);
    e.preventDefault();
  } else if (e.key === 'Enter' && selEl()?.type === 'text') {
    e.preventDefault();
    enterEdit(S.sel);
  }
});

// ============================================================================
// Início
// ============================================================================

renderAll();
updateUndoButtons();
setStatus(pres.id ? 'Todas as alterações foram salvas' : 'Rascunho — será salvo na primeira edição');
document.fonts?.ready.then(() => renderStage());
