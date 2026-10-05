'use strict';

// Portfólio 2026 da PADAP já embutido no sistema (extraído do PDF oficial).
// Arquivos em src/public/img/portfolio; dados em portfolio-catalog.json.
// Aparece junto com as imagens enviadas pelo admin na categoria "portfolio".
const catalog = require('./portfolio-catalog.json');

const BASE = '/static/img/portfolio/';

const items = catalog.map((c) => ({
  id: `pf-${c.file.replace(/\.[a-z]+$/, '')}`,
  category: 'portfolio',
  builtin: true,
  kind: c.kind, // produto | logo | pagina
  name: c.name,
  brand: c.brand,
  description: c.description,
  title: c.brand && c.kind === 'produto' ? `${c.name} — ${c.brand}` : c.name,
  url: BASE + c.file,
}));

const urls = new Set(items.map((i) => i.url));

module.exports = {
  list: () => items,
  hasUrl: (url) => urls.has(url),
};
