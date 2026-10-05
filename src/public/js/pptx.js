// Exportação para PowerPoint (.pptx) com PptxGenJS (servido em /vendor).
// Textos e formas simples viram objetos editáveis; fotos com máscara e formas do
// grafismo são rasterizadas em PNG (o PowerPoint não tem essas formas nativas).
import { W, shapeSvg, maskPath } from './render.js';

const PX_PER_IN = W / 13.333; // slide 16:9 "LAYOUT_WIDE" = 13,333 x 7,5 pol.
const inch = (px) => px / PX_PER_IN;
const pt = (px) => (px * 72) / PX_PER_IN;
const hex = (c) => (c || '#000000').replace('#', '').toUpperCase().slice(0, 6);

function loadLib() {
  if (window.PptxGenJS) return Promise.resolve(window.PptxGenJS);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/vendor/pptxgen.bundle.js';
    s.onload = () => resolve(window.PptxGenJS);
    s.onerror = () => reject(new Error('Não foi possível carregar o exportador de PowerPoint.'));
    document.head.appendChild(s);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Imagem não encontrada: ${src}`));
    img.src = src;
  });
}

const scaleFor = (w, h) => Math.min(2, 2400 / Math.max(w, h));

async function rasterShape(el) {
  // Formas são lisas: 1x basta (arquivo bem menor).
  const k = Math.min(1, 2000 / Math.max(el.w, el.h));
  const svg = shapeSvg(el, { standalone: true });
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(el.w * k));
  c.height = Math.max(1, Math.round(el.h * k));
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function rasterImage(el) {
  const img = await loadImage(el.src);
  const k = scaleFor(el.w, el.h);
  const cw = Math.max(1, Math.round(el.w * k));
  const ch = Math.max(1, Math.round(el.h * k));
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  const clip = maskPath(el.mask, cw, ch);
  if (clip) ctx.clip(new Path2D(clip));
  const r = img.naturalWidth / img.naturalHeight;
  let dw = cw;
  let dh = ch;
  if ((el.fit === 'contain') === r > cw / ch) dh = cw / r;
  else dw = ch * r;
  ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  const transparent = clip || /\.png$/i.test(el.src) || el.fit === 'contain';
  return transparent ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.9);
}

// ---- Texto: HTML do editor -> "runs" do PptxGenJS --------------------------

function cssColor(v) {
  if (!v) return null;
  if (v.startsWith('#')) return hex(v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v);
  const m = v.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
  if (!m || m[4] === '0') return null;
  return [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function htmlToRuns(html, base) {
  const root = document.createElement('div');
  root.innerHTML = html;
  const paras = [];
  let cur = null;
  const newPara = (props) => {
    cur = { props, runs: [] };
    paras.push(cur);
  };
  newPara({});

  const BLOCK = new Set(['DIV', 'P', 'LI', 'UL', 'OL']);

  function walk(node, fmt, listType) {
    for (const n of node.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) {
        if (n.textContent) cur.runs.push({ text: n.textContent, fmt: { ...fmt } });
        continue;
      }
      if (n.nodeType !== Node.ELEMENT_NODE) continue;
      const tag = n.tagName;
      if (tag === 'BR') {
        cur.br = true; // linha em branco intencional, se o parágrafo estiver vazio
        newPara({ ...cur.props });
        continue;
      }
      const f = { ...fmt };
      if (tag === 'B' || tag === 'STRONG') f.bold = true;
      if (tag === 'I' || tag === 'EM') f.italic = true;
      if (tag === 'U') f.underline = true;
      if (tag === 'S' || tag === 'STRIKE') f.strike = true;
      if (tag === 'FONT') {
        if (n.getAttribute('color')) f.color = cssColor(n.getAttribute('color'));
        if (n.getAttribute('face')) f.font = n.getAttribute('face');
      }
      const st = n.style;
      if (st.fontWeight) f.bold = st.fontWeight === 'bold' || Number(st.fontWeight) >= 600;
      if (st.fontStyle) f.italic = st.fontStyle === 'italic';
      if (/underline/.test(st.textDecoration || st.textDecorationLine)) f.underline = true;
      if (st.color) f.color = cssColor(st.color) || f.color;
      if (st.backgroundColor) f.highlight = cssColor(st.backgroundColor);
      if (st.fontSize) f.size = parseFloat(st.fontSize);
      if (st.fontFamily) f.font = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();

      if (BLOCK.has(tag)) {
        const lt = tag === 'UL' ? 'bullet' : tag === 'OL' ? 'number' : listType;
        if (tag === 'UL' || tag === 'OL') {
          walk(n, f, lt);
          continue;
        }
        const props = { align: st.textAlign || undefined, list: tag === 'LI' ? listType : undefined };
        // Cada bloco começa um parágrafo — reaproveitando o atual se ainda estiver vazio.
        if (cur.runs.length || cur.br) newPara(props);
        else cur.props = props;
        walk(n, f, lt);
        if (cur.runs.length || cur.br) newPara({});
      } else {
        walk(n, f, listType);
      }
    }
  }
  walk(root, {}, undefined);

  const out = [];
  const real = paras.filter((p) => p.runs.length || p.br);
  while (real.length && !real[real.length - 1].runs.length) real.pop(); // sem linhas vazias no fim
  real.forEach((p, pi) => {
    const runs = p.runs.length ? p.runs : [{ text: '', fmt: {} }];
    runs.forEach((r, ri) => {
      const o = {
        bold: r.fmt.bold ?? base.bold,
        italic: !!r.fmt.italic,
        underline: r.fmt.underline ? { style: 'sng' } : undefined,
        strike: r.fmt.strike ? 'sngStrike' : undefined,
        color: r.fmt.color || hex(base.color),
        fontSize: pt(r.fmt.size || base.fontSize),
        fontFace: r.fmt.font || base.fontFamily,
        highlight: r.fmt.highlight || undefined,
      };
      if (p.props.list === 'bullet') o.bullet = { indent: pt(base.fontSize) * 1.1 };
      if (p.props.list === 'number') o.bullet = { type: 'number', indent: pt(base.fontSize) * 1.3 };
      if (p.props.align) o.align = p.props.align === 'start' ? 'left' : p.props.align;
      if (ri === runs.length - 1 && pi < real.length - 1) o.breakLine = true;
      out.push({ text: r.text, options: o });
    });
  });
  return out;
}

const NATIVE = { rect: 'rect', round: 'roundRect', ellipse: 'ellipse', triangle: 'triangle', line: 'line' };

export async function exportPptx(title, slides, onProgress = () => {}) {
  const PptxGenJS = await loadLib();
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.title = title;
  pptx.company = 'PADAP Produtividade Agrícola';
  pptx.author = 'Estúdio PADAP';
  const warnings = [];

  for (const [si, slide] of slides.entries()) {
    onProgress(si + 1, slides.length);
    const s = pptx.addSlide();
    s.background = { color: hex(slide.bg) };
    if (slide.notes) s.addNotes(slide.notes);

    for (const el of slide.elements) {
      const box = { x: inch(el.x), y: inch(el.y), w: inch(el.w), h: inch(el.h) };
      const transparency = el.opacity !== undefined ? Math.round((1 - el.opacity) * 100) : 0;
      try {
        if (el.type === 'text') {
          if (!el.html || !el.html.replace(/<[^>]*>/g, '').trim()) continue;
          const st = el.style;
          s.addText(htmlToRuns(el.html, st), {
            ...box,
            fontFace: st.fontFamily,
            fontSize: pt(st.fontSize),
            color: hex(st.color),
            bold: st.bold,
            align: st.align,
            valign: st.valign,
            margin: 0,
            lineSpacingMultiple: st.lineHeight,
            fit: 'none',
            wrap: true,
            transparency,
          });
        } else if (el.type === 'image') {
          if (!el.src) continue;
          s.addImage({ data: await rasterImage(el), ...box, transparency });
        } else if (NATIVE[el.shape] && !el.fill2) {
          const isLine = el.shape === 'line';
          const lineColor = isLine ? (el.stroke !== 'none' ? el.stroke : el.fill) : el.stroke;
          const opt = { ...box };
          if (isLine) {
            opt.y = inch(el.y + el.h / 2);
            opt.h = 0;
            opt.line = { color: hex(lineColor), width: pt(Math.max(el.strokeWidth, 4)), transparency };
          } else {
            opt.fill = el.fill === 'none' ? { type: 'none' } : { color: hex(el.fill), transparency };
            opt.line = lineColor && lineColor !== 'none' && el.strokeWidth ? { color: hex(lineColor), width: pt(el.strokeWidth) } : { type: 'none' };
            if (el.shape === 'round') opt.rectRadius = Math.min(el.w, el.h) * 0.12 / PX_PER_IN;
          }
          s.addShape(NATIVE[el.shape], opt);
        } else {
          s.addImage({ data: await rasterShape(el), ...box, transparency });
        }
      } catch (err) {
        warnings.push(err.message);
      }
    }
  }
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Apresentação';
  await pptx.writeFile({ fileName: `${safe}.pptx` });
  return warnings;
}
