'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');
const config = require('../config');

const url = (filename) => `/uploads/${filename}`;
const withUrl = (row) => row && { ...row, url: url(row.filename) };

/** Banco e Portfólio são compartilhados; "user" mostra só as imagens do próprio usuário. */
function list(category, userId) {
  const rows =
    category === 'user'
      ? db.prepare("SELECT * FROM assets WHERE category = 'user' AND owner_id = ? ORDER BY id DESC").all(userId)
      : db.prepare('SELECT * FROM assets WHERE category = ? ORDER BY id DESC').all(category);
  return rows.map(withUrl);
}

function get(id) {
  return withUrl(db.prepare('SELECT * FROM assets WHERE id = ?').get(id));
}

function create({ category, ownerId, filename, title }) {
  const info = db
    .prepare('INSERT INTO assets (category, owner_id, filename, title) VALUES (?, ?, ?, ?)')
    .run(category, ownerId, filename, title);
  return get(info.lastInsertRowid);
}

function rename(id, title) {
  db.prepare('UPDATE assets SET title = ? WHERE id = ?').run(title, id);
}

/**
 * Remove o registro e o arquivo. Apresentações que usavam a imagem passam a mostrar
 * o espaço vazio de imagem (o navegador trata o 404).
 */
function remove(asset) {
  db.prepare('DELETE FROM assets WHERE id = ?').run(asset.id);
  fs.rm(path.join(config.paths.uploads, path.basename(asset.filename)), { force: true }, () => {});
}

module.exports = { list, get, create, rename, remove, url };
