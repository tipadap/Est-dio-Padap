'use strict';

const db = require('../db');

// Chaves aceitas. tpl:<id> = foto padrão do modelo pronto <id>.
const TEMPLATE_IDS = ['institucional', 'resultados', 'planejamento', 'mercado', 'inovacao', 'sustentabilidade'];
const KEYS = ['login_bg', 'home_banner', ...TEMPLATE_IDS.map((t) => `tpl:${t}`)];

function get(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
}

function all() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

function set(key, value) {
  if (!KEYS.includes(key)) throw new Error(`Configuração desconhecida: ${key}`);
  if (value === null || value === '') {
    db.prepare('DELETE FROM settings WHERE key = ?').run(key);
  } else {
    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }
}

/** Remove qualquer configuração que aponte para uma imagem apagada. */
function clearValue(value) {
  db.prepare('DELETE FROM settings WHERE value = ?').run(String(value));
}

module.exports = { KEYS, TEMPLATE_IDS, get, all, set, clearValue };
