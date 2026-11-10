'use strict';

/**
 * Migrações do banco (SQLite), em ordem. A versão aplicada fica em PRAGMA user_version.
 *
 * Para mudar o banco: ACRESCENTE uma migração no fim da lista (nunca edite uma que já foi
 * publicada), com o próximo número. Ex.:
 *   { version: 2, name: 'apresentações: coluna pasta', up: (db) => db.exec("ALTER TABLE presentations ADD COLUMN folder TEXT NOT NULL DEFAULT ''") },
 *
 * Cada migração roda numa transação. Antes de aplicar migrações num banco que já tem dados,
 * é feita uma cópia em DATA_DIR/backups/antes-migracao-vN.db.
 */
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
  {
    version: 1,
    name: 'estrutura inicial',
    // Idêntica às tabelas que já existiam antes das migrações (por isso o IF NOT EXISTS:
    // bancos antigos, com user_version 0, passam por aqui sem mudar nada).
    up: (db) =>
      db.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id                    INTEGER PRIMARY KEY AUTOINCREMENT,
          email                 TEXT NOT NULL UNIQUE COLLATE NOCASE,
          name                  TEXT NOT NULL DEFAULT '',
          password_hash         TEXT NOT NULL,
          is_admin              INTEGER NOT NULL DEFAULT 0,
          is_active             INTEGER NOT NULL DEFAULT 1,
          must_change_password  INTEGER NOT NULL DEFAULT 1,
          created_at            TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
        );

        -- data = JSON com os slides (ver src/lib/sanitize.js para o formato).
        CREATE TABLE IF NOT EXISTS presentations (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          title         TEXT NOT NULL,
          data          TEXT NOT NULL,
          team_visible  INTEGER NOT NULL DEFAULT 0,
          share_token   TEXT UNIQUE,
          created_at    TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_presentations_owner ON presentations(owner_id);

        -- category: banco (banco de imagens), portfolio (produtos), user (enviadas pelo usuário).
        CREATE TABLE IF NOT EXISTS assets (
          id             INTEGER PRIMARY KEY AUTOINCREMENT,
          category       TEXT NOT NULL CHECK (category IN ('banco', 'portfolio', 'user')),
          owner_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
          filename       TEXT NOT NULL,
          title          TEXT NOT NULL DEFAULT '',
          created_at     TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_assets_category ON assets(category);

        -- Preferências e dados do sistema (imagem do login, banner, fotos dos modelos, preços).
        CREATE TABLE IF NOT EXISTS settings (
          key    TEXT PRIMARY KEY,
          value  TEXT NOT NULL
        );

        -- Histórico de versões das apresentações (ver src/lib/versions.js).
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

        -- Links de redefinição de senha: só o hash do token, 1 hora, uso único (src/lib/resets.js).
        CREATE TABLE IF NOT EXISTS password_resets (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash  TEXT NOT NULL UNIQUE,
          expires_at  TEXT NOT NULL,
          used_at     TEXT
        );
      `),
  },
];

const LATEST = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Aplica as migrações pendentes. Devolve { from, to, applied: [nomes] }.
 * backupDir: onde guardar a cópia de segurança antes de migrar um banco com dados.
 */
function migrate(db, { backupDir, log = console.log } = {}) {
  const latest = MIGRATIONS[MIGRATIONS.length - 1].version;
  const from = db.pragma('user_version', { simple: true });
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (from > latest) {
    // Banco de uma versão mais nova do sistema (ex.: depois de voltar um deploy). Não mexe.
    log(`Aviso: o banco está na versão ${from}, mais nova que este sistema (${latest}).`);
    return { from, to: from, applied: [] };
  }
  if (!pending.length) return { from, to: from, applied: [] };

  const hasData = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'users'").get();
  if (hasData && backupDir && from > 0) {
    fs.mkdirSync(backupDir, { recursive: true });
    const dest = path.join(backupDir, `antes-migracao-v${from}-para-v${latest}.db`);
    fs.rmSync(dest, { force: true });
    db.prepare('VACUUM INTO ?').run(dest);
    log(`Cópia de segurança antes das migrações: ${dest}`);
  }

  for (const m of pending) {
    db.transaction(() => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    })();
    log(`Migração ${m.version} aplicada: ${m.name}`);
  }
  return { from, to: latest, applied: pending.map((m) => m.name) };
}

module.exports = { migrate, MIGRATIONS, LATEST };
