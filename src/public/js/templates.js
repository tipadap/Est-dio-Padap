// Layouts de slide e modelos prontos, com a identidade visual PADAP (Brandbook).
import { BRAND, uid } from './render.js';

const LOGO_RATIO = 2560 / 882;

// ---- Peças --------------------------------------------------------------

const text = (x, y, w, h, html, style = {}, placeholder = '') => ({
  id: uid(),
  type: 'text',
  x, y, w, h,
  html,
  placeholder,
  style: { fontFamily: 'Space Grotesk', fontSize: 36, color: BRAND.teal, align: 'left', valign: 'top', lineHeight: 1.25, bold: false, ...style },
});

const shape = (shapeKind, x, y, w, h, fill, extra = {}) => ({
  id: uid(), type: 'shape', shape: shapeKind, x, y, w, h, fill, stroke: 'none', strokeWidth: 0, ...extra,
});

const photo = (x, y, w, h, mask, placeholder, src = '') => ({
  id: uid(), type: 'image', x, y, w, h, src, mask, fit: 'cover', placeholder,
});

const logo = (x, y, w, variant = 'verde') => ({
  id: uid(), type: 'image', x, y, w, h: Math.round(w / LOGO_RATIO),
  src: `/static/img/padap-logo-${variant}.png`, mask: 'none', fit: 'contain', placeholder: '',
});

const bar = (x, y, w = 150) => shape('rect', x, y, w, 10, BRAND.green);

const ul = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

const slide = (bg, elements) => ({ id: uid('s'), bg, notes: '', elements });

// Decorações recorrentes (grafismo: formas que seguem o desenho do símbolo).
const decor = {
  cornerLight: () => [
    shape('leaf', 1580, 760, 420, 420, BRAND.greenLight, { locked: true }),
    shape('leaf', 1700, 860, 300, 300, BRAND.green, { fill2: BRAND.teal2, gradAngle: 45, locked: true }),
    shape('leaf', 1490, 690, 520, 520, 'none', { stroke: BRAND.green, strokeWidth: 3, locked: true }),
  ],
  cornerDark: () => [
    shape('leaf', -160, -200, 560, 560, BRAND.green, { fill2: BRAND.teal, gradAngle: 45, opacity: 0.45, locked: true }),
    shape('leaf', -60, -120, 520, 520, 'none', { stroke: BRAND.green, strokeWidth: 3, locked: true }),
    shape('leafAlt', 1520, 700, 520, 520, BRAND.green, { fill2: BRAND.teal, gradAngle: 220, opacity: 0.4, locked: true }),
  ],
  blank: () => [
    shape('leaf', -120, -260, 680, 560, BRAND.greenSoft, { fill2: '#FFFFFF', gradAngle: 60, locked: true }),
    shape('leaf', -60, -180, 540, 500, BRAND.green, { fill2: BRAND.greenLight, gradAngle: 45, opacity: 0.55, locked: true }),
    shape('leaf', 0, -120, 640, 560, 'none', { stroke: BRAND.green, strokeWidth: 4, locked: true }),
    shape('leafAlt', 1560, 640, 520, 560, BRAND.greenSoft, { fill2: '#FFFFFF', gradAngle: 250, locked: true }),
    shape('leaf', 1660, 820, 360, 360, BRAND.teal2, { fill2: BRAND.teal, gradAngle: 45, locked: true }),
    shape('leafAlt', 1640, 760, 420, 420, 'none', { stroke: BRAND.green, strokeWidth: 4, locked: true }),
  ],
};

// ---- Layouts ------------------------------------------------------------
// Cada layout recebe um objeto de conteúdo (c) e devolve um slide.

