// Editor do Estúdio PADAP — Edição de texto e cores (formatação, fonte, tamanho, alinhamento, realce).
// Parte de editor.js (núcleo): estado, palco e comandos ficam lá.
import { BRAND, hasText, toast } from '../render.js';
import { S, commit, curSlide, drawSelection, findEl, nodeOf, renderStage, rerenderEl, scheduleSave, selEl, syncToolbar, thumbSoon } from '../editor.js';
import { clamp } from './ui.js';

// ============================================================================
// Edição de texto
// ============================================================================

let savedRange = null;

function txtNode() {
  return S.editing ? nodeOf(S.editing)?.querySelector('.txt') : null;
}

export function enterEdit(id, keepCaret = false) {
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

export function exitEdit() {
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

export const hasRangeSelection = () => S.editing && savedRange && !savedRange.collapsed;

/**
 * Executa um comando de formatação. Editando: vale para o trecho selecionado.
 * Só com a caixa selecionada: vale para o texto inteiro.
 */
export function formatText(fn) {
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

export function exec(cmd, val = null, css = true) {
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

export function setFontSize(px) {
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

export function setFontFamily(name) {
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

export function toggleInline(cmd) {
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

export function setAlign(a) {
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

export function applyColor(c) {
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

export function applyStroke(c, width) {
  const el = selEl();
  if (!el || el.type !== 'shape') return;
  if (c !== undefined) el.stroke = c;
  if (width !== undefined) el.strokeWidth = width;
  if (el.stroke !== 'none' && !el.strokeWidth) el.strokeWidth = 4;
  rerenderEl(el);
  commit();
}

export function applyHighlight(c) {
  if (!formatText(() => exec('hiliteColor', c))) toast('Selecione um texto.');
}
