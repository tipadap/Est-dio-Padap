'use strict';

const db = require('../db');

const PUBLIC_COLS = 'id, email, name, is_admin, is_active, must_change_password, created_at, updated_at';

function getById(id) {
  return db.prepare(`SELECT ${PUBLIC_COLS} FROM users WHERE id = ?`).get(id);
}

function getAuthRecordByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim());
}

function getPasswordHash(id) {
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(id);
  return row ? row.password_hash : null;
}

function list() {
  return db.prepare(`SELECT ${PUBLIC_COLS} FROM users ORDER BY is_active DESC, name COLLATE NOCASE`).all();
}

function emailTaken(email, exceptId = 0) {
  return !!db.prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?').get(email, exceptId);
}

function create({ email, name, passwordHash, isAdmin = false, mustChange = true }) {
  const info = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, is_admin, must_change_password)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(email, name, passwordHash, isAdmin ? 1 : 0, mustChange ? 1 : 0);
  return info.lastInsertRowid;
}

function update(id, { email, name, isAdmin }) {
  db.prepare(
    `UPDATE users SET email = ?, name = ?, is_admin = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(email, name, isAdmin ? 1 : 0, id);
}

function setActive(id, active) {
  db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?`).run(active ? 1 : 0, id);
}

function setPassword(id, passwordHash, mustChange) {
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(passwordHash, mustChange ? 1 : 0, id);
}

function countActiveAdmins() {
  return db.prepare('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1 AND is_active = 1').get().n;
}

module.exports = {
  getById,
  getAuthRecordByEmail,
  getPasswordHash,
  list,
  emailTaken,
  create,
  update,
  setActive,
  setPassword,
  countActiveAdmins,
};
