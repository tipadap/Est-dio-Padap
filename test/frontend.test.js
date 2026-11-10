'use strict';

// Testes da parte visual que roda no navegador (layouts, modelos, fundos e desenho das formas),
// executados no Node. Os módulos de src/public/js são ES modules: são copiados para uma pasta
// temporária marcada como "type: module" e importados de lá.
const { test, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { cleanPresentation } = require('../src/lib/sanitize');

const PUBLIC = path.join(__dirname, '..', 'src', 'public');
let R; // render.js
let T; // templates.js

before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-front-'));
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}');
  for (const f of fs.readdirSync(path.join(PUBLIC, 'js'))) {
    if (f.endsWith('.js')) fs.copyFileSync(path.join(PUBLIC, 'js', f), path.join(dir, f));
  }
  R = await import(pathToFileURL(path.join(dir, 'render.js')).href);
  T = await import(pathToFileURL(path.join(dir, 'templates.js')).href);
});

/** Confere que o slide passa pela validação do servidor sem perder nada. */
function checkSlide(slide, label) {
  const ids = slide.elements.map((e) => e.id);
  assert.strictEqual(new Set(ids).size, ids.length, `${label}: ids repetidos`);
  const clean = cleanPresentation({ slides: [slide] }).slides[0];
  assert.strictEqual(clean.elements.length, slide.elements.length, `${label}: a validação descartou elementos`);
  slide.elements.forEach((el, i) => {
    const c = clean.elements[i];
    assert.strictEqual(c.type, el.type, `${label}: tipo do elemento ${i}`);
    for (const k of ['x', 'y', 'w', 'h']) assert.strictEqual(c[k], el[k], `${label}: ${k} do elemento ${i} (${el.type})`);
    if (el.type === 'image') {
      assert.strictEqual(c.src, el.src, `${label}: imagem ${el.src}`);
      if (el.maskSrc) assert.strictEqual(c.maskSrc, el.maskSrc, `${label}: recorte ${el.maskSrc}`);
      for (const u of [el.src, el.maskSrc].filter((s) => s && s.startsWith('/static/'))) {
        assert.ok(fs.existsSync(path.join(PUBLIC, u.replace('/static/', ''))), `${label}: arquivo não existe ${u}`);
      }
    }
    if (el.type === 'shape') {
      for (const k of ['shape', 'fill', 'fill2', 'stroke']) assert.strictEqual(c[k], el[k], `${label}: ${k} da forma ${i}`);
      const svg = R.shapeSvg(el);
      assert.ok(!/NaN|undefined/.test(svg), `${label}: SVG inválido na forma ${el.shape}`);
    }
    if (el.type === 'chart') assert.ok(!/NaN|undefined/.test(R.chartSvg(el)), `${label}: gráfico inválido`);
    if (el.type === 'table') assert.ok(!/undefined/.test(R.tableHtml(el)), `${label}: tabela inválida`);
  });
  return clean;
}

test('todos os layouts (básicos, Modelos PADAP e Fundos) passam inteiros pela validação', () => {
  const keys = [...T.LAYOUT_ORDER, ...T.PADAP_LAYOUT_ORDER, ...T.FUNDOS_LAYOUT_ORDER];
  assert.strictEqual(new Set(keys).size, keys.length, 'chaves repetidas');
  for (const k of keys) {
    assert.ok(T.LAYOUTS[k], `layout ${k} existe`);
    checkSlide(T.LAYOUTS[k].build({}), `layout ${k} (${T.LAYOUTS[k].name})`);
  }
  assert.strictEqual(T.PADAP_LAYOUT_ORDER.length, 22);
  assert.strictEqual(T.FUNDOS_LAYOUT_ORDER.length, 30);
});

test('fundos: só decoração bloqueada, sem texto, com o logo da marca', () => {
  for (const k of T.FUNDOS_LAYOUT_ORDER) {
    const s = T.LAYOUTS[k].build({});
    assert.ok(s.elements.length > 0, k);
    assert.ok(s.elements.every((e) => e.locked), `${k}: decoração deve ser bloqueada`);
    assert.ok(!s.elements.some((e) => e.type === 'text'), `${k}: fundo não tem texto`);
    assert.ok(s.elements.some((e) => e.type === 'image' && /padap-logo-(verde|branco)\.png$/.test(e.src)), `${k}: logo`);
  }
});

test('modelos prontos: cada apresentação monta e valida', () => {
  for (const t of T.TEMPLATES) {
    const p = T.buildPresentation(t.id);
    assert.strictEqual(p.title, t.name);
    assert.ok(p.data.slides.length > 0, t.id);
    p.data.slides.forEach((s, i) => checkSlide(s, `${t.id} slide ${i + 1}`));
    // a apresentação inteira também passa pela validação
    assert.strictEqual(cleanPresentation(p.data).slides.length, p.data.slides.length, t.id);
  }
  // modelo desconhecido cai numa apresentação em branco
  assert.strictEqual(T.buildPresentation('nao-existe').data.slides.length, 1);
});

test('cada slide montado é independente (ids novos a cada uso)', () => {
  const a = T.LAYOUTS.padap1.build({});
  const b = T.LAYOUTS.padap1.build({});
  assert.notStrictEqual(a.id, b.id);
  assert.notStrictEqual(a.elements[0].id, b.elements[0].id);
  a.elements[0].x = 999;
  assert.notStrictEqual(T.LAYOUTS.padap1.build({}).elements[0].x, 999, 'alterar um slide não altera o modelo');
});

test('formas: degradês diferentes não compartilham o mesmo id (vários SVGs na página)', () => {
  const g1 = R.shapeSvg({ shape: 'leaf', w: 100, h: 100, fill: '#072B35', fill2: '#1DBD2C', gradAngle: 45 });
  const g2 = R.shapeSvg({ shape: 'leaf', w: 100, h: 100, fill: '#1DBD2C', fill2: '#0F4C4F', gradAngle: 45 });
  const id = (s) => s.match(/linearGradient id="([^"]+)"/)[1];
  assert.notStrictEqual(id(g1), id(g2));
  assert.ok(g1.includes(`url(#${id(g1)})`));
  for (const kind of ['rect', 'round', 'ellipse', 'leaf', 'leafAlt', 'triangle', 'arrow', 'line', 'arc', 'arch', 'symbol', 'symbolOutline']) {
    const svg = R.shapeSvg({ shape: kind, w: 300, h: 200, fill: '#1DBD2C', stroke: '#072B35', strokeWidth: 4 });
    assert.ok(/<path [^>]*d="M/.test(svg) && !/NaN|undefined/.test(svg), `forma ${kind}`);
  }
});
