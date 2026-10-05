'use strict';

const sanitizeHtml = require('sanitize-html');

/*
 * Formato de uma apresentação (coluna presentations.data):
 *
 * { version: 1, theme: 'institucional', slides: [Slide] }
 * Slide   = { id, bg: '#ffffff', notes: '', elements: [Element] }   (canvas de 1920 x 1080)
 * Element = { id, type, x, y, w, h, locked?, opacity? } +
 *   text:  { html, placeholder, style: { fontFamily, fontSize, color, align, valign, lineHeight, bold } }
 *   image: { src, mask, fit, placeholder }
 *   shape: { shape, fill, fill2, gradAngle, stroke, strokeWidth }
 *
 * Tudo que chega do navegador passa por aqui: campos fora da lista são descartados,
 * números são limitados e o HTML dos textos é filtrado (XSS — a apresentação pode
 * ser aberta pela equipe e por link público).
 */

const HEX = /^#[0-9a-f]{3,8}$/i;
const CSS_COLOR = [HEX, /^rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(,\s*[\d.]+\s*)?\)$/i];
const ID = /^[\w-]{1,40}$/;
const SRC = /^\/(uploads|static\/img)\/[\w-]+(\/[\w-]+)*\.(jpe?g|png|webp|svg)$/i;

const TYPES = ['text', 'image', 'shape'];
const MASKS = ['none', 'round', 'circle', 'leaf', 'leafAlt', 'arch'];
const SHAPES = ['rect', 'round', 'ellipse', 'leaf', 'leafAlt', 'triangle', 'arrow', 'line', 'symbol', 'symbolOutline', 'arc'];
const FONTS = ['Space Grotesk', 'Arial', 'Georgia', 'Verdana', 'Courier New'];
const ALIGNS = ['left', 'center', 'right', 'justify'];
const VALIGNS = ['top', 'middle', 'bottom'];

const HTML_OPTS = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'div', 'p', 'span', 'ul', 'ol', 'li', 'font'],
  allowedAttributes: { '*': ['style'], font: ['color', 'face', 'size'] },
  allowedStyles: {
    '*': {
      color: CSS_COLOR,
      'background-color': CSS_COLOR,
      'font-size': [/^\d{1,3}(\.\d+)?px$/],
      'font-family': [/^[\w\s"',-]{1,80}$/],
      'font-weight': [/^(bold|normal|[1-9]00)$/],
      'font-style': [/^(italic|normal)$/],
      'text-decoration': [/^[a-z\s-]{1,40}$/],
      'text-decoration-line': [/^[a-z\s-]{1,40}$/],
      'text-align': [/^(left|right|center|justify|start|end)$/],
    },
  },
  disallowedTagsMode: 'discard',
};

const num = (v, min, max, def = 0) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const pick = (v, list, def) => (list.includes(v) ? v : def);
const color = (v, def) => (typeof v === 'string' && HEX.test(v) ? v : def);

function cleanHtml(html) {
  return sanitizeHtml(str(html, 20000), HTML_OPTS);
}

function cleanElement(el) {
  if (!el || typeof el !== 'object' || !TYPES.includes(el.type)) return null;
  const out = {
    id: ID.test(el.id) ? el.id : `e${Math.random().toString(36).slice(2, 10)}`,
    type: el.type,
    x: num(el.x, -4000, 6000),
    y: num(el.y, -4000, 6000),
    w: num(el.w, 1, 8000, 100),
    h: num(el.h, 1, 8000, 100),
  };
  if (el.locked) out.locked = true;
  if (el.opacity !== undefined) out.opacity = num(el.opacity, 0, 1, 1);

  if (el.type === 'text') {
    const s = el.style || {};
    out.html = cleanHtml(el.html);
    out.placeholder = str(el.placeholder, 120);
    out.style = {
      fontFamily: pick(s.fontFamily, FONTS, 'Space Grotesk'),
      fontSize: num(s.fontSize, 6, 400, 40),
      color: color(s.color, '#072B35'),
      align: pick(s.align, ALIGNS, 'left'),
      valign: pick(s.valign, VALIGNS, 'top'),
      lineHeight: num(s.lineHeight, 0.8, 3, 1.2),
      bold: !!s.bold,
    };
  } else if (el.type === 'image') {
    out.src = typeof el.src === 'string' && SRC.test(el.src) && !el.src.includes('..') ? el.src : '';
    out.mask = pick(el.mask, MASKS, 'none');
    out.fit = pick(el.fit, ['cover', 'contain'], 'cover');
    out.placeholder = str(el.placeholder, 120);
  } else {
    out.shape = pick(el.shape, SHAPES, 'rect');
    out.fill = el.fill === 'none' ? 'none' : color(el.fill, '#1DBD2C');
    if (el.fill2 && HEX.test(el.fill2)) {
      out.fill2 = el.fill2;
      out.gradAngle = num(el.gradAngle, 0, 360, 90);
    }
    out.stroke = el.stroke === 'none' || !el.stroke ? 'none' : color(el.stroke, 'none');
    out.strokeWidth = num(el.strokeWidth, 0, 200, 0);
  }
  return out;
}

function cleanSlide(slide) {
  if (!slide || typeof slide !== 'object') return null;
  const elements = Array.isArray(slide.elements) ? slide.elements.slice(0, 300).map(cleanElement).filter(Boolean) : [];
  return {
    id: ID.test(slide.id) ? slide.id : `s${Math.random().toString(36).slice(2, 10)}`,
    bg: color(slide.bg, '#FFFFFF'),
    notes: str(slide.notes, 5000),
    elements,
  };
}

/** Valida/limpa o JSON de uma apresentação. Lança erro se o formato for inválido. */
function cleanPresentation(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.slides)) {
    throw new Error('Formato de apresentação inválido.');
  }
  const slides = data.slides.slice(0, 500).map(cleanSlide).filter(Boolean);
  if (!slides.length) throw new Error('A apresentação precisa ter ao menos um slide.');
  return { version: 1, theme: ID.test(data.theme) ? data.theme : 'branco', slides };
}

function cleanTitle(title) {
  const t = str(title, 160).replace(/\s+/g, ' ').trim();
  return t || 'Apresentação sem título';
}

module.exports = { cleanPresentation, cleanTitle, cleanHtml };
