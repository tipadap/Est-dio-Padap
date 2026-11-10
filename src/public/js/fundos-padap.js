// 30 fundos de slide com a identidade PADAP (Brandbook: cores, grafismo de folha, símbolo e logo).
// Só decoração (bloqueada, para não sair do lugar sem querer); o conteúdo é por conta de quem edita.
import { BRAND, uid } from './render.js';

const TEAL = BRAND.teal; // #072B35
const TEAL2 = BRAND.teal2; // #0F4C4F
const GREEN = BRAND.green; // #1DBD2C
const GREEN_D = '#169A23';
const MINT = BRAND.greenLight; // #E8F8EA
const MINT2 = BRAND.greenSoft; // #BFEFC5
const WHITE = '#FFFFFF';
const W = 1920;
const H = 1080;
const LOGO_RATIO = 2560 / 882;

/** Forma decorativa bloqueada. */
const sh = (shape, x, y, w, h, fill, extra = {}) => ({ id: uid(), type: 'shape', shape, x, y, w, h, fill, stroke: 'none', strokeWidth: 0, locked: true, ...extra });
/** Contorno (sem preenchimento). */
const line = (shape, x, y, w, h, color = GREEN, width = 3, extra = {}) => sh(shape, x, y, w, h, 'none', { stroke: color, strokeWidth: width, ...extra });
/** Retângulo de fundo inteiro, liso ou em degradê. */
const full = (fill, fill2, angle = 45) => sh('rect', 0, 0, W, H, fill, fill2 ? { fill2, gradAngle: angle } : {});
const logo = (variant, x, y, w) => ({
  id: uid(), type: 'image', x, y, w, h: Math.round(w / LOGO_RATIO), src: `/static/img/padap-logo-${variant}.png`, mask: 'none', fit: 'contain', placeholder: '', locked: true,
});
const slide = (bg, elements) => ({ id: uid('s'), bg, notes: '', elements });

// posições padrão do logo
const logoTL = (v = 'verde') => logo(v, 110, 80, 240);
const logoBR = (v = 'verde') => logo(v, 1640, 975, 190);
const logoTR = (v = 'verde') => logo(v, 1580, 70, 230);

