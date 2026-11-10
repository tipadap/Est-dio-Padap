// Renderização de slides (editor, miniaturas, apresentação, impressão).
// Um slide é um canvas de 1920 x 1080 "px" lógicos; a tela escala com transform.

export const W = 1920;
export const H = 1080;

export const BRAND = {
  teal: '#072B35',
  teal2: '#0F4C4F',
  green: '#1DBD2C',
  greenLight: '#E8F8EA',
  greenSoft: '#BFEFC5',
  white: '#FFFFFF',
};

export const uid = (p = 'e') => p + Math.random().toString(36).slice(2, 10);

// ---- Geometria das formas e máscaras (usada também na exportação PPTX) -----

/** Folha PADAP: cantos sup.-esq. e inf.-dir. arredondados, os outros dois em ponta. */
function leaf(w, h, alt) {
  const r = Math.min(w, h) * 0.5;
  if (alt) {
    return `M0 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} Z`;
  }
  return `M0 ${r} A${r} ${r} 0 0 1 ${r} 0 H${w} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H0 Z`;
}

/** Símbolo "P" da PADAP (folha + haste), escalado para w x h. Desenho base 437 x 507. */
function symbol(w, h) {
  const sx = w / 437;
  const sy = h / 507;
  const p = (x, y) => `${(x * sx).toFixed(2)} ${(y * sy).toFixed(2)}`;
  const ro = 197;
  const ri = 130;
  return (
    `M${p(0, 435)} L${p(0, 197)} A${ro * sx} ${ro * sy} 0 0 1 ${p(197, 0)} L${p(437, 0)} L${p(437, 195)} ` +
    `A${ro * sx} ${ro * sy} 0 0 1 ${p(240, 392)} L${p(146, 392)} L${p(80, 323)} L${p(80, 507)} Z ` +
    `M${p(80, 317)} L${p(80, 205)} A${ri * sx} ${ri * sy} 0 0 1 ${p(210, 75)} L${p(361, 75)} L${p(361, 185)} ` +
    `A${(ri + 2) * sx} ${(ri + 2) * sy} 0 0 1 ${p(229, 317)} Z`
  );
}