export const LAYOUTS = {
  capa: {
    name: 'Capa',
    build: (c = {}) =>
      slide(BRAND.white, [
        shape('leaf', 1300, 640, 640, 460, BRAND.teal, { locked: true }),
        photo(1000, 0, 920, 900, 'leaf', 'Foto de capa (duplo clique para escolher)', c.photo || ''),
        shape('leaf', 1460, 700, 520, 420, 'none', { stroke: BRAND.green, strokeWidth: 4, locked: true }),
        logo(120, 110, 300),
        text(120, 330, 860, 360, c.title ?? '', { fontSize: 100, bold: true, lineHeight: 1.02, valign: 'bottom' }, 'Título da apresentação'),
        bar(120, 728),
        text(120, 770, 820, 180, c.subtitle ?? '', { fontSize: 42, color: BRAND.teal2 }, 'Subtítulo'),
      ]),
  },
  capaSimples: {
    name: 'Capa simples',
    build: (c = {}) =>
      slide(BRAND.white, [
        ...decor.blank(),
        text(320, 360, 1280, 220, c.title ?? '', { fontSize: 120, bold: true, align: 'center', valign: 'bottom', lineHeight: 1 }, 'Inserir Texto'),
        shape('line', 400, 610, 1120, 4, '#C9D6D9', { stroke: '#C9D6D9', strokeWidth: 3, locked: true }),
        text(320, 640, 1280, 120, c.subtitle ?? '', { fontSize: 54, align: 'center', color: BRAND.teal2 }, 'Subtítulo'),
      ]),
  },
  secao: {
    name: 'Seção',
    build: (c = {}) =>
      slide(BRAND.teal, [
        ...decor.cornerDark(),
        text(160, 300, 600, 260, c.number ?? '01', { fontSize: 220, bold: true, color: BRAND.green, lineHeight: 1 }, '01'),
        text(160, 560, 1300, 200, c.title ?? '', { fontSize: 96, bold: true, color: BRAND.white, lineHeight: 1.05 }, 'Título da seção'),
        bar(160, 790),
        text(160, 830, 1200, 120, c.subtitle ?? '', { fontSize: 38, color: '#BFD9D7' }, 'Descrição da seção'),
      ]),
  },
  conteudo: {
    name: 'Título e texto',
    build: (c = {}) =>
      slide(BRAND.white, [
        ...decor.cornerLight(),
        logo(1570, 70, 230),
        text(120, 110, 1380, 130, c.title ?? '', { fontSize: 68, bold: true, lineHeight: 1.05 }, 'Título do slide'),
        bar(120, 262),
        text(120, 320, 1300, 660, c.body ?? '', { fontSize: 38, lineHeight: 1.45 }, 'Digite seu texto aqui'),
      ]),
  },
  duasColunas: {
    name: 'Duas colunas',
    build: (c = {}) =>
      slide(BRAND.white, [
        logo(1570, 70, 230),
        text(120, 110, 1380, 130, c.title ?? '', { fontSize: 68, bold: true, lineHeight: 1.05 }, 'Título do slide'),
        bar(120, 262),
        shape('round', 120, 330, 820, 640, BRAND.greenLight, { locked: true }),
        shape('round', 980, 330, 820, 640, BRAND.teal, { locked: true }),
        text(180, 380, 700, 90, c.leftTitle ?? '', { fontSize: 46, bold: true, color: BRAND.teal }, 'Título da coluna'),
        text(180, 480, 700, 450, c.left ?? '', { fontSize: 34, lineHeight: 1.45 }, 'Texto da coluna'),
        text(1040, 380, 700, 90, c.rightTitle ?? '', { fontSize: 46, bold: true, color: BRAND.green }, 'Título da coluna'),
        text(1040, 480, 700, 450, c.right ?? '', { fontSize: 34, lineHeight: 1.45, color: BRAND.white }, 'Texto da coluna'),
      ]),
  },
  imagemTexto: {
    name: 'Imagem e texto',
    build: (c = {}) =>
      slide(BRAND.white, [
        shape('leafAlt', 0, 120, 900, 960, BRAND.teal, { locked: true }),
        photo(0, 0, 860, 1000, 'leafAlt', 'Foto (duplo clique para escolher)', c.photo || ''),
        logo(1570, 70, 230),
        text(1000, 240, 800, 220, c.title ?? '', { fontSize: 68, bold: true, lineHeight: 1.05, valign: 'bottom' }, 'Título do slide'),
        bar(1000, 490),
        text(1000, 540, 800, 440, c.body ?? '', { fontSize: 36, lineHeight: 1.45 }, 'Digite seu texto aqui'),
      ]),
  },
  numeros: {
    name: 'Números em destaque',
    build: (c = {}) => {
      const items = c.items || [['00%', 'Indicador'], ['00', 'Indicador'], ['00 mil', 'Indicador']];
      const els = [
        logo(1570, 70, 230),
        text(120, 110, 1380, 130, c.title ?? '', { fontSize: 68, bold: true, lineHeight: 1.05 }, 'Título do slide'),
        bar(120, 262),
      ];
      items.forEach(([n, label], i) => {
        const x = 120 + i * 570;
        els.push(shape('round', x, 380, 530, 520, i === 1 ? BRAND.teal : BRAND.greenLight, { locked: true }));
        els.push(text(x + 50, 450, 430, 200, n, { fontSize: 120, bold: true, color: BRAND.green, lineHeight: 1 }, '00'));
        els.push(text(x + 50, 680, 430, 180, label, { fontSize: 36, color: i === 1 ? BRAND.white : BRAND.teal, lineHeight: 1.3 }, 'Descrição'));
      });
      return slide(BRAND.white, els);
    },
  },
  citacao: {
    name: 'Citação / destaque',
    build: (c = {}) =>
      slide(BRAND.teal2, [
        ...decor.cornerDark(),
        text(260, 200, 300, 260, '“', { fontSize: 340, bold: true, color: BRAND.green, lineHeight: 1 }, ''),
        text(260, 400, 1400, 400, c.quote ?? '', { fontSize: 78, bold: true, color: BRAND.white, lineHeight: 1.15 }, 'Frase de destaque'),
        bar(260, 840),
        text(260, 880, 1200, 80, c.author ?? '', { fontSize: 36, color: BRAND.greenSoft }, 'Autor ou fonte'),
      ]),
  },
  encerramento: {
    name: 'Encerramento',
    build: (c = {}) =>
      slide(BRAND.teal, [
        ...decor.cornerDark(),
        logo(660, 230, 600, 'branco'),
        text(260, 530, 1400, 140, c.title ?? 'Obrigado!', { fontSize: 104, bold: true, color: BRAND.white, align: 'center' }, 'Obrigado!'),
        text(260, 680, 1400, 80, c.slogan ?? 'É natural crescer com a gente!', { fontSize: 44, color: BRAND.green, align: 'center', bold: true }, 'Slogan'),
        text(260, 800, 1400, 100, c.contact ?? 'padapagronegocios.com.br', { fontSize: 32, color: '#BFD9D7', align: 'center' }, 'Contato'),
      ]),
  },
  titulo: {
    name: 'Somente título',
    build: (c = {}) =>
      slide(BRAND.white, [
        logo(1570, 70, 230),
        text(120, 110, 1380, 130, c.title ?? '', { fontSize: 68, bold: true, lineHeight: 1.05 }, 'Título do slide'),
        bar(120, 262),
      ]),
  },
  branco: {
    name: 'Em branco',
    build: () => slide(BRAND.white, [logo(1640, 960, 200)]),
  },
};

