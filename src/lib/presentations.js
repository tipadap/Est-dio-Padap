'use strict';

const crypto = require('crypto');
const db = require('../db');

const LIST_COLS = `p.id, p.owner_id, p.title, p.data, p.team_visible, p.share_token, p.created_at, p.updated_at,
  u.name AS owner_name`;

/** Resumo para a Biblioteca: só o 1º slide vai para o navegador (miniatura). */
function summarize(row) {
  let first = null;
  let count = 0;
  try {
    const data = JSON.parse(row.data);
    first = data.slides[0] || null;
    count = data.slides.length;
  } catch (e) {
    /* dado corrompido: mostra sem miniatura */
  }
  const { data, ...rest } = row;
  return { ...rest, firstSlide: first, slideCount: count };
}

function listMine(userId) {
  return db
    .prepare(
      `SELECT ${LIST_COLS} FROM presentations p JOIN users u ON u.id = p.owner_id
       WHERE p.owner_id = ? ORDER BY p.updated_at DESC`
    )
    .all(userId)
    .map(summarize);
}

function listTeam(userId) {
  return db
    .prepare(
      `SELECT ${LIST_COLS} FROM presentations p JOIN users u ON u.id = p.owner_id
       WHERE p.team_visible = 1 AND p.owner_id <> ? ORDER BY p.updated_at DESC`
    )
    .all(userId)
    .map(summarize);
}

function get(id) {
  return db
    .prepare(`SELECT ${LIST_COLS} FROM presentations p JOIN users u ON u.id = p.owner_id WHERE p.id = ?`)
    .get(id);
}

function getByToken(token) {
  if (!token || typeof token !== 'string') return null;
  return db
    .prepare(`SELECT ${LIST_COLS} FROM presentations p JOIN users u ON u.id = p.owner_id WHERE p.share_token = ?`)
    .get(token);
}

function create(ownerId, title, data) {
  const info = db
    .prepare('INSERT INTO presentations (owner_id, title, data) VALUES (?, ?, ?)')
    .run(ownerId, title, JSON.stringify(data));
  return Number(info.lastInsertRowid);
}

function save(id, { title, data }) {
  const sets = [];
  const args = [];
  if (title !== undefined) {
    sets.push('title = ?');
    args.push(title);
  }
  if (data !== undefined) {
    sets.push('data = ?');
    args.push(JSON.stringify(data));
  }
  if (!sets.length) return;
  db.prepare(`UPDATE presentations SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...args,
    id
  );
}

function setTeamVisible(id, visible) {
  db.prepare('UPDATE presentations SET team_visible = ? WHERE id = ?').run(visible ? 1 : 0, id);
}

function setPublic(id, isPublic) {
  const token = isPublic ? crypto.randomBytes(18).toString('base64url') : null;
  db.prepare('UPDATE presentations SET share_token = ? WHERE id = ?').run(token, id);
  return token;
}

function remove(id) {
  db.prepare('DELETE FROM presentations WHERE id = ?').run(id);
}

/** Pode editar: dono ou admin. Pode ver: quem edita, ou qualquer um se estiver visível à equipe. */
function canEdit(user, pres) {
  return !!(user && pres && (pres.owner_id === user.id || user.is_admin));
}
function canView(user, pres) {
  return !!(user && pres && (canEdit(user, pres) || pres.team_visible));
}

module.exports = {
  listMine,
  listTeam,
  get,
  getByToken,
  create,
  save,
  setTeamVisible,
  setPublic,
  remove,
  canEdit,
  canView,
};
