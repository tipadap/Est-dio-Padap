// Passo 2 de 2: converte a extração do PowerPoint (.cache-modelos/slides.json + PNGs, gerados por
// extrair.ps1) em slides do Estúdio PADAP.
//
//   node scripts/modelos-pptx/converter.js [pasta-da-extracao]
//
// Saída: src/public/js/modelos-padap.js e src/public/img/modelos-padap/ (recriada do zero).
// Os nomes dos modelos (NAMES) e os dados dos gráficos (CHARTS) ficam abaixo: se o PPTX mudar de
// ordem ou ganhar slides, ajuste essas listas.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const EXT = path.resolve(process.argv[2] || path.join(ROOT, '.cache-modelos')) + '/';
const PROJ = path.join(ROOT, 'src/public') + '/';
const IMG_DIR = PROJ + 'img/modelos-padap/';
const URL = '/static/img/modelos-padap/';
const OUT_JS = PROJ + 'js/modelos-padap.js';

const NAMES = [
  'Capa escura com foto', 'Capa com foto cheia', 'Capa clara com foto', 'Sumário', 'Divisor de seção (01)',
  'Quem somos', 'Números em destaque', 'Linhas de solução', 'Divisor de seção (02)', 'Vitrine de produtos',
  'Produto em destaque', 'Marcas parceiras', 'Culturas atendidas', 'Caso de campo', 'Resultados (gráfico)',
  'Comparativo em 2 colunas', 'Etapas do planejamento', 'Mercado (gráfico)', 'Tabela de cotação',
  'Encerramento com slogan', 'Contatos das lojas', 'Obrigado',
];

// Dados dos 2 gráficos do PPTX (os slides dizem "dados ilustrativos"), agora editáveis.
const CHARTS = {
  15: {
    chartType: 'bar', title: 'Produtividade (t/ha)',
    categories: ['Safra 23/24', 'Safra 24/25', 'Safra 25/26'],
    series: [
      { name: 'Testemunha', color: '#B8C7CB', values: [62, 65, 63] },
      { name: 'Programa PADAP', color: '#46BA3B', values: [71, 76, 79] },
    ],
  },
  18: {
    chartType: 'line', title: 'Preço CFR Brasil (US$/t)', showValues: false,
    categories: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out'],
    series: [
      { name: 'Ureia', color: '#46BA3B', values: [410, 420, 430, 460, 425, 420, 425, 460, 455, 450] },
      { name: 'MAP', color: '#1B4745', values: [640, 655, 665, 690, 705, 700, 705, 720, 735, 730] },
      { name: 'KCl', color: '#9BB7BD', values: [310, 312, 315, 318, 322, 325, 324, 326, 330, 332] },
    ],
  },
};

const arr = (x) => (Array.isArray(x) ? x : x ? [x] : []);
let n = 0;
const uid = (p) => `${p}${(++n).toString(36)}${crypto.randomBytes(3).toString('hex')}`;
const ALIGN = { 1: 'left', 2: 'center', 3: 'right', 4: 'justify' };
const VALIGN = { 1: 'top', 3: 'middle', 4: 'bottom' };
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const px = (pt) => Math.round(pt * 2 * 10) / 10;

function textEl(t, box, opts = {}) {
  const paras = arr(t.paras);
  const runs0 = paras.flatMap((p) => arr(p.runs));
  if (!runs0.length) return null;
  const f = runs0[0];
  const base = {
    fontFamily: 'Space Grotesk',
    fontSize: px(f.size),
    color: f.color,
    align: ALIGN[paras[0].align] || 'left',
    valign: VALIGN[t.anchor] || 'top',
    lineHeight: 1.2,
    bold: !!f.bold,
  };
  const sw = paras[0].spaceWithin;
  if (paras[0].lineRule && sw > 0) base.lineHeight = Math.round(sw * 1.2 * 100) / 100;
  let html = '';
  let inList = false;
  for (const p of paras) {
    const pAlign = ALIGN[p.align] || base.align;
    const runs = arr(p.runs).map((r) => {
      const st = [];
      if (px(r.size) !== base.fontSize) st.push(`font-size:${px(r.size)}px`);
      if (r.color !== base.color) st.push(`color:${r.color}`);
      if (!!r.bold !== base.bold) st.push(`font-weight:${r.bold ? 'bold' : 'normal'}`);
      if (r.italic) st.push('font-style:italic');
      return st.length ? `<span style="${st.join(';')}">${esc(r.text)}</span>` : esc(r.text);
    }).join('');
    const content = runs || '<br>';
    const alignStyle = pAlign !== base.align ? ` style="text-align:${pAlign}"` : '';
    if (p.bullet) {
      if (!inList) { html += '<ul>'; inList = true; }
      html += `<li${alignStyle}>${content}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<div${alignStyle}>${content}</div>`;
    }
  }
  if (inList) html += '</ul>';
  const ml = opts.ml ?? t.ml, mr = opts.mr ?? t.mr, mt = opts.mt ?? t.mt, mb = opts.mb ?? t.mb;
  return {
    id: uid('e'), type: 'text',
    x: Math.round(box.x + ml), y: Math.round(box.y + mt),
    w: Math.max(20, Math.round(box.w - ml - mr)), h: Math.max(20, Math.round(box.h - mt - mb)),
    html, placeholder: 'Digite seu texto', style: base,
  };
}

