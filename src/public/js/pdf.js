// Exportação para PDF com um clique: cada slide é desenhado exatamente como na tela
// (SVG foreignObject → canvas, com fontes e imagens embutidas) e vira uma página do PDF.
import { W, H, renderSlide } from './render.js';

function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve(window[globalName]);
    s.onerror = () => reject(new Error('Não foi possível carregar o gerador de PDF.'));
    document.head.appendChild(s);
  });
}

const blobToDataUrl = (blob) =>
  new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });

const cache = new Map();
function dataUrl(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? blobToDataUrl(b) : '')));
  return cache.get(url);
}

let cssPromise;
/** CSS dos slides + fonte Space Grotesk embutida (o SVG desenhado no canvas não busca nada de fora). */
function slideCss() {
  if (!cssPromise) {
    cssPromise = (async () => {
      const css = await (await fetch('/static/css/slide.css')).text();
      const fonts = await Promise.all(
        ['space-grotesk-latin', 'space-grotesk-latin-ext'].map(async (f) => {
          const src = await dataUrl(`/static/fonts/${f}.woff2`);
          return `@font-face{font-family:'Space Grotesk';font-weight:300 700;src:url(${src}) format('woff2');}`;
        })
      );
      return fonts.join('') + css;
    })();
  }
  return cssPromise;
}

/** Troca endereços de imagens (src e máscaras) por data: URLs dentro do nó. */
async function inlineImages(node) {
  for (const img of node.querySelectorAll('img')) img.setAttribute('src', await dataUrl(img.getAttribute('src')));
  for (const el of node.querySelectorAll('[style]')) {
    const st = el.getAttribute('style');
    const m = st.match(/url\((['"]?)(\/[^'")]+)\1\)/g);
    if (!m) continue;
    let out = st;
    for (const u of m) {
      const path = u.replace(/^url\((['"]?)/, '').replace(/['"]?\)$/, '');
      out = out.split(path).join(await dataUrl(path));
    }
    el.setAttribute('style', out);
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao desenhar o slide.'));
    img.src = src;
  });
}

/** Desenha um slide num canvas do tamanho pedido. */
export async function slideToCanvas(slide, width = W) {
  const node = renderSlide(slide);
  node.querySelectorAll('.el-text.empty').forEach((n) => n.remove());
  await inlineImages(node);
  const css = await slideCss();
  const xhtml = new XMLSerializer().serializeToString(node);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">` +
    `<foreignObject x="0" y="0" width="${W}" height="${H}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml"><style>${css.replace(/</g, '\\3c ')}</style>${xhtml}</div>` +
    '</foreignObject></svg>';
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = Math.round((width * H) / W);
  const ctx = c.getContext('2d');
  ctx.fillStyle = slide.bg || '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

/** Gera e baixa o PDF (uma página 16:9 por slide). */
export async function exportPdf(title, slides, onProgress = () => {}) {
  const { jsPDF } = await loadScript('/vendor-pdf/jspdf.umd.min.js', 'jspdf');
  // 13,333 x 7,5 pol. = mesmo tamanho do slide do PowerPoint
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'in', format: [13.333, 7.5], compress: true });
  if (document.fonts) await document.fonts.ready;
  for (const [i, s] of slides.entries()) {
    onProgress(i + 1, slides.length);
    const canvas = await slideToCanvas(s, W);
    if (i > 0) pdf.addPage([13.333, 7.5], 'landscape');
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, 13.333, 7.5, undefined, 'FAST');
  }
  pdf.setProperties({ title, creator: 'Estúdio PADAP' });
  const safe = title.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Apresentação';
  pdf.save(`${safe}.pdf`);
}