export function shapePath(kind, w, h) {
  switch (kind) {
    case 'round': {
      const r = Math.min(w, h) * 0.12;
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`;
    }
    case 'ellipse':
    case 'circle':
      return `M0 ${h / 2} A${w / 2} ${h / 2} 0 1 1 ${w} ${h / 2} A${w / 2} ${h / 2} 0 1 1 0 ${h / 2} Z`;
    case 'leaf':
      return leaf(w, h, false);
    case 'leafAlt':
      return leaf(w, h, true);
    case 'triangle':
      return `M${w / 2} 0 L${w} ${h} L0 ${h} Z`;
    case 'arrow': {
      const t = h * 0.3;
      const head = Math.min(w * 0.45, h);
      return `M0 ${t} H${w - head} V0 L${w} ${h / 2} L${w - head} ${h} V${h - t} H0 Z`;
    }
    case 'line':
      return `M0 ${h / 2} H${w}`;
    case 'arc':
      // Quarto de círculo (canto do grafismo).
      return `M0 ${h} A${w} ${h} 0 0 1 ${w} 0 V${h} Z`;
    case 'arch': {
      const r = w / 2;
      return `M0 ${h} V${r} A${r} ${r} 0 0 1 ${w} ${r} V${h} Z`;
    }
    case 'symbol':
    case 'symbolOutline':
      return symbol(w, h);
    case 'rect':
    default:
      return `M0 0 H${w} V${h} H0 Z`;
  }
}

export function maskPath(mask, w, h) {
  if (!mask || mask === 'none') return null;
  if (mask === 'round') return shapePath('round', w, h);
  if (mask === 'circle') return shapePath('ellipse', w, h);
  if (mask === 'arch') return shapePath('arch', w, h);
  return shapePath(mask, w, h);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** SVG (string) de uma forma — usado no DOM e rasterizado para o PowerPoint. */
export function shapeSvg(el, { standalone = false } = {}) {
  const { w, h } = el;
  const sw = el.strokeWidth || 0;
  const outline = el.shape === 'line' || el.shape === 'symbolOutline';
  // id do degradê derivado das cores/ângulo: vários SVGs na mesma página (miniaturas, palco)
  // não podem compartilhar um id fixo, senão todos herdam o degradê do primeiro.
  const gid = el.fill2 ? `g${`${el.fill}${el.fill2}${el.gradAngle ?? 90}`.replace(/[^0-9a-z]/gi, '')}` : '';
  const fill = outline || el.fill === 'none' ? 'none' : el.fill2 ? `url(#${gid})` : el.fill;
  const stroke = el.shape === 'line' ? el.stroke !== 'none' ? el.stroke : el.fill : el.shape === 'symbolOutline' && el.stroke === 'none' ? el.fill : el.stroke;
  const strokeW = el.shape === 'line' || el.shape === 'symbolOutline' ? Math.max(sw, 4) : sw;
  let defs = '';
  if (el.fill2 && !outline) {
    const a = ((el.gradAngle ?? 90) * Math.PI) / 180;
    const x = Math.cos(a) / 2;
    const y = Math.sin(a) / 2;
    defs = `<defs><linearGradient id="${gid}"x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}"><stop offset="0" stop-color="${el.fill}"/><stop offset="1" stop-color="${el.fill2}"/></linearGradient></defs>`;
  }
  // O traço é desenhado "para dentro" da caixa (inset de meia espessura).
  const pad = strokeW / 2;
  const d = shapePath(el.shape, Math.max(1, w - strokeW), Math.max(1, h - strokeW));
  const ns = standalone ? ' xmlns="http://www.w3.org/2000/svg"' : '';
  return (
    `<svg${ns} width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" overflow="visible">${defs}` +
    `<path transform="translate(${pad} ${pad})" d="${d}" fill="${fill}" fill-rule="evenodd" ` +
    `stroke="${stroke && stroke !== 'none' && strokeW ? stroke : 'none'}" stroke-width="${strokeW}" stroke-linejoin="round"/></svg>`
  );
}

// ---- DOM -------------------------------------------------------------------

const VALIGN = { top: 'flex-start', middle: 'center', bottom: 'flex-end' };

export function textCss(style) {
  return {
    fontFamily: `'${style.fontFamily}', 'Space Grotesk', sans-serif`,
    fontSize: `${style.fontSize}px`,
    color: style.color,
    textAlign: style.align,
    lineHeight: String(style.lineHeight),
    fontWeight: style.bold ? '700' : '400',
    justifyContent: VALIGN[style.valign] || 'flex-start',
  };
}

/** Cria o nó DOM de um elemento. `editing` mostra os textos/espaços vazios de exemplo. */
export function renderElement(el, { editing = false } = {}) {
  const node = document.createElement('div');
  node.className = `el el-${el.type}`;
  node.dataset.id = el.id;
  Object.assign(node.style, { left: `${el.x}px`, top: `${el.y}px`, width: `${el.w}px`, height: `${el.h}px` });
  if (el.opacity !== undefined && el.opacity < 1) node.style.opacity = el.opacity;
  if (el.locked) node.classList.add('locked');

  if (el.type === 'text') {
    const body = document.createElement('div');
    body.className = 'txt';
    body.innerHTML = el.html || '';
    if (el.placeholder) body.dataset.ph = el.placeholder;
    Object.assign(node.style, textCss(el.style));
    if (!editing && !hasText(el.html)) node.classList.add('empty');
    node.appendChild(body);
  } else if (el.type === 'image') {
    const clip = maskPath(el.mask, el.w, el.h);
    if (clip) node.style.clipPath = `path('${clip}')`;
    // Recorte livre (formato vindo dos modelos do PowerPoint): a foto continua no
    // formato mesmo quando é trocada.
    if (el.maskSrc) {
      const m = `url('${el.maskSrc}')`;
      Object.assign(node.style, { webkitMaskImage: m, maskImage: m, webkitMaskSize: '100% 100%', maskSize: '100% 100%', webkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat' });
    }
    if (el.src) {
      const img = document.createElement('img');
      img.src = el.src;
      img.alt = '';
      img.draggable = false;
      img.style.objectFit = el.fit || 'cover';
      node.appendChild(img);
    } else {
      node.classList.add('placeholder');
      if (editing) node.innerHTML = `<span>${esc(el.placeholder || 'Clique duas vezes para inserir uma imagem')}</span>`;
    }
  } else if (el.type === 'chart') {
    node.innerHTML = chartSvg(el);
  } else if (el.type === 'table') {
    node.innerHTML = tableHtml(el);
  } else {
    node.innerHTML = shapeSvg(el);
  }
  return node;
}

// ---- Gráfico (barras/linhas) ------------------------------------------------

/** Escala "redonda" para o eixo Y (0, 20, 40… ou 0, 250, 500…). */
export function niceScale(max, ticks = 5) {
  if (!(max > 0)) return { max: 1, step: 0.2 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  return { max: Math.ceil(max / step) * step, step };
}

const fmtNum = (v) => (Math.round(v * 100) / 100).toLocaleString('pt-BR');

/**
 * el = { chartType: 'bar'|'line', categories: [..], series: [{ name, color, values: [..] }],
 *        title, showValues, showLegend, textColor, gridColor }
 * Desenha em SVG no tamanho do elemento (vale para tela, PDF e miniaturas).
 */
export function chartSvg(el) {
  const W0 = el.w;
  const H0 = el.h;
  const cats = el.categories || [];
  const series = (el.series || []).filter((s) => s && Array.isArray(s.values));
  const tc = el.textColor || '#0F252F';
  const gc = el.gridColor || '#D9E2E6';
  const fs = Math.max(14, Math.min(26, H0 / 24));
  const top = (el.title ? fs * 2.4 : fs) + 4;
  const legendH = el.showLegend !== false && series.length ? fs * 2.2 : 0;
  const bottom = fs * 2 + legendH;
  const vals = series.flatMap((s) => s.values.map(Number).filter((n) => Number.isFinite(n)));
  const maxV = Math.max(0, ...vals);
  const { max, step } = niceScale(maxV * (el.showValues !== false ? 1.08 : 1));
  const tickLabels = [];
  for (let v = 0; v <= max + 1e-9; v += step) tickLabels.push(v);
  const left = fs * 0.8 + Math.max(...tickLabels.map((v) => fmtNum(v).length)) * fs * 0.62;
  const right = fs;
  const pw = Math.max(10, W0 - left - right);
  const ph = Math.max(10, H0 - top - bottom);
  const y = (v) => top + ph - (Number(v) / max) * ph;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W0}" height="${H0}" viewBox="0 0 ${W0} ${H0}" font-family="Space Grotesk, sans-serif">`;
  if (el.title) s += `<text x="${W0 / 2}" y="${fs * 1.3}" text-anchor="middle" font-size="${fs * 1.1}" font-weight="700" fill="${tc}">${esc(el.title)}</text>`;
  for (const v of tickLabels) {
    s += `<line x1="${left}" x2="${left + pw}" y1="${y(v)}" y2="${y(v)}" stroke="${gc}" stroke-width="1.5"/>`;
    s += `<text x="${left - fs * 0.5}" y="${y(v) + fs * 0.35}" text-anchor="end" font-size="${fs * 0.85}" fill="${tc}" opacity=".7">${fmtNum(v)}</text>`;
  }
  const n = Math.max(1, cats.length);
  const band = pw / n;
  cats.forEach((c, i) => {
    s += `<text x="${left + band * (i + 0.5)}" y="${top + ph + fs * 1.4}" text-anchor="middle" font-size="${fs * 0.9}" fill="${tc}">${esc(c)}</text>`;
  });
  if (el.chartType === 'line') {
    for (const se of series) {
      const pts = cats.map((_, i) => [left + band * (i + 0.5), y(se.values[i] || 0)]);
      s += `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${se.color}" stroke-width="${fs * 0.22}" stroke-linejoin="round"/>`;
      pts.forEach((p, i) => {
        s += `<circle cx="${p[0]}" cy="${p[1]}" r="${fs * 0.3}" fill="${se.color}"/>`;
        if (el.showValues) s += `<text x="${p[0]}" y="${p[1] - fs * 0.6}" text-anchor="middle" font-size="${fs * 0.75}" fill="${tc}">${fmtNum(se.values[i] || 0)}</text>`;
      });
    }
  } else {
    const k = series.length || 1;
    const gap = band * 0.2;
    const bw = (band - gap * 2) / k;
    series.forEach((se, si) => {
      cats.forEach((_, i) => {
        const v = Number(se.values[i]) || 0;
        const x = left + band * i + gap + bw * si;
        s += `<rect x="${x + bw * 0.06}" y="${y(v)}" width="${bw * 0.88}" height="${top + ph - y(v)}" fill="${se.color}" rx="${Math.min(6, bw * 0.08)}"/>`;
        if (el.showValues !== false) s += `<text x="${x + bw / 2}" y="${y(v) - fs * 0.35}" text-anchor="middle" font-size="${fs * 0.8}" font-weight="600" fill="${tc}">${fmtNum(v)}</text>`;
      });
    });
  }
  s += `<line x1="${left}" x2="${left + pw}" y1="${top + ph}" y2="${top + ph}" stroke="${tc}" stroke-opacity=".35" stroke-width="2"/>`;
  if (legendH) {
    const items = series.map((se) => ({ se, w: fs * 1.6 + esc(se.name || '').length * fs * 0.55 + fs }));
    const total = items.reduce((a, b) => a + b.w, 0);
    let lx = Math.max(left, (W0 - total) / 2);
    const ly = H0 - fs * 0.9;
    for (const it of items) {
      s += `<rect x="${lx}" y="${ly - fs * 0.75}" width="${fs * 0.9}" height="${fs * 0.9}" rx="3" fill="${it.se.color}"/>`;
      s += `<text x="${lx + fs * 1.25}" y="${ly}" font-size="${fs * 0.85}" fill="${tc}">${esc(it.se.name || '')}</text>`;
      lx += it.w;
    }
  }
  return `${s}</svg>`;
}

// ---- Tabela -----------------------------------------------------------------

/**
 * el = { rows: [[texto, …], …], colWidths: [frações], header: true, fontSize, textColor,
 *        headerFill, headerColor, stripeFill, borderColor, align: [por coluna] }
 */
export function tableHtml(el) {
  const rows = el.rows || [];
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const widths = (el.colWidths && el.colWidths.length === cols ? el.colWidths : Array(cols).fill(1 / cols)).map((w) => `${(w * 100).toFixed(3)}%`);
  const rh = el.h / Math.max(1, rows.length);
  const fs = el.fontSize || 24;
  let html = `<table class="tbl" style="font-size:${fs}px;color:${el.textColor || '#0F252F'}"><colgroup>${widths.map((w) => `<col style="width:${w}">`).join('')}</colgroup>`;
  rows.forEach((r, ri) => {
    const isHead = el.header !== false && ri === 0;
    const bg = isHead ? el.headerFill || '#1B4745' : (ri % 2 === 1 ? el.stripeFill || '#E8F6E6' : '#FFFFFF');
    const color = isHead ? el.headerColor || '#FFFFFF' : '';
    html += `<tr style="height:${rh}px;background:${bg};${color ? `color:${color};` : ''}">`;
    for (let c = 0; c < cols; c++) {
      const a = (el.align && el.align[c]) || 'left';
      html += `<td style="text-align:${a};${isHead ? 'font-weight:700;' : ''}border-bottom:1px solid ${el.borderColor || '#D9E2E6'}">${esc(r[c] ?? '')}</td>`;
    }
    html += '</tr>';
  });
  return `${html}</table>`;
}

export function hasText(html) {
  if (!html) return false;
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent.trim().length > 0;
}

export function renderSlide(slide, opts = {}) {
  const node = document.createElement('div');
  node.className = 'slide';
  node.style.width = `${W}px`;
  node.style.height = `${H}px`;
  node.style.background = slide.bg || '#fff';
  for (const el of slide.elements) node.appendChild(renderElement(el, opts));
  return node;
}

/** Monta o slide escalado para caber no contêiner (miniaturas). */
export function mountThumb(container, slide) {
  container.classList.add('thumb');
  container.replaceChildren(renderSlide(slide));
  const fit = () => {
    const s = container.clientWidth / W;
    if (s > 0) container.firstChild.style.transform = `scale(${s})`;
  };
  fit();
  if (!container._ro) {
    container._ro = new ResizeObserver(fit);
    container._ro.observe(container);
  } else {
    container._fit = fit;
  }
  return container;
}

// ---- Utilidades de página ------------------------------------------------

export function readBoot() {
  const el = document.getElementById('boot');
  return el ? JSON.parse(el.textContent) : {};
}

const csrf = () => document.querySelector('meta[name="csrf-token"]')?.content || '';

export async function api(method, url, body) {
  const opts = { method, headers: { 'x-csrf-token': csrf() } };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    /* sem corpo */
  }
  if (!res.ok) throw new Error(data.error || `Erro ${res.status}`);
  return data;
}

let toastTimer;
export function toast(msg, kind = '') {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.className = `toast ${kind}`;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3200);
}

export function fmtDate(sqlDate) {
  const d = new Date(`${sqlDate.replace(' ', 'T')}Z`);
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
