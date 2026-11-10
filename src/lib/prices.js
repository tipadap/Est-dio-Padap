'use strict';

const db = require('../db');

// Tabela de preços da PADAP e indicadores de mercado, mantidos pelo admin em /admin/precos.
// Ficam na tabela settings (chaves próprias, JSON), separados das imagens.
const K_ROWS = 'price_list';
const K_MARKET = 'market';

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v) => {
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
};

function read(key, def) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return def;
  try {
    return JSON.parse(row.value);
  } catch (e) {
    return def;
  }
}

function write(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    JSON.stringify(value)
  );
}

function get() {
  return {
    rows: read(K_ROWS, []),
    market: read(K_MARKET, { ureia: null, map: null, kcl: null, data: '', fonte: '' }),
  };
}

/** Valida e grava (admin). rows: [{produto, marca, embalagem, preco, prazo}], market: {ureia, map, kcl, data, fonte}. */
function save({ rows, market }, userName) {
  const clean = (Array.isArray(rows) ? rows : [])
    .slice(0, 300)
    .map((r) => ({
      produto: str(r && r.produto, 80),
      marca: str(r && r.marca, 60),
      embalagem: str(r && r.embalagem, 40),
      preco: num(r && r.preco),
      prazo: str(r && r.prazo, 30),
    }))
    .filter((r) => r.produto);
  const m = market || {};
  const cleanMarket = {
    ureia: num(m.ureia),
    map: num(m.map),
    kcl: num(m.kcl),
    data: /^\d{4}-\d{2}-\d{2}$/.test(m.data || '') ? m.data : '',
    fonte: str(m.fonte, 120),
  };
  write(K_ROWS, clean);
  write(K_MARKET, cleanMarket);
  write('price_updated', { em: new Date().toISOString(), por: str(userName, 80) });
  return get();
}

function updatedInfo() {
  return read('price_updated', null);
}

module.exports = { get, save, updatedInfo };