export const LAYOUT_ORDER = ['capa', 'capaSimples', 'secao', 'conteudo', 'duasColunas', 'imagemTexto', 'numeros', 'citacao', 'encerramento', 'titulo', 'branco'];

// ---- Modelos prontos ----------------------------------------------------

const L = (layout, c) => LAYOUTS[layout].build(c);

export const TEMPLATES = [
  {
    id: 'institucional',
    name: 'Apresentação Institucional',
    tagline: 'Nossa terra mais produtiva.',
    build: (p) => [
      L('capa', { title: 'Apresentação Institucional', subtitle: 'Nossa terra mais produtiva.', photo: p }),
      L('secao', { number: '01', title: 'Quem somos', subtitle: 'PADAP Produtividade Agrícola' }),
      L('conteudo', {
        title: 'Quem somos',
        body: ul([
          'Fundada em 2004, referência em nutrição agrícola no Alto Paranaíba',
          'Soluções integradas: conhecimento especializado, tecnologia e portfólio completo',
          'Parceria de longo prazo com o produtor rural',
          'Compromisso com produtividade, rentabilidade e sustentabilidade',
        ]),
      }),
      L('numeros', { title: 'PADAP em números', items: [['20+', 'anos nutrindo a produtividade'], ['00', 'produtores atendidos'], ['00 mil', 'hectares acompanhados']] }),
      L('duasColunas', {
        title: 'Propósito e atuação',
        leftTitle: 'Nosso propósito',
        left: 'Nutrir a produtividade de quem alimenta o mundo.',
        rightTitle: 'Como atuamos',
        right: ul(['Nutrição vegetal e manejo agronômico', 'Suporte técnico especializado', 'Inovação e parcerias estratégicas']),
      }),
      L('imagemTexto', {
        title: 'Pilares da marca',
        body: ul(['Integridade', 'Parceria', 'Qualidade', 'Inovação', 'Sustentabilidade', 'Compromisso com o cliente']),
      }),
      L('encerramento'),
    ],
  },
  {
    id: 'resultados',
    name: 'Resultados do Campo',
    tagline: 'Dados que cultivam o futuro.',
    build: (p) => [
      L('capa', { title: 'Resultados do Campo', subtitle: 'Dados que cultivam o futuro.', photo: p }),
      L('secao', { number: '01', title: 'Safra 2025/26', subtitle: 'Área, cultura e manejo avaliados' }),
      L('numeros', { title: 'Resultados da safra', items: [['00 sc/ha', 'produtividade média'], ['+00%', 'ganho sobre a testemunha'], ['00 ha', 'área acompanhada']] }),
      L('imagemTexto', {
        title: 'Área demonstrativa',
        body: ul(['Propriedade: nome da fazenda', 'Município / UF', 'Cultura e cultivar', 'Tratamentos avaliados']),
      }),
      L('duasColunas', {
        title: 'Comparativo',
        leftTitle: 'Manejo padrão',
        left: ul(['Produtividade: 00 sc/ha', 'Custo: R$ 00/ha']),
        rightTitle: 'Manejo PADAP',
        right: ul(['Produtividade: 00 sc/ha', 'Custo: R$ 00/ha', 'Retorno: 00%']),
      }),
      L('conteudo', { title: 'Conclusões', body: ul(['Principal resultado obtido', 'Recomendação para a próxima safra', 'Próximos passos']) }),
      L('encerramento'),
    ],
  },
  {
    id: 'planejamento',
    name: 'Planejamento Estratégico',
    tagline: 'Direcionando novas conquistas.',
    build: (p) => [
      L('capa', { title: 'Planejamento Estratégico', subtitle: 'Direcionando novas conquistas.', photo: p }),
      L('conteudo', { title: 'Onde estamos', body: ul(['Cenário atual', 'Principais conquistas do período', 'Desafios identificados']) }),
      L('secao', { number: '01', title: 'Objetivos', subtitle: 'O que queremos alcançar' }),
      L('duasColunas', {
        title: 'Metas e ações',
        leftTitle: 'Metas',
        left: ul(['Meta 1', 'Meta 2', 'Meta 3']),
        rightTitle: 'Ações',
        right: ul(['Ação 1 — responsável e prazo', 'Ação 2 — responsável e prazo', 'Ação 3 — responsável e prazo']),
      }),
      L('numeros', { title: 'Indicadores', items: [['00%', 'crescimento esperado'], ['00', 'novos clientes'], ['00', 'projetos estratégicos']] }),
      L('citacao', { quote: 'É natural crescer com a gente!', author: 'PADAP Produtividade Agrícola' }),
      L('encerramento'),
    ],
  },
  {
    id: 'mercado',
    name: 'Mercado e Oportunidades',
    tagline: 'Conexões para um agro mais forte.',
    build: (p) => [
      L('capa', { title: 'Mercado e Oportunidades', subtitle: 'Conexões para um agro mais forte.', photo: p }),
      L('conteudo', { title: 'Cenário do mercado', body: ul(['Tendências do setor', 'Preços e demanda', 'Clima e safra']) }),
      L('numeros', { title: 'Mercado em números', items: [['R$ 00', 'preço médio da saca'], ['00%', 'variação no período'], ['00 mi t', 'produção estimada']] }),
      L('duasColunas', {
        title: 'Oportunidades e riscos',
        leftTitle: 'Oportunidades',
        left: ul(['Oportunidade 1', 'Oportunidade 2']),
        rightTitle: 'Pontos de atenção',
        right: ul(['Risco 1', 'Risco 2']),
      }),
      L('imagemTexto', { title: 'Como a PADAP pode ajudar', body: ul(['Planejamento nutricional', 'Suporte técnico em campo', 'Parcerias estratégicas']) }),
      L('encerramento'),
    ],
  },
  {
    id: 'inovacao',
    name: 'Inovação que Produz',
    tagline: 'Tecnologia hoje para o amanhã.',
    build: (p) => [
      L('capa', { title: 'Inovação que Produz', subtitle: 'Tecnologia hoje para o amanhã.', photo: p }),
      L('imagemTexto', { title: 'Nova solução', body: 'Descreva a tecnologia, o produto ou o serviço e o problema que ele resolve no campo.' }),
      L('conteudo', { title: 'Como funciona', body: ul(['Etapa 1', 'Etapa 2', 'Etapa 3']) }),
      L('numeros', { title: 'Resultados', items: [['+00%', 'produtividade'], ['-00%', 'custo por hectare'], ['00', 'áreas validadas']] }),
      L('citacao', { quote: 'Inovação está no nosso DNA.', author: 'PADAP Produtividade Agrícola' }),
      L('encerramento'),
    ],
  },
  {
    id: 'sustentabilidade',
    name: 'Sustentabilidade no Agro',
    tagline: 'Produtividade para um futuro melhor.',
    build: (p) => [
      L('capa', { title: 'Sustentabilidade no Agro', subtitle: 'Produtividade para um futuro melhor.', photo: p }),
      L('conteudo', {
        title: 'Nosso compromisso',
        body: ul(['Práticas agrícolas responsáveis', 'Preservação dos recursos naturais', 'Redução do impacto ambiental', 'Segurança alimentar a longo prazo']),
      }),
      L('imagemTexto', { title: 'Na prática', body: 'Mostre aqui um projeto, uma área ou uma prática sustentável aplicada no campo.' }),
      L('numeros', { title: 'Impacto', items: [['00 t', 'CO₂ evitado'], ['00%', 'uso eficiente de insumos'], ['00 ha', 'em manejo sustentável']] }),
      L('duasColunas', {
        title: 'Ambiental, social e econômico',
        leftTitle: 'Ambiental',
        left: ul(['Solo saudável', 'Uso racional de água']),
        rightTitle: 'Social e econômico',
        right: ul(['Rentabilidade do produtor', 'Desenvolvimento regional']),
      }),
      L('encerramento'),
    ],
  },
];

/** Apresentação nova a partir de um modelo (ou em branco). */
export function buildPresentation(templateId, photos = {}) {
  if (!templateId || templateId === 'branco') {
    return { title: 'Apresentação sem título', data: { version: 1, theme: 'branco', slides: [L('capaSimples', {})] } };
  }
  const t = TEMPLATES.find((x) => x.id === templateId);
  return { title: t.name, data: { version: 1, theme: t.id, slides: t.build(photos[t.id] || '') } };
}
