'use strict';

// Banco de imagens embutido no sistema: fotos reais de agro (Unsplash, licença livre para uso
// comercial, sem exigência de crédito). Arquivos em src/public/img/banco (+ mini/ para a grade);
// dados em banco-catalog.json. Aparece junto com as imagens enviadas pelo admin na categoria "banco".
const catalog = require('./banco-catalog.json');

const BASE = '/static/img/banco/';

const items = catalog.map((c) => ({
  id: `bn-${c.file.replace(/\.[a-z]+$/, '')}`,
  category: 'banco',
  builtin: true,
  theme: c.theme,
  title: c.title,
  description: c.theme,
  url: BASE + c.file,
  thumb: `${BASE}mini/${c.file}`,
  source: c.source,
}));

const urls = new Set(items.map((i) => i.url));

module.exports = {
  list: () => items,
  hasUrl: (url) => urls.has(url),
};
