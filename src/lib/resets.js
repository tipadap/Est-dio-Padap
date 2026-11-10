'use strict';

const crypto = require('crypto');
const db = require('../db');

// Tokens de redefinição de senha: guardamos só o hash (quem lê o banco não consegue
// usar o link), validade de 1 hora e uso único.
const TTL_MIN = 60;

// Tabela password_resets: src/migrations.js.

const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function create(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('DELETE FROM password_resets WHERE user_id = ? OR expires_at < datetime(\'now\')').run(userId);
  db.prepare(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+${TTL_MIN} minutes'))`).run(
    userId,
    sha(token)
  );
  return token;
}

/** Devolve o registro se o token é válido (não usado e dentro do prazo). */
function check(token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  return db
    .prepare(`SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > datetime('now')`)
    .get(sha(token));
}

function consume(id) {
  db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`).run(id);
}

module.exports = { create, check, consume, TTL_MIN };