const written = new Map(); // hash -> url (evita arquivos repetidos, ex.: fundos iguais)
async function save(buf, name, kind) {
  // o tipo entra no hash: foto e máscara partem do mesmo PNG, mas são arquivos diferentes
  const hash = kind + crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
  if (written.has(hash)) return written.get(hash);
  let out, file;
  if (kind === 'bg') {
    file = `${name}.jpg`;
    out = await sharp(buf).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  } else if (kind === 'mask') {
    file = `${name}.png`;
    // só o canal alfa importa; baixa resolução basta
    out = await sharp(buf).ensureAlpha().extractChannel(3).resize({ width: 400, withoutEnlargement: true }).toColourspace('b-w')
      .png({ compressionLevel: 9 }).toBuffer();
    // máscara precisa de alfa: branco opaco onde há foto
    const a = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const rgba = Buffer.alloc(a.info.width * a.info.height * 4, 255);
    for (let i = 0; i < a.info.width * a.info.height; i++) rgba[i * 4 + 3] = a.data[i * a.info.channels];
    out = await sharp(rgba, { raw: { width: a.info.width, height: a.info.height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
  } else {
    file = `${name}.webp`;
    out = await sharp(buf).webp({ quality: 84, alphaQuality: 100, effort: 6 }).toBuffer();
  }
  fs.writeFileSync(IMG_DIR + file, out);
  const url = URL + file;
  written.set(hash, url);
  return url;
}

// Ajusta a caixa quando a imagem exportada inclui sombra/contorno além da forma.
async function boxFor(file, box) {
  const m = await sharp(EXT + file).metadata();
  const w = Math.max(box.w, 1), h = Math.max(box.h, 1);
  if (Math.abs(m.width / w - 1) < 0.04 && Math.abs(m.height / h - 1) < 0.04) return { x: box.x, y: box.y, w, h };
  return { x: Math.round(box.x - (m.width - w) / 2), y: Math.round(box.y - (m.height - h) / 2), w: m.width, h: m.height };
}

async function hasTransparency(file) {
  const { data, info } = await sharp(EXT + file).ensureAlpha().extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  let t = 0;
  for (let i = 0; i < data.length; i++) if (data[i] < 250) t++;
  return t / (info.width * info.height) > 0.01;
}

(async () => {
  if (!fs.existsSync(EXT + 'slides.json')) throw new Error(`Não achei ${EXT}slides.json. Rode antes o extrair.ps1.`);
  fs.rmSync(IMG_DIR, { recursive: true, force: true });
  fs.mkdirSync(IMG_DIR, { recursive: true });
  const slides = JSON.parse(fs.readFileSync(EXT + 'slides.json', 'utf8').replace(/^\uFEFF/, ''));
  const result = [];
  for (const sl of slides) {
    const si = sl.index;
    const els = [];
    const bgUrl = await save(fs.readFileSync(EXT + sl.bg), `s${si}-fundo`, 'bg');
    els.push({ id: uid('e'), type: 'image', x: 0, y: 0, w: 1920, h: 1080, src: bgUrl, mask: 'none', fit: 'cover', placeholder: '', locked: true });
    for (const it of arr(sl.items)) {
      const b = it.box;
      if (it.kind === 'pic') {
        const box = await boxFor(it.file, b);
        const buf = fs.readFileSync(EXT + it.file);
        const isPhoto = box.w >= 300 && box.h >= 300;
        const el = { id: uid('e'), type: 'image', ...box, src: await save(buf, `s${si}-${it.i}-foto`, 'img'), mask: 'none', fit: isPhoto ? 'cover' : 'contain', placeholder: '' };
        if (isPhoto && (await hasTransparency(it.file))) el.maskSrc = await save(buf, `s${si}-${it.i}-recorte`, 'mask');
        els.push(el);
      } else if (it.kind === 'chart' && CHARTS[si]) {
        els.push({ id: uid('e'), type: 'chart', x: b.x, y: b.y, w: b.w, h: b.h, showValues: true, showLegend: true, textColor: '#0F252F', gridColor: '#E1E8EA', ...CHARTS[si] });
      } else if (it.kind === 'visual' || it.kind === 'chart') {
        const box = await boxFor(it.file, b);
        els.push({ id: uid('e'), type: 'image', ...box, src: await save(fs.readFileSync(EXT + it.file), `s${si}-${it.i}-${it.kind === 'chart' ? 'grafico' : 'forma'}`, 'img'), mask: 'none', fit: 'fill' === 'x' ? 'cover' : 'contain', placeholder: '', ...(it.kind === 'visual' ? { locked: true } : {}) });
      } else if (it.kind === 'shape') {
        const shape = it.ast === 9 ? 'ellipse' : it.ast === 5 ? 'round' : 'rect';
        const el = { id: uid('e'), type: 'shape', shape, x: b.x, y: b.y, w: b.w, h: b.h, fill: it.fill, stroke: it.line, strokeWidth: Math.round(it.lineW || 0) };
        if (it.fill !== 'none' && it.fillTransp > 0) el.opacity = Math.round((1 - it.fillTransp) * 100) / 100;
        els.push(el);
      } else if (it.kind === 'table') {
        // tabela de verdade (linhas/colunas editáveis), com as cores e larguras do PPTX
        const cells = arr(it.cells);
        const xs = [...new Set(cells.map((c) => c.x))].sort((p, q) => p - q);
        const ys = [...new Set(cells.map((c) => c.y))].sort((p, q) => p - q);
        const at = (r, c) => cells.find((k) => k.y === ys[r] && k.x === xs[c]);
        const plain = (c) => (c && c.text ? arr(c.text.paras).map((p) => arr(p.runs).map((r) => r.text).join('')).join(' ') : '');
        const x0 = xs[0], y0 = ys[0];
        const last = cells.reduce((m, c) => (c.x + c.w > m.x + m.w ? c : m), cells[0]);
        const tw = last.x + last.w - x0;
        const th = Math.max(...cells.map((c) => c.y + c.h)) - y0;
        const body = at(1, 0);
        const firstRun = (c) => arr(c && c.text && c.text.paras).flatMap((p) => arr(p.runs))[0];
        els.push({
          id: uid('e'), type: 'table', x: x0, y: y0, w: tw, h: th,
          rows: ys.map((_, r) => xs.map((__, c) => plain(at(r, c)))),
          colWidths: xs.map((_, c) => Math.round((at(0, c).w / tw) * 1000) / 1000),
          align: xs.map((_, c) => ({ 1: 'left', 2: 'center', 3: 'right' }[arr(at(1, c) && at(1, c).text && at(1, c).text.paras)[0]?.align] || 'left')),
          header: true,
          fontSize: px((firstRun(body) || { size: 12 }).size),
          textColor: (firstRun(body) || { color: '#0F252F' }).color,
          headerFill: at(0, 0).fill || '#1B4745',
          headerColor: (firstRun(at(0, 0)) || { color: '#FFFFFF' }).color,
          stripeFill: (at(1, 0) && at(1, 0).fill) || '#E8F6E6',
          borderColor: '#E1E8EA',
        });
      }
      // número de página fixo (vira errado ao reordenar): não entra no modelo
      const plain = arr(it.text && it.text.paras).flatMap((p) => arr(p.runs)).map((r) => r.text).join('').trim();
      if (it.kind === 'text' && /^[0-9]{1,2}$/.test(plain) && b.y > 950) continue;
      if (it.text && it.kind !== 'table') {
        const t = textEl(it.text, b);
        if (t) els.push(t);
      }
    }
    result.push({ key: `padap${si}`, name: NAMES[si - 1] || `Slide ${si}`, slide: { id: `s${si}`, bg: '#FFFFFF', notes: '', elements: els } });
  }
  const header = '// Gerado automaticamente a partir de Modelos_Slides_PADAP.pptx (22 modelos). Não edite à mão.\n';
  fs.writeFileSync(OUT_JS, `${header}export const PADAP_SLIDES = ${JSON.stringify(result)};\n`);
  const total = fs.readdirSync(IMG_DIR).reduce((s, f) => s + fs.statSync(IMG_DIR + f).size, 0);
  console.log(`${result.length} slides, ${result.reduce((s, r) => s + r.slide.elements.length, 0)} elementos, ${fs.readdirSync(IMG_DIR).length} imagens (${(total / 1024 / 1024).toFixed(1)} MB), js ${(fs.statSync(OUT_JS).size / 1024).toFixed(0)} KB`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