const FUNDOS = [
  // ---------------- Claros ----------------
  ['Claro — folha no canto', () => slide(WHITE, [
    sh('leaf', 1460, 640, 560, 560, MINT),
    sh('leaf', 1610, 790, 360, 360, GREEN, { fill2: TEAL2, gradAngle: 45 }),
    line('leaf', 1380, 560, 640, 640),
    logoTL(),
  ])],
  ['Claro — duas folhas', () => slide(WHITE, [
    sh('leaf', -160, -240, 620, 520, MINT2, { fill2: WHITE, gradAngle: 60 }),
    line('leaf', -60, -160, 600, 520, GREEN, 3),
    sh('leafAlt', 1520, 700, 520, 520, MINT2, { fill2: WHITE, gradAngle: 240 }),
    line('leafAlt', 1580, 760, 480, 480, GREEN, 3),
    logoTR(),
  ])],
  ['Claro — faixa lateral', () => slide(WHITE, [
    sh('rect', 0, 0, 28, H, TEAL),
    sh('rect', 28, 0, 10, H, GREEN),
    sh('leaf', 1700, -120, 340, 340, MINT),
    logoBR(),
  ])],
  ['Claro — arco suave', () => slide(WHITE, [
    sh('ellipse', -520, 560, 1040, 1040, MINT),
    line('ellipse', -600, 480, 1200, 1200, GREEN, 3),
    line('ellipse', -440, 640, 880, 880, MINT2, 2),
    logoTR(),
  ])],
  ['Claro — símbolo em marca d’água', () => slide(WHITE, [
    sh('symbol', 1180, 140, 700, 812, MINT),
    logoTL(),
    sh('rect', 110, 980, 160, 8, GREEN),
  ])],
  ['Claro — moldura de folha', () => slide(WHITE, [
    line('leaf', 70, 70, 1780, 940, MINT2, 4),
    sh('leaf', 1640, 820, 210, 190, GREEN, { fill2: TEAL2, gradAngle: 45 }),
    logo('verde', 150, 120, 220),
  ])],
  ['Claro — rodapé escuro', () => slide(WHITE, [
    sh('rect', 0, 950, W, 130, TEAL),
    sh('rect', 0, 942, W, 8, GREEN),
    sh('leaf', 1560, 880, 260, 200, TEAL2),
    logo('branco', 110, 975, 230),
  ])],
  ['Claro — topo em degradê', () => slide(WHITE, [
    sh('rect', 0, 0, W, 200, GREEN, { fill2: TEAL, gradAngle: 0 }),
    sh('leafAlt', 1660, 140, 160, 150, GREEN, { fill2: GREEN_D, gradAngle: 45 }),
    line('leafAlt', 1620, 100, 220, 210, MINT2, 2),
    logo('branco', 110, 55, 260),
  ])],
  ['Claro — folhas em coluna', () => slide(WHITE, [
    sh('leaf', 1660, 80, 160, 160, MINT),
    sh('leaf', 1660, 280, 160, 160, MINT2),
    sh('leaf', 1660, 480, 160, 160, GREEN, { fill2: GREEN_D, gradAngle: 45 }),
    sh('leaf', 1660, 680, 160, 160, TEAL2),
    line('leaf', 1660, 880, 160, 160, GREEN, 3),
    logoTL(),
  ])],
  ['Claro — cartão central', () => slide('#F3F7F8', [
    full('#F3F7F8'),
    sh('round', 140, 120, 1640, 840, WHITE),
    line('round', 140, 120, 1640, 840, '#DFE7EA', 2),
    sh('leaf', 1660, 860, 200, 180, GREEN, { fill2: TEAL2, gradAngle: 45 }),
    logo('verde', 200, 170, 200),
  ])],

  // ---------------- Escuros ----------------
  ['Escuro — folha verde', () => slide(TEAL, [
    full(TEAL),
    sh('leaf', 1300, 520, 720, 640, GREEN, { fill2: TEAL, gradAngle: 45, opacity: 0.7 }),
    line('leaf', 1220, 440, 760, 680, GREEN, 3),
    logoTL('branco'),
  ])],
  ['Escuro — degradê diagonal', () => slide(TEAL, [
    full(TEAL, TEAL2, 30),
    line('leaf', -120, -200, 640, 560, GREEN, 3),
    sh('leaf', -200, -260, 560, 480, GREEN, { fill2: TEAL, gradAngle: 45, opacity: 0.35 }),
    logoBR('branco'),
  ])],
  ['Escuro — símbolo grande', () => slide(TEAL, [
    full(TEAL),
    sh('symbol', 1120, 80, 800, 928, TEAL2),
    line('symbolOutline', 1060, 40, 800, 928, GREEN, 3, { opacity: 0.6 }),
    logoTL('branco'),
  ])],
  ['Escuro — painéis de vidro', () => slide(TEAL, [
    full(TEAL, '#0B3F44', 90),
    sh('leaf', 1180, 340, 820, 820, WHITE, { opacity: 0.05 }),
    line('leaf', 1180, 340, 820, 820, GREEN, 2, { opacity: 0.5 }),
    sh('leaf', 1440, 600, 560, 560, WHITE, { opacity: 0.07 }),
    line('leaf', 1440, 600, 560, 560, GREEN, 2, { opacity: 0.7 }),
    sh('leaf', 1690, 850, 300, 300, GREEN, { fill2: TEAL2, gradAngle: 45 }),
    logoTL('branco'),
  ])],
  ['Escuro — brilho verde', () => slide(TEAL, [
    full(TEAL),
    sh('ellipse', 1100, 300, 1400, 1400, GREEN, { fill2: TEAL, gradAngle: 135, opacity: 0.45 }),
    logoTL('branco'),
  ])],
  ['Escuro — arcos concêntricos', () => slide(TEAL, [
    full(TEAL),
    line('ellipse', 1340, 500, 1160, 1160, GREEN, 3),
    line('ellipse', 1500, 660, 840, 840, GREEN, 2, { opacity: 0.6 }),
    line('ellipse', 1660, 820, 520, 520, MINT2, 2, { opacity: 0.4 }),
    logoTL('branco'),
  ])],
  ['Escuro — folhas em cascata', () => slide(TEAL, [
    full(TEAL),
    sh('leaf', 1400, 120, 420, 420, TEAL2),
    sh('leaf', 1520, 400, 320, 320, GREEN, { fill2: TEAL2, gradAngle: 45, opacity: 0.8 }),
    sh('leaf', 1610, 640, 220, 220, GREEN),
    line('leaf', 1660, 880, 140, 140, MINT2, 2),
    logoTL('branco'),
  ])],
  ['Escuro — moldura de folha', () => slide(TEAL, [
    full(TEAL),
    line('leaf', 70, 70, 1780, 940, GREEN, 3),
    sh('leaf', 70, 70, 280, 240, GREEN, { opacity: 0.25 }),
    logoBR('branco'),
  ])],
  ['Escuro — divisor de seção', () => slide(TEAL, [
    full(TEAL, TEAL2, 0),
    sh('leaf', -180, 160, 760, 760, GREEN, { fill2: TEAL2, gradAngle: 45, opacity: 0.55 }),
    line('leaf', -120, 220, 760, 760, GREEN, 3),
    logoBR('branco'),
  ])],
  ['Escuro — rodapé verde', () => slide(TEAL, [
    full(TEAL),
    sh('rect', 0, 1000, W, 80, GREEN, { fill2: GREEN_D, gradAngle: 0 }),
    sh('leafAlt', 1600, -80, 400, 360, TEAL2),
    line('leafAlt', 1540, -120, 440, 400, GREEN, 2),
    logo('branco', 110, 80, 240),
  ])],

  // ---------------- Verdes ----------------
  ['Verde — degradê', () => slide(GREEN, [
    full(GREEN, TEAL2, 45),
    line('leaf', 1200, 380, 820, 760, WHITE, 3, { opacity: 0.5 }),
    logoTL('branco'),
  ])],
  ['Verde — folha clara', () => slide(GREEN_D, [
    full(GREEN_D, GREEN, 90),
    sh('leaf', 1180, -160, 900, 820, WHITE, { opacity: 0.12 }),
    sh('leaf', 1420, 520, 600, 600, TEAL, { opacity: 0.25 }),
    logoBR('branco'),
  ])],
  ['Verde claro — suave', () => slide(MINT, [
    full(MINT, WHITE, 120),
    sh('leaf', 1460, 640, 520, 520, WHITE),
    line('leaf', 1400, 580, 560, 560, GREEN, 3),
    sh('leafAlt', -120, -140, 420, 380, MINT2),
    logoTR(),
  ])],
  ['Verde — símbolo', () => slide(GREEN, [
    full(GREEN, GREEN_D, 0),
    line('symbolOutline', 1240, 160, 640, 742, WHITE, 3, { opacity: 0.45 }),
    logoTL('branco'),
  ])],

  // ---------------- Divididos ----------------
  ['Dividido — escuro à esquerda', () => slide(WHITE, [
    sh('leafAlt', -80, -20, 900, 1120, TEAL),
    line('leafAlt', 40, 80, 820, 1000, GREEN, 3),
    logo('branco', 110, 80, 240),
    sh('leaf', 1700, 900, 180, 160, MINT),
  ])],
  ['Dividido — escuro à direita', () => slide(WHITE, [
    sh('leaf', 1100, -20, 900, 1120, TEAL),
    line('leaf', 1060, 80, 820, 1000, GREEN, 3),
    logo('branco', 1580, 960, 230),
    logoTL(),
  ])],
  ['Dividido — topo escuro', () => slide(WHITE, [
    sh('rect', 0, 0, W, 420, TEAL),
    sh('leafAlt', 1300, 200, 700, 440, TEAL),
    line('leafAlt', 1240, 140, 720, 460, GREEN, 3),
    logo('branco', 110, 80, 240),
  ])],
  ['Dividido — coluna verde', () => slide(WHITE, [
    sh('leafAlt', 1380, -40, 600, 1160, GREEN, { fill2: TEAL2, gradAngle: 60 }),
    line('leafAlt', 1330, 40, 560, 1040, MINT2, 2),
    logoTL(),
  ])],
  ['Dividido — cartão sobre o escuro', () => slide(TEAL, [
    full(TEAL, TEAL2, 30),
    sh('round', 360, 170, 1200, 740, WHITE),
    sh('leaf', 1640, 900, 200, 180, GREEN, { opacity: 0.85 }),
    line('leaf', 1590, 850, 250, 230, GREEN, 2),
    logo('branco', 110, 60, 200),
  ])],
  ['Dividido — janela de folha', () => slide(WHITE, [
    sh('leaf', 1080, 140, 900, 1000, TEAL, { fill2: TEAL2, gradAngle: 45 }),
    line('leaf', 1020, 80, 900, 1000, GREEN, 3),
    sh('leaf', 900, 40, 150, 130, GREEN),
    logoTL(),
  ])],
];

/** Fundos no formato dos layouts: { key, name, build }. */
export const PADAP_FUNDOS = FUNDOS.map(([name, build], i) => ({ key: `fundo${i + 1}`, name, build }));
