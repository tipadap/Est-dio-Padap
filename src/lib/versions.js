'use strict';

const db = require('../db');

// Histórico de versões: antes de salvar por cima, guarda o estado anterior —
// no máximo uma cópia a cada INTERVAL_MIN minutos e até MAX_PER_PRES por apresentação.
const INTERVAL_MIN = 10;
const MAX_PER_PRES = 50;

db.exec(`
  CREATE TABLE IF NOT EXISTS presentation_versions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    presentation_id  INTEGER NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    data             TEXT NOT NULL,
    author_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    reason           TEXT NOT NULL DEFAULT 'auto',
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_versions_pres ON presentation_versions(presentation_id, id);
`);

function insert(pres, authorId, reason) {
  db.prepare('INSERT INTO presentation_versions (presentation_id, title, data, author_id, reason) VALUES (?, ?, ?, ?, ?)').run(
    pres.id,
    pres.title,
    pres.data,
    authorId,
    reason
  );
  // mantém só as mais recentes
  db.prepare(
    `DELETE FROM presentation_versions WHERE presentation_id = ? AND id NOT IN
     (SELECT id FROM presentation_versions WHERE presentation_id = ? ORDER BY id DESC LIMIT ?)`
  ).run(pres.id, pres.id, MAX_PER_PRES);
}

/**
 * Chamado antes de sobrescrever `pres` (linha atual do banco). Guarda uma cópia se a
 * última versão tiver mais de INTERVAL_MIN minutos (ou não houver nenhuma).
 */
function snapshotBeforeSave(pres, authorId) {
  const last = db
    .prepare(
      `SELECT (julianday('now') - julianday(created_at)) * 1440 AS minutes
       FROM presentation_versions WHERE presentation_id = ? ORDER BY id DESC LIMIT 1`
    )
    .get(pres.id);
  if (last && last.minutes < INTERVAL_MIN) return false;
  insert(pres, authorId, 'auto');
  return true;
}

function list(presId) {
  return db
    .prepare(
      `SELECT v.id, v.title, v.reason, v.created_at, u.name AS author_name,
       json_array_length(v.data, '$.slides') AS slide_count
       FROM presentation_versions v LEFT JOIN users u ON u.id = v.author_id
       WHERE v.presentation_id = ? ORDER BY v.id DESC`
    )
    .all(presId);
}

function get(presId, versionId) {
  return db.prepare('SELECT * FROM presentation_versions WHERE presentation_id = ? AND id = ?').get(presId, versionId);
}

/** Restaura: guarda o estado atual como versão ("antes de restaurar") e volta à versão escolhida. */
function restore(pres, version, authorId) {
  db.transaction(() => {
    insert(pres, authorId, 'restore');
    db.prepare(`UPDATE presentations SET title = ?, data = ?, updated_at = datetime('now') WHERE id = ?`).run(
      version.title,
      version.data,
      pres.id
    );
  })();
}

module.exports = { snapshotBeforeSave, list, get, restore, INTERVAL_MIN, MAX_PER_PRES };
